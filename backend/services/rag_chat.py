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
    with client.batch as batch:
        for idx, ch in enumerate(chunks):
            vec = await _embed(ch)
            chunk_meta = meta_template.copy()
            chunk_meta["chunk_id"] = f"{meta_template['filename']}::chunk{idx}"
            batch.add_data_object(
                data_object={
                    **chunk_meta,
                    "text": ch,
                },
                class_name=PROJECTDOCS_CLASS,
                vector=vec,
            )
        batch.flush()  # force sending batch and surfacing any errors




