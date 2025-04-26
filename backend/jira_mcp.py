import os
import json
from dotenv import load_dotenv
import google.generativeai as genai
from jira import JIRA
from pymongo import MongoClient
from datetime import datetime, timedelta, UTC
from typing import List, Dict

# Load environment variables
load_dotenv()

# Configure Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
JIRA_URL = os.getenv("JIRA_URL")
JIRA_USERNAME = os.getenv("JIRA_USERNAME")
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN")
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")

# Initialize Gemini model for PM decisions
genai.configure(api_key=GEMINI_API_KEY)
pm_model = genai.GenerativeModel('gemini-2.0-flash')

# Initialize MongoDB client
mongo_client = MongoClient(MONGODB_URI)
db = mongo_client.test
conversations = db.conversations

# Initialize Jira client
jira_client = None
if JIRA_URL and JIRA_USERNAME and JIRA_API_TOKEN:
    jira_client = JIRA(
        server=JIRA_URL,
        basic_auth=(JIRA_USERNAME, JIRA_API_TOKEN)
    )

class JiraMCP:
    def __init__(self):
        self.pm_assistant = pm_model.start_chat(history=[])
        # Get available issue types from Jira
        self.issue_types = {}
        if jira_client:
            try:
                # Get the first project's issue types as a reference
                projects = jira_client.projects()
                if projects:
                    project = projects[0]
                    for issue_type in jira_client.issue_types():
                        self.issue_types[issue_type.name.lower()] = issue_type.name
                print(f"Available Jira issue types: {list(self.issue_types.values())}")
            except Exception as e:
                print(f"Warning: Could not fetch issue types: {str(e)}")
    
    def fetch_recent_conversations(self, minutes: int = 5) -> List[Dict]:
        """Fetch recent conversations from MongoDB"""
        cutoff_time = datetime.now(UTC) - timedelta(minutes=minutes)
        return list(conversations.find(
            {"timestamp": {"$gte": cutoff_time}},
            {"_id": 0}
        ).sort("timestamp", 1))  # Sort chronologically
    
    def format_conversations(self, convos: List[Dict]) -> str:
        """Format conversations for the PM assistant"""
        if not convos:
            return "No recent conversations found."
        
        formatted = "Recent Conversations:\n\n"
        for msg in convos:
            timestamp = msg["timestamp"].strftime("%Y-%m-%d %H:%M:%S")
            formatted += f"[{timestamp}] {msg['role']}: {msg['content']}\n\n"
        return formatted
    
    def analyze_conversations(self, convos: List[Dict]) -> str:
        """Have the PM assistant analyze conversations and determine Jira actions"""
        if not convos:
            return json.dumps({"action": "none"})
        
        history_text = self.format_conversations(convos)
        
        prompt = f"""
        You are a project management assistant. Your task is to analyze conversations and output a SINGLE valid JSON object.
        DO NOT include any explanation text or markdown code blocks. Output ONLY the raw JSON object.

        Rules for JSON creation:
        1. For URGENT/CRITICAL issues or production outages:
        {{
            "action": "create_issue",
            "project_key": "HI",
            "summary": "URGENT: Production Database Connection Issues",
            "description": "## Impact\\n- All users affected\\n- Unable to access accounts\\n\\n## Error Details\\n```\\nConnection refused - max_connections reached\\n```\\n\\n## Timeline\\n- Started: [time]\\n- Reported: [time]",
            "issue_type": "Bug",
            "priority": "Highest"
        }}

        2. For regular bugs:
        {{
            "action": "create_issue",
            "project_key": "HI",
            "summary": "Bug: Password Reset Not Working",
            "description": "## Issue\\nPassword reset functionality not working\\n\\n## Steps to Reproduce\\n1. Click Forgot Password\\n2. Enter email\\n3. No reset email received",
            "issue_type": "Bug",
            "priority": "High"
        }}

        3. For feature requests:
        {{
            "action": "create_issue",
            "project_key": "HI",
            "summary": "Feature: Dark Mode Implementation",
            "description": "## Requirements\\n- Dark theme for all components\\n- Automatic switcHIng based on system preferences\\n\\n## Components Affected\\n- Dashboard\\n- Charts\\n- Tables",
            "issue_type": "Story",
            "priority": "Medium"
        }}

        4. For no action needed:
        {{
            "action": "none"
        }}

        IMPORTANT:
        - Output ONLY the raw JSON object
        - Do not wrap the JSON in code blocks or add any other text
        - Use "HI" as the project key
        - For urgent issues, always use priority "Highest"
        - For regular bugs, use priority "HIgh"
        - For features, use priority "Medium"

        Analyze these conversations and output the appropriate JSON:
        {history_text}
        """
        
        # Get response from Gemini
        response = self.pm_assistant.send_message(prompt)
        
        try:
            # Get the response and clean it
            response_text = response.text.strip()
            
            # Remove any markdown code block markers
            response_text = response_text.replace('```json', '').replace('```', '').strip()
            
            # Parse the JSON
            json_response = json.loads(response_text)
            
            # Ensure required fields are present and project key is correct
            if json_response.get("action") == "create_issue":
                json_response["project_key"] = "HI"  # Ensure correct project key
                required_fields = ["project_key", "summary", "description", "issue_type", "priority"]
                for field in required_fields:
                    if field not in json_response:
                        json_response[field] = "Not specified"
            
            return json.dumps(json_response)
            
        except (json.JSONDecodeError, ValueError) as e:
            # If we can't parse the JSON, create a bug ticket about it
            return json.dumps({
                "action": "create_issue",
                "project_key": "HI",
                "summary": "Bug: Invalid JSON Response from Assistant",
                "description": f"## Error\nFailed to parse assistant response\n\n## Raw Response\n```\n{response_text}\n```\n\n## Error Details\n{str(e)}",
                "issue_type": "Bug",
                "priority": "High"
            })
    
    def execute_jira_action(self, action_json: str) -> str:
        """Execute the Jira action determined by the PM assistant"""
        try:
            action_data = json.loads(action_json)
            
            if action_data["action"] == "none":
                return "No Jira action needed based on the conversations."
            
            if action_data["action"] == "create_issue":
                # Map our issue types to actual Jira issue types
                requested_type = action_data.get("issue_type", "Task").lower()
                
                # Map common types to available Jira types
                type_mapping = {
                    "bug": "Task",  # Since we don't have Bug type, use Task
                    "story": "Story",
                    "feature": "Feature",
                    "task": "Task",
                    "epic": "Epic"
                }
                
                actual_type = type_mapping.get(requested_type, "Task")  # Default to Task if no mapping found
                
                issue_dict = {
                    'project': {'key': action_data["project_key"]},
                    'summary': action_data["summary"],
                    'description': action_data["description"],
                    'issuetype': {'name': actual_type}
                    # Removed priority field as it's not available
                }
                
                print(f"Creating Jira issue with data: {json.dumps(issue_dict, indent=2)}")
                new_issue = jira_client.create_issue(fields=issue_dict)
                return f"Created Jira issue: {new_issue.key} - {new_issue.fields.summary}"
            
            if action_data["action"] == "update_issue":
                issue = jira_client.issue(action_data["issue_key"])
                update_fields = {
                    'summary': action_data["summary"],
                    'description': action_data["description"]
                }
                issue.update(fields=update_fields)
                return f"Updated Jira issue: {issue.key} - {issue.fields.summary}"
            
            return f"Unknown action: {action_data['action']}"
            
        except json.JSONDecodeError:
            return "Error: Could not parse PM assistant response as JSON."
        except Exception as e:
            return f"Error executing Jira action: {str(e)}"
    
    def process_recent_conversations(self) -> str:
        """Process recent conversations and take Jira actions if needed"""
        # Fetch recent conversations
        recent_convos = self.fetch_recent_conversations()
        if not recent_convos:
            return json.dumps({"status": "no_action", "message": "No recent conversations to analyze."})
        
        # Analyze conversations
        analysis = self.analyze_conversations(recent_convos)
        
        # Execute any needed Jira actions
        result = self.execute_jira_action(analysis)
        
        # Return result as JSON
        return json.dumps({
            "status": "success",
            "analysis": json.loads(analysis) if analysis else None,
            "action_result": result
        })

def main():
    if not jira_client:
        print("Error: Jira client not initialized. Please check your .env file.")
        return
    
    mcp = JiraMCP()
    print("Jira MCP Server started. This server monitors conversations and creates/updates Jira issues.")
    print(f"Connected to MongoDB at {MONGODB_URI}")
    
    while True:
        try:
            # Process conversations every 5 minutes
            result = mcp.process_recent_conversations()
            print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {result}")
            
            # Wait 5 minutes before next check
            for _ in range(300):  # 5 minutes in seconds
                if input("Press Enter to process now, or 'exit' to quit: ").lower() == 'exit':
                    return
                break
            
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {str(e)}")
            break

if __name__ == "__main__":
    main() 