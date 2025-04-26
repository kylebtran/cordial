import google.generativeai as genai
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

load_dotenv()

class GeminiService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set")
        
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-pro')
        self.chat = self.model.start_chat(history=[])

    async def send_message(self, message: str, context: Optional[str] = None) -> str:
        """
        Send a message to Gemini and get a response.
        If context is provided, it will be prepended to the message.
        """
        try:
            if context:
                full_prompt = f"Context: {context}\n\nUser: {message}"
            else:
                full_prompt = message

            response = self.chat.send_message(full_prompt)
            return response.text
        except Exception as e:
            return f"Error: {str(e)}"

    async def reset_chat(self):
        """Reset the chat history"""
        self.chat = self.model.start_chat(history=[]) 