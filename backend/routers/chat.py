from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..services.gemini_service import GeminiService

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatMessage(BaseModel):
    message: str
    context: Optional[str] = None

class ChatResponse(BaseModel):
    response: str

@router.post("/send", response_model=ChatResponse)
async def send_message(chat_message: ChatMessage):
    try:
        gemini_service = GeminiService()
        response = await gemini_service.send_message(
            message=chat_message.message,
            context=chat_message.context
        )
        return ChatResponse(response=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reset")
async def reset_chat():
    try:
        gemini_service = GeminiService()
        await gemini_service.reset_chat()
        return {"message": "Chat history reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 