# D:\StudioProjects\cordial\backend\main.py
"""
FastAPI backend that
  • talks to Gemini for chat
  • calls jira_create_issue on a local mcp-atlassian server (HTTP+SSE)
"""

import os
import json
import asyncio
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import google.generativeai as genai
from mcp import ClientSession
from mcp.client.sse import sse_client

# ──────────────────────────────────────────────────────────────────────
#  Gemini setup
# ──────────────────────────────────────────────────────────────────────
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = "gemini-1.5-flash-latest"
model = None

if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(MODEL_NAME)
        print(f"[Gemini] Ready with model {MODEL_NAME}")
    except Exception as e:
        print(f"[Gemini] WARNING – failed to init: {e}")
else:
    print("[Gemini] WARNING – GEMINI_API_KEY missing, /api/chat disabled")

# ──────────────────────────────────────────────────────────────────────
#  FastAPI app & CORS
# ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Cordial Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────
#  MCP connection parameters
# ──────────────────────────────────────────────────────────────────────
LOCAL_MCP_BASE_URL = "http://localhost:9000"
LOCAL_MCP_SSE_URL  = f"{LOCAL_MCP_BASE_URL}/sse"   # SSE stream (=down-channel)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create one persistent MCP ClientSession for the whole app."""
    async with sse_client(LOCAL_MCP_SSE_URL) as (reader, writer):
        async with ClientSession(reader, writer) as sess:
            await sess.initialize()         # handshake
            app.state.mcp = sess
            print("[MCP] Connected and initialised")
            yield
    print("[MCP] Shutdown complete")

app.router.lifespan_context = lifespan

# ──────────────────────────────────────────────────────────────────────
#  Pydantic request bodies
# ──────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str

class CreateJiraTaskRequest(BaseModel):
    task_summary: str
    jira_project_key: str
    issue_type: Optional[str] = "Task"

# ──────────────────────────────────────────────────────────────────────
#  Endpoints
# ──────────────────────────────────────────────────────────────────────
@app.post("/api/chat", tags=["Chat"])
async def chat_with_gemini(req: ChatRequest):
    if not model:
        raise HTTPException(status_code=503, detail="Gemini not initialised")
    try:
        resp = model.generate_content(req.message)
        if not resp.parts:
            raise HTTPException(status_code=500,
                                detail="Gemini returned no content")
        return {"response": resp.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {e}") from e

@app.post("/api/create-jira-task", tags=["Jira"])
async def create_jira_task(req: CreateJiraTaskRequest):
    session: ClientSession = app.state.mcp
    if not session:
        raise HTTPException(status_code=503, detail="MCP session unavailable")

    payload = {
        "project_key": req.jira_project_key.upper(),
        "summary"    : req.task_summary,
        "issue_type" : req.issue_type,
    }

    try:
        result = await session.call_tool("jira_create_issue", payload)
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500,
                            detail=f"MCP/jira_create_issue failed: {e}") from e

@app.get("/", tags=["Status"])
async def root():
    return {"message": "Cordial backend running"}

# ──────────────────────────────────────────────────────────────────────
#  Optional: run with `python backend/main.py`
# ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
