from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGODB_URL

client = AsyncIOMotorClient(MONGODB_URL)
db = client.ai_project_manager
