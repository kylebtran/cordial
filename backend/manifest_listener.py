import os
import json
import asyncio
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from google.cloud import storage
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
import requests
from bson import ObjectId
from dotenv import load_dotenv
from jira_helpers import generate_project_structure_from_manifest, populate_jira_project, get_jira_api_key  # Import the API key function

# Load environment variables
load_dotenv()  # This is key - it wasn't loading the .env file properly

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = "test"
PROJECTFILES_COLLECTION = "projectFiles"
print(f"[DEBUG] Connecting to MongoDB: {MONGO_URI}")
mongo_client = AsyncIOMotorClient(MONGO_URI)
db = mongo_client[DB_NAME]
project_files_collection = db[PROJECTFILES_COLLECTION]
projects_collection = db["projects"]

# Google Cloud Storage Configuration
storage_client = storage.Client.from_service_account_json("../frontend/key.json")

# Store active monitoring tasks
active_monitors = {}

# FastAPI Setup
app = FastAPI()

class ProjectCreated(BaseModel):
    projectId: str

async def monitor_for_manifest_file(project_id: str):
    """
    Poll for manifest files periodically instead of using change streams
    """
    print(f"[DEBUG] Starting monitor for project {project_id}")
    
    start_time = datetime.fromtimestamp(0)  # Start from Unix epoch to find anything
    
    try:
        server_info = await mongo_client.server_info()
        print(f"[DEBUG] Connected to MongoDB: {server_info.get('version', 'unknown version')}")
    except Exception as e:
        print(f"[DEBUG] Failed to connect to MongoDB: {str(e)}")
    
    collections = await db.list_collection_names()
    print(f"[DEBUG] Available collections: {collections}")
    
    poll_count = 0
    while project_id in active_monitors:
        poll_count += 1
        try:
            query = {
                "projectId": ObjectId(project_id),
                "filename": {"$regex": r"\.txt$"}
            }
            
            print(f"[DEBUG] Poll #{poll_count} - Executing query: {query}")
            
            count = await project_files_collection.count_documents(query)
            print(f"[DEBUG] Found {count} matching documents")
            
            if count > 0:
                cursor = project_files_collection.find(query).sort("createdAt", 1)
                
                file_found = False
                async for file_metadata in cursor:
                    file_found = True
                    print(f"[DEBUG] Processing file metadata: {file_metadata}")
                    print(f"Found manifest file: {file_metadata.get('filename', 'unknown')}")
                    
                    if 'publicUrl' not in file_metadata:
                        print(f"[DEBUG] No publicUrl found in file metadata")
                        continue
                    
                    download_url = file_metadata['publicUrl']
                    print(f"[DEBUG] Downloading from URL: {download_url}")
                    file_content = download_file_from_gcs(download_url)
                    
                    print("[DEBUG] Manifest file downloaded, starting Jira population process.")
                    # Get Jira API token here in the listener
                    jira_api_token = get_jira_api_key()  
                    await populate_jira_with_manifest(file_content, project_id, jira_api_token)
                    
                    active_monitors.pop(project_id, None)
                    print(f"Monitoring ended for project {project_id}")
                    return
                
                if not file_found:
                    print(f"[DEBUG] Cursor returned no documents despite count={count}")
            
            if poll_count % 10 == 1:
                print(f"[DEBUG] Checking for ANY files for this project")
                any_files_query = {"projectId": ObjectId(project_id)}
                any_count = await project_files_collection.count_documents(any_files_query)
                print(f"[DEBUG] Found {any_count} total files for this project")
                
                if any_count > 0:
                    async for doc in project_files_collection.find(any_files_query).limit(3):
                        print(f"[DEBUG] Sample file: {doc.get('filename', 'unknown')} - Created: {doc.get('createdAt', 'unknown')}")
                else:
                    total_count = await project_files_collection.count_documents({})
                    print(f"[DEBUG] Total documents in collection: {total_count}")
            
            if poll_count > 5:
                start_time = datetime.utcnow()
            
            print(f"[DEBUG] Sleeping for 5 seconds before next poll")
            await asyncio.sleep(5)
            
        except Exception as e:
            print(f"[DEBUG] Error in monitor loop: {str(e)}")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(5)

def download_file_from_gcs(url: str) -> str:
    """Download file content from Google Cloud Storage"""
    try:
        print(f"[DEBUG] Attempting to download from: {url}")
        response = requests.get(url)
        response.raise_for_status()
        content = response.text
        print(f"[DEBUG] Successfully downloaded {len(content)} bytes")
        return content
    except Exception as e:
        print(f"[DEBUG] Error downloading file from GCS: {str(e)}")
        import traceback
        traceback.print_exc()
        return ""

async def populate_jira_with_manifest(file_content: str, project_id: str, jira_api_token: str):
    """Populate Jira with epics, stories, and tasks from the manifest"""
    print("[DEBUG] Starting to process the manifest into epics, stories, and tasks...")
    epics, stories, tasks = await generate_project_structure_from_manifest(file_content)
    
    print("[DEBUG] Populating Jira with the generated epics, stories, and tasks.")
    populate_jira_project(epics, stories, tasks, project_id, jira_api_token)
    print("[DEBUG] Jira population process completed.")

@app.post("/process-manifest/")
async def project_created(project: ProjectCreated, background_tasks: BackgroundTasks):
    """Endpoint to start monitoring for a project's manifest file"""
    project_id = project.projectId
    print(f"Project {project_id} created, now monitoring for manifest file...")
    
    if project_id in active_monitors:
        active_monitors.pop(project_id, None)
    
    active_monitors[project_id] = True
    
    background_tasks.add_task(monitor_for_manifest_file, project_id)
    
    return {"status": "monitoring_started", "project_id": project_id}

@app.get("/status/")
async def get_monitoring_status():
    """Get status of all active monitoring tasks"""
    return {
        "active_monitors": list(active_monitors.keys()),
        "count": len(active_monitors)
    }

@app.delete("/stop-monitoring/{project_id}")
async def stop_monitoring(project_id: str):
    """Stop monitoring a specific project"""
    if project_id in active_monitors:
        active_monitors.pop(project_id)
        return {"status": "stopped", "project_id": project_id}
    return {"status": "not_found", "project_id": project_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
