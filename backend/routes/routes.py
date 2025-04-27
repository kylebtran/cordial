from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.models import Project, User
#from services.llm_service import generate_tasks_from_manifest
from services.matching_service import match_tasks_to_users
from constants import USERS
from db.mongo import db
import logging
import uuid
from datetime import datetime
from typing import List
from services.llm_service import generate_project_structure_from_manifest
#from services.jira_project_service import create_epic, create_story, create_task
from services.jira_project_service import create_project_in_jira
from services.rag_service import generate_answer_from_query
from db.vector_ops import push_document_embedding
from services.rag_chat import _simple_chunk, _embed, _store_chunks, vectorstore
import weaviate
import google.generativeai as genai
from langchain_community.vectorstores import Weaviate as LCWeaviate

router = APIRouter()

"""
@router.post("/projects", response_model=Project)
async def create_project(
    admin_id: str = Form(...),
    project_name: str = Form(...),
    project_description: str = Form(...),
    manifest_file: UploadFile = File(...)
):
    try:
        contents = await manifest_file.read()
        manifest_text = contents.decode("utf-8")

        tasks = await generate_tasks_from_manifest(manifest_text)
        tasks = await match_tasks_to_users(tasks, USERS)

        project = Project(
            id=str(uuid.uuid4()),
            name=project_name,
            description=project_description,
            tasks=tasks,
            created_at=datetime.now(),
            admin_id=admin_id
        )

        await db.projects.insert_one(project.model_dump())
        return project
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating project: {str(e)}")
"""

@router.post("/projects", response_model=Project)
async def create_project(
    admin_id: str = Form(...),
    project_name: str = Form(...),
    project_description: str = Form(...),
    manifest_file: UploadFile = File(...)
):
    try:
        contents = await manifest_file.read()
        manifest_text = contents.decode("utf-8")

        # NEW: generate full hierarchy
        epics, stories, tasks = await generate_project_structure_from_manifest(manifest_text)

        # Matching only affects tasks
        tasks = await match_tasks_to_users(tasks, USERS)

        # NEW: your Project now should include epics, stories, tasks
        project = {
            "id": str(uuid.uuid4()),
            "name": project_name,
            "description": project_description,
            "epics": [epic.model_dump() for epic in epics],
            "stories": [story.model_dump() for story in stories],
            "tasks": [task.model_dump() for task in tasks],
            "created_at": datetime.now(),
            "admin_id": admin_id,
        }

        await db.projects.insert_one(project)
        return project
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating project: {str(e)}")


@router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.get("/users", response_model=List[User])
async def get_users():
    return USERS

@router.get("/users/{user_id}/tasks")
async def get_user_tasks(user_id: str):
    projects = await db.projects.find({}).to_list(length=100)

    user_tasks = []
    for project in projects:
        for task in project.get("tasks", []):
            if task.get("assigned_user") == user_id:
                task["project_id"] = project["id"]
                task["project_name"] = project["name"]
                user_tasks.append(task)
    
    return user_tasks


@router.post("/jira/populate-project")
async def create_jira_project_from_existing_db(
    project_name: str = Form(...)
):
    try:
        logging.info(f" Received request to create Jira project for: {project_name}")

        # 1. Check MongoDB if project exists
        project = await db.projects.find_one({"name": project_name})
        if not project:
            logging.error(f" Project '{project_name}' not found in MongoDB.")
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found in database.")

        logging.info(f" Found project '{project_name}' in MongoDB.")

        epics = project.get("epics", [])
        stories = project.get("stories", [])
        tasks = project.get("tasks", [])

        if not epics:
            logging.warning(f" No Epics found for project '{project_name}'. Proceeding with empty epics.")
        if not stories:
            logging.warning(f" No Stories found for project '{project_name}'. Proceeding with empty stories.")
        if not tasks:
            logging.warning(f" No Tasks found for project '{project_name}'. Proceeding with empty tasks.")

        # 2. Create Jira Project
        logging.info(f"Creating Jira project '{project_name}'...")
        project_key = await create_project_in_jira(project_name, description="Auto-created from existing MongoDB project")
        logging.info(f"Jira project created with key '{project_key}'.")

        # 3. Create Epics
        epic_mapping = {}
        for epic in epics:
            try:
                epic_key = await create_epic(project_key, epic["title"], epic["description"])
                epic_mapping[epic["id"]] = epic_key
                logging.info(f" Created Epic '{epic['title']}' with Jira key '{epic_key}'.")
            except Exception as e:
                logging.error(f"Failed to create Epic '{epic['title']}': {str(e)}")

        # 4. Create Stories linked to Epics
        story_mapping = {}
        for story in stories:
            try:
                epic_key = epic_mapping.get(story["epic_id"])
                if epic_key:
                    story_key = await create_story(project_key, story["title"], story["description"], epic_key)
                    story_mapping[story["id"]] = story_key
                    logging.info(f"Created Story '{story['title']}' linked to Epic '{epic_key}'.")
                else:
                    logging.warning(f"Could not find Epic mapping for Story '{story['title']}'.")
            except Exception as e:
                logging.error(f"Failed to create Story '{story['title']}': {str(e)}")

        # 5. Create Tasks
        for task in tasks:
            try:
                await create_task(project_key, task["title"], task["description"])
                logging.info(f"Created Task '{task['title']}'.")
            except Exception as e:
                logging.error(f"Failed to create Task '{task['title']}': {str(e)}")

        return {"message": f"Successfully created Jira project '{project_key}' and populated it from MongoDB!"}

    except Exception as e:
        logging.exception("Unhandled error while populating Jira project:")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def chat_endpoint(query: str):
    """
    Accepts a user query and returns a RAG-generated project answer.
    """
    try:
        answer = generate_answer_from_query(query)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating answer: {str(e)}")

@router.post("/upload-document")
async def upload_document(
    project_id: str = Form(...),
    user_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Upload a documentation file and embed its content into the vector database.
    """
    try:
        content_bytes = await file.read()
        document_text = content_bytes.decode("utf-8")  # Assuming text/markdown file for now
        
        metadata = {
            "filename": file.filename,
            "uploaded_by": user_id,
            "project_id": project_id,
            "type": "document"
        }
        
        await push_document_embedding(document_text, metadata)
        return {"message": "Document uploaded and embedded successfully."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload document: {str(e)}")

# ---------------------------------------------------------------------------
# Main synchronous chat endpoint
# ---------------------------------------------------------------------------

@router.post("/api/rag/chat")
async def rag_chat(
    message: str = Form(...),
    projectId: str = Form(...),
    userId: str = Form(...),
    file: UploadFile | None = File(None),
):
    """Single‑shot RAG Q&A. Accepts optional file ≤1 MB, embeds & answers inline."""

    # ---------------------------------------------------------------------
    # 1. Optional file ingestion
    # ---------------------------------------------------------------------
    if file is not None:
        if file.size is not None and file.size > 1_000_000:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                detail="File exceeds 1 MB limit")
        raw_bytes = await file.read()
        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = raw_bytes.decode("latin-1", errors="ignore")

        chunks = _simple_chunk(text)  # // TODO: replace with sentence/token splitter
        meta_base = {
            "project_id": projectId,
            "filename": file.filename or "upload",
            "uploader_id": userId,
        }
        await _store_chunks(chunks, meta_base)

    # ---------------------------------------------------------------------
    # 2. Similarity search (project‑scoped)
    # ---------------------------------------------------------------------
    filter_kw = {"path": ["project_id"], "operator": "Equal", "valueString": projectId}

    query_vec = await _embed(message)    # ✅ First embed the user query
    docs = vectorstore.similarity_search_by_vector(  # ✅ Use the correct function
        embedding=query_vec,
        k=5,
        filters=filter_kw,
    )

    context_blocks = [d.page_content for d in docs]
    citation_ids = [d.metadata.get("chunk_id") for d in docs]

    if not context_blocks:
        note = "_Note: context is limited; answer may be incomplete._\n\n"
    else:
        note = ""

    prompt = textwrap.dedent(f"""
        You are an intelligent project assistant. Provide clear, actionable answers. Quote filenames when useful.

        {note}Context:
        {"\n\n".join(context_blocks) if context_blocks else "<empty>"}

        Question:
        {message}
        """)

    # ---------------------------------------------------------------------
    # 3. Gemini chat completion
    # ---------------------------------------------------------------------
    chat_model = genai.GenerativeModel(model_name=CHAT_MODEL)
    try:
        rsp = chat_model.generate_content(prompt)
        answer_text = rsp.text if hasattr(rsp, "text") else rsp.candidates[0].content.parts[0].text  # type: ignore
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {e}")

    # ---------------------------------------------------------------------
    # 4. Return JSON answer (synchronous)
    # ---------------------------------------------------------------------
    return JSONResponse(
        {
            "answer": answer_text.strip(),
            "citations": citation_ids,
        }
    )

__all__ = ["router"]

