import requests
import json
import random
import string
from requests.auth import HTTPBasicAuth
from config import JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_DEFAULT_LEAD_ACCOUNT_ID
import logging

# Setup Jira auth
auth = HTTPBasicAuth(JIRA_EMAIL, JIRA_API_TOKEN)
headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
}

def generate_project_key(name: str) -> str:
    """Generate a short Jira Project Key from project name."""
    key = ''.join(filter(str.isalnum, name.upper()))[:4]
    random_suffix = ''.join(random.choices(string.digits, k=2))
    return key + random_suffix

def format_description(text: str) -> dict:
    """Convert plain text into Atlassian Document Format (ADF) required by Jira."""
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": text
                    }
                ]
            }
        ]
    }

async def create_project_in_jira(project_name: str, description: str) -> str:
    """Create a Jira project and return its project key."""
    project_name = f"{project_name} - Copy"
    project_key = generate_project_key(project_name)
    payload = {
        "key": project_key,
        "name": project_name,
        "projectTypeKey": "software",
        "projectTemplateKey": "com.pyxis.greenhopper.jira:gh-scrum-template",
        "description": description,
        "leadAccountId": JIRA_DEFAULT_LEAD_ACCOUNT_ID,
        "assigneeType": "PROJECT_LEAD"
    }

    logging.info(f"📦 Sending request to create Jira project: {project_key}")
    response = requests.post(
        f"https://{JIRA_DOMAIN}/rest/api/3/project",
        headers=headers,
        auth=auth,
        data=json.dumps(payload)
    )

    if response.status_code != 201:
        logging.error(f"🛑 Failed to create project: {response.text}")
        raise Exception(f"Failed to create project: {response.text}")

    logging.info(f"✅ Jira project created with key: {project_key}")
    return project_key

