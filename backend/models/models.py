from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class Epic(BaseModel):
    id: str
    title: str
    description: str

class Story(BaseModel):
    id: str
    title: str
    description: str
    epic_id: str

class Task(BaseModel):
    id: str
    title: str
    description: str
    story_id: str
    epic_id: str
    required_skills: List[str]
    assigned_user: Optional[str] = None
    assigned_user_email: Optional[str] = None
    status: str = "TODO"

class Project(BaseModel):
    id: str
    name: str
    description: str
    tasks: List[Task] = []
    created_at: datetime
    admin_id: str

class User(BaseModel):
    id: str
    name: str
    email: str
    skills: List[str]

