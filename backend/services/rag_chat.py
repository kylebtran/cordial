from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from fastapi.responses import JSONResponse
import os, io, re, uuid, asyncio, textwrap
from typing import List, Dict

import google.generativeai as genai
import weaviate
from langchain_community.vectorstores import Weaviate as LCWeaviate

# ─── Environment -----------------------------------------------------------
WEAVIATE_URL = os.getenv("WEAVIATE_URL")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY")
PROJECTDOCS_CLASS = os.getenv("WEAVIATE_CLASS", "ProjectDocs")

EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "text-embedding-004")  # GA embed
CHAT_MODEL = os.getenv("GEMINI_CHAT_MODEL", "gemini-1.5-flash-latest")

# Configure Gemini once globally
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# ─── Weaviate ----------------------------------------------------------------
client = weaviate.Client(
    url=WEAVIATE_URL,
    auth_client_secret=weaviate.AuthApiKey(WEAVIATE_API_KEY),
)

# LangChain wrapper to simplify similarity search
vectorstore = LCWeaviate(
    client=client,
    index_name=PROJECTDOCS_CLASS,
    text_key="text",
    by_text=False,  # external embeddings
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CHUNK_SIZE = 1000  # chars
_BLANKLINE_RE = re.compile(r"\n{2,}")


def _simple_chunk(text: str) -> List[str]:
    """Split on blank lines, then hard‑cap to _CHUNK_SIZE chars."""
    raw_parts = _BLANKLINE_RE.split(text)
    chunks: List[str] = []
    for part in raw_parts:
        part = part.strip()
        if not part:
            continue
        while len(part) > _CHUNK_SIZE:
            chunks.append(part[:_CHUNK_SIZE])
            part = part[_CHUNK_SIZE:]
        if part:
            chunks.append(part)
    return chunks


async def _embed(text: str) -> List[float]:
    resp = genai.embed_content(
        model=EMBED_MODEL,
        content=text,
        task_type="SEMANTIC_SIMILARITY",
    )
    return resp["embedding"] if isinstance(resp, dict) else resp.embedding  # type: ignore


async def _store_chunks(chunks: List[str], meta_template: Dict):
    """Embed & store each chunk. meta_template will be copied / updated with chunk_id."""
    to_add = []
    for idx, ch in enumerate(chunks):
        vec = await _embed(ch)
        meta = meta_template | {"chunk_id": f"{meta_template['filename']}::chunk{idx}"}
        to_add.append({"vector": vec, "text": ch, "metadata": meta})

    # Batch insert via Weaviate native client for speed
    with client.batch as batch:
        for item in to_add:
            batch.add_data_object(
                data_object=item["metadata"],
                class_name=PROJECTDOCS_CLASS,
                vector=item["vector"],
            )


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
    docs = vectorstore.similarity_search(
        query=message,
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
