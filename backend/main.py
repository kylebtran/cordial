import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai

# Load environment variables from .env file
load_dotenv()

# --- Gemini Setup ---
# Get API key from environment variable
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in environment variables. Please set it in your .env file.")

# Configure the generative AI model
genai.configure(api_key=GEMINI_API_KEY)

# Choose the Gemini model you want to use (e.g., gemini-pro, gemini-1.5-flash)
# Check https://ai.google.dev/models for available models and their capabilities
MODEL_NAME = "gemini-2.0-flash" # Or "gemini-1.5-flash-latest" etc.
try:
    model = genai.GenerativeModel(MODEL_NAME)
    print(f"Successfully initialized Gemini model: {MODEL_NAME}")
except Exception as e:
    print(f"Error initializing Gemini model {MODEL_NAME}: {e}")
    # Depending on your needs, you might want to raise an exception here
    # raise SystemExit(f"Failed to initialize Gemini model: {e}")


# --- FastAPI Setup ---
app = FastAPI()

# Add CORS middleware to allow requests from your Next.js frontend
# In development, frontend runs on http://localhost:3000 by default
# In production, you'll need to change the origins
origins = [
    "http://localhost:3000", # Allow requests from your Next.js dev server
    # Add your production frontend URL here when deployed
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (GET, POST, etc.)
    allow_headers=["*"], # Allow all headers
)

# Define a Pydantic model for the request body
class ChatRequest(BaseModel):
    message: str

# Define the chat endpoint
@app.post("/api/chat")
async def chat_with_gemini(request: ChatRequest):
    if not model:
         raise HTTPException(status_code=500, detail="Gemini model not initialized.")

    user_message = request.message
    print(f"Received message: {user_message}")

    try:
        # Send the message to Gemini
        response = model.generate_content(user_message)

        # Extract the text from the response
        # Note: Accessing .text can raise an exception if the model doesn't return text content
        # e.g., due to safety filters. Add robust error handling here for production.
        gemini_response_text = response.text
        print(f"Gemini response: {gemini_response_text}")

        return {"response": gemini_response_text}

    except Exception as e:
        print(f"Error during Gemini interaction: {e}")
        # Return a meaningful error to the frontend
        raise HTTPException(status_code=500, detail=f"Error communicating with Gemini: {e}")

# Basic root endpoint (optional)
@app.get("/")
async def read_root():
    return {"message": "Gemini Python Backend is running"}

# To run this backend:
# 1. Make sure you are in the 'backend' directory.
# 2. Activate your virtual environment.
# 3. Run: uvicorn main:app --reload --port 8000
# The backend will run on http://localhost:8000