import json
import os
import sys
from pathlib import Path
from typing import Dict, Any, List
from atlassian import Jira
from dotenv import load_dotenv
import google.generativeai as genai
import uuid
from models import Task, Epic, Story

# Load environment variables
load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Jira credentials
JIRA_URL, JIRA_USER, JIRA_API_TOKEN = map(os.getenv, ("JIRA_URL", "JIRA_USER", "JIRA_API_TOKEN"))
PROJECT_KEY = "RTYU"  # For now, we assume the project id is "WXYZ"

if not all((JIRA_URL, JIRA_USER, JIRA_API_TOKEN)):
    sys.exit("✖  Missing JIRA_URL / JIRA_USER / JIRA_API_TOKEN")

# ── helpers ───────────────────────────────────────────────────────────────
def get_jira_api_key() -> str:
    """Return the Jira API token from the environment."""
    return JIRA_API_TOKEN

def jira() -> Jira:
    """Initialize and return a Jira client."""
    return Jira(url=JIRA_URL, username=JIRA_USER, password=JIRA_API_TOKEN, cloud=True)

def field_map(client: Jira) -> Dict[str, str]:
    """Generate a field map for Jira."""
    return {f["name"]: f["id"] for f in client.get_all_fields()}

def account_map(client: Jira) -> Dict[str, str]:
    """Generate an account map for Jira users."""
    out, start = {}, 0
    while True:
        users = client.get(f"rest/api/3/users/search?startAt={start}&maxResults=50")
        if not users:
            break
        for u in users:
            aid = u["accountId"]
            out[u["displayName"]] = aid
            if u.get("emailAddress"):
                out[u["emailAddress"]] = aid
        start += 50
    return out

# ── project structure ────────────────────────────────────────────────────
async def generate_project_structure_from_manifest(manifest_text: str):
    """Generate the project structure from a manifest text."""
    print("[DEBUG] Starting to generate project structure from the manifest...")
    try:
        generation_config = {
            "temperature": 0.5,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 2048,
        }

        model = genai.GenerativeModel(model_name="gemini-1.5-pro", generation_config=generation_config)

        prompt = f"""You are a project management assistant.

Break down the following project requirements into a list of EPICS, STORIES, and TASKS. 
Each EPIC should represent a major feature or major area of work, each STORY should represent a clear user goal or deliverable, and each TASK should be an actionable item for developers.

Project Manifest:
{manifest_text}

Format your response as a JSON array of objects like this:
[
    {{
        "title": "Epic title",
        "description": "Epic description",
        "stories": [
            {{
                "title": "Story title",
                "description": "Story description",
                "tasks": [
                    {{
                        "title": "Task title",
                        "description": "Task description",
                        "required_skills": ["skill1", "skill2"]
                    }}
                ]
            }}
        ]
    }}
]

Ensure the output is valid JSON and can be parsed directly.
"""

        print("[DEBUG] Sending request to Gemini model...")
        response = model.generate_content(prompt)
        response_text = response.text

        print("[DEBUG] Response received from Gemini model.")
        json_start = response_text.find('[')
        json_end = response_text.rfind(']') + 1
        json_str = response_text[json_start:json_end] if json_start >= 0 else response_text

        project_data = json.loads(json_str)

        epics = []
        stories = []  # This will store all stories
        tasks = []    # This will store all tasks

        for epic_data in project_data:
            epic = Epic(
                id=str(uuid.uuid4()),
                title=epic_data["title"],
                description=epic_data["description"]
            )
            epics.append(epic)
            for story_data in epic_data["stories"]:
                story = Story(
                    id=str(uuid.uuid4()),
                    title=story_data["title"],
                    description=story_data["description"],
                    epic_id=epic.id
                )
                stories.append(story)  # Add story to the list
                for task_data in story_data["tasks"]:
                    task = Task(
                        id=str(uuid.uuid4()),
                        title=task_data["title"],
                        description=task_data["description"],
                        required_skills=task_data["required_skills"],
                        story_id=story.id,
                        epic_id=epic.id
                    )
                    tasks.append(task)  # Add task to the list

        total_stories = len(stories)
        total_tasks = len(tasks)

        print(f"[DEBUG] Generated {len(epics)} epics, with a total of {total_stories} stories and {total_tasks} tasks.")
        return epics, stories, tasks  # Return epics, stories, and tasks
    except Exception as e:
        print(f"Error generating project structure: {str(e)}")
        return [], [], []  # Return empty lists in case of an error

def create_epic(client: Jira, epic: Epic) -> str:
    """Create an epic in Jira."""
    payload = {"fields": {
        "project": {"key": PROJECT_KEY},
        "summary": epic.title,  # Changed from epic["title"] to epic.title
        "description": epic.description,  # Changed from epic["description"] to epic.description
        "issuetype": {"name": "Epic"},
    }}
    print(f"[DEBUG] Creating epic: {epic.title}")  # Changed from epic["title"] to epic.title
    return client.post("rest/api/2/issue", payload)["key"]

def create_story(client: Jira, fm: Dict[str, str], story: Story, epic_key: str) -> str:
    """Create a story in Jira."""
    fields = {
        "project": {"key": PROJECT_KEY},
        "summary": story.title,  # Changed from story["title"] to story.title
        "description": story.description,  # Changed from story["description"] to story.description
        "issuetype": {"name": "Story"},
        "parent": {"id": issue_id(client, epic_key)}
    }
    print(f"[DEBUG] Creating story: {story.title}")  # Changed from story["title"] to story.title
    return client.post("rest/api/2/issue", {"fields": fields})["key"]

def create_subtask(client: Jira, story_key: str, task: Task, assignees: Dict[str, str]) -> str:
    """Create a subtask in Jira."""
    fields = {
        "project": {"key": PROJECT_KEY},
        "summary": task.title,  # Changed from task["title"] to task.title
        "description": task.description,  # Changed from task["description"] to task.description
        "issuetype": {"name": "Sub-task"},
        "parent": {"id": issue_id(client, story_key)}
    }
    email = task.assigned_user_email or task.assigned_user  # Changed from task.get("assigned_user_email") to task.assigned_user_email
    aid = assignees.get(email)
    if aid:
        fields["assignee"] = {"id": aid}

    payload = {"fields": fields}
    print(f"[DEBUG] Creating task: {task.title}")  # Changed from task["title"] to task.title
    return client.post("rest/api/2/issue", payload)["key"]

def issue_id(client: Jira, key: str) -> str:
    """Get issue ID from issue key."""
    return client.get(f"rest/api/3/issue/{key}?fields=id")["id"]

# Remove MongoDB references and move them to manifest_listener.py
def populate_jira_project(epics: List[Epic], stories: List[Story], tasks: List[Task], jira_project_id: str, jira_api_token: str):
    """Populate a Jira project with epics, stories, and tasks."""
    print(f"[DEBUG] Starting to populate Jira project {jira_project_id}...")
    client = jira()
    fm = field_map(client)
    assignees = account_map(client)

    epic_key, story_key = {}, {}

    # Create Epics
    for e in epics:
        k = create_epic(client, e)
        epic_key[e.id] = k  # Changed from e["id"] to e.id
        print(f"📗 Epic   {e.title}  →  {k}")  # Changed from e["title"] to e.title

    # Create Stories
    for s in stories:
        k = create_story(client, fm, s, epic_key[s.epic_id])  # Changed from s["epic_id"] to s.epic_id
        story_key[s.id] = k  # Changed from s["id"] to s.id
        print(f"  📘 Story {s.title}  →  {k}")  # Changed from s["title"] to s.title

    # Create Tasks
    for t in tasks:
        k = create_subtask(client, story_key[t.story_id], t, assignees)
        print(f"    📒 Task  {t.title}  →  {k}")  # Changed from t["title"] to t.title

    # Return the Jira project ID for updating MongoDB from manifest_listener.py
    return jira_project_id
