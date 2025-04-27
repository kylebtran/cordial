import google.generativeai as genai
import uuid
import json
from models.models import Task, Epic, Story
from config import GEMINI_API_KEY
from typing import List

genai.configure(api_key=GEMINI_API_KEY)

"""
async def generate_tasks_from_manifest(manifest_text: str):
    try:
        generation_config = {
            "temperature": 0.7,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 2048,
        }
        
        model = genai.GenerativeModel(model_name="gemini-1.5-pro", generation_config=generation_config)
        
        prompt = fYou are a project manager AI that breaks down project requirements into specific tasks.

Break down the following project requirements into specific tasks. For each task, extract a title, description, and required skills (frontend, backend, devops, etc.):

{manifest_text}

Format your response as JSON with the following structure: [{{"title": "Task title", "description": "Task description", "required_skills": ["skill1", "skill2"]}}]

Ensure the output is valid JSON that can be parsed directly.

        response = model.generate_content(prompt)
        response_text = response.text

        json_start = response_text.find('[')
        json_end = response_text.rfind(']') + 1
        json_str = response_text[json_start:json_end] if json_start >= 0 else response_text

        tasks_data = json.loads(json_str)
        
        tasks = []
        for task_data in tasks_data:
            tasks.append(Task(
                id=str(uuid.uuid4()),
                title=task_data["title"],
                description=task_data["description"],
                required_skills=task_data["required_skills"]
            ))
        return tasks
    except Exception as e:
        print(f"Error generating tasks: {str(e)}")
        return []
"""

async def generate_epics_from_manifest(manifest_text: str) -> List[Epic]:
    try:
        generation_config = {
            "temperature": 0.7,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 2048,
        }

        model = genai.GenerativeModel(model_name="gemini-1.5-pro", generation_config=generation_config)

        prompt = f"""You are a project management assistant.

Break down the following project requirements into a list of EPICS. 
Each EPIC should represent a major feature or major area of work.

Project Manifest:
{manifest_text}

Format your response as a JSON array of epics like this:
[{{"title": "Epic title", "description": "Epic description"}}]

Ensure the output is valid JSON and can be parsed directly.
"""

        response = model.generate_content(prompt)
        response_text = response.text

        json_start = response_text.find('[')
        json_end = response_text.rfind(']') + 1
        json_str = response_text[json_start:json_end] if json_start >= 0 else response_text

        epics_data = json.loads(json_str)

        epics = []
        for epic_data in epics_data:
            epics.append(Epic(
                id=str(uuid.uuid4()),
                title=epic_data["title"],
                description=epic_data["description"]
            ))
        return epics
    except Exception as e:
        print(f"Error generating epics: {str(e)}")
        return []

async def generate_stories_from_epic(epic: Epic) -> List[Story]:
    try:
        generation_config = {
            "temperature": 0.7,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 2048,
        }

        model = genai.GenerativeModel(model_name="gemini-1.5-pro", generation_config=generation_config)

        prompt = f"""You are a project management assistant.

Break down the following EPIC into smaller USER STORIES. 
Each story should represent a clear user goal or deliverable.

Epic Title: {epic.title}
Epic Description: {epic.description}

Format your response as a JSON array of stories like this:
[{{"title": "Story title", "description": "Story description"}}]

Ensure the output is valid JSON and can be parsed directly.
"""

        response = model.generate_content(prompt)
        response_text = response.text

        json_start = response_text.find('[')
        json_end = response_text.rfind(']') + 1
        json_str = response_text[json_start:json_end] if json_start >= 0 else response_text

        stories_data = json.loads(json_str)

        stories = []
        for story_data in stories_data:
            stories.append(Story(
                id=str(uuid.uuid4()),
                title=story_data["title"],
                description=story_data["description"],
                epic_id=epic.id
            ))
        return stories
    except Exception as e:
        print(f"Error generating stories: {str(e)}")
        return []

async def generate_tasks_from_story(story: Story) -> List[Task]:
    try:
        generation_config = {
            "temperature": 0.7,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 2048,
        }

        model = genai.GenerativeModel(model_name="gemini-1.5-pro", generation_config=generation_config)

        prompt = f"""You are a project management assistant.

Break down the following USER STORY into specific TASKS. 
Each task should be an actionable item for developers.

Story Title: {story.title}
Story Description: {story.description}

For each task, specify title, description, and required skills.

Format your response as a JSON array like this:
[{{"title": "Task title", "description": "Task description", "required_skills": ["skill1", "skill2"]}}]

Ensure the output is valid JSON and can be parsed directly.
"""

        response = model.generate_content(prompt)
        response_text = response.text

        json_start = response_text.find('[')
        json_end = response_text.rfind(']') + 1
        json_str = response_text[json_start:json_end] if json_start >= 0 else response_text

        tasks_data = json.loads(json_str)

        tasks = []
        for task_data in tasks_data:
            tasks.append(Task(
                id=str(uuid.uuid4()),
                title=task_data["title"],
                description=task_data["description"],
                required_skills=task_data["required_skills"],
                story_id=story.id,
                epic_id=story.epic_id
            ))
        return tasks
    except Exception as e:
        print(f"Error generating tasks: {str(e)}")
        return []

async def generate_project_structure_from_manifest(manifest_text: str):
    epics = await generate_epics_from_manifest(manifest_text)
    stories = []
    tasks = []

    for epic in epics:
        epic_stories = await generate_stories_from_epic(epic)
        stories.extend(epic_stories)

        for story in epic_stories:
            story_tasks = await generate_tasks_from_story(story)
            tasks.extend(story_tasks)

    return epics, stories, tasks
