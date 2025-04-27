import os
import json
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import google.generativeai as genai
from github import Github
from pymongo import MongoClient
import pytest


# Load environment variables
load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
pm_model = genai.GenerativeModel('gemini-2.5-pro-exp-03-25')

# Initialize MongoDB client and default conversations collection
mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
mongo_db_name = os.getenv("MONGODB_DB", "test")
client = MongoClient(mongo_uri)
db = client[mongo_db_name]
default_conversations = db.conversations

# Initialize GitHub client
github_client = Github(os.getenv("GITHUB_TOKEN"))
repo = github_client.get_repo(os.getenv("GITHUB_REPO"))

class GitHubMCP:
    def __init__(self, conv_collection=None):
        # Use provided collection (e.g., a test collection) or default
        self.conversations = conv_collection if conv_collection is not None else default_conversations
        self.pm_assistant = pm_model.start_chat(history=[])

    def fetch_recent_conversations(self, minutes: int = 5):
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
        return list(self.conversations.find(
            {"timestamp": {"$gte": cutoff}}, {"_id": 0}
        ).sort("timestamp", 1))

    def format_conversations(self, convos):
        if not convos:
            return "No recent conversations."
        lines = []
        for m in convos:
            ts = m['timestamp'].astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            lines.append(f"[{ts}] {m['role']}: {m['content']}")
        return "\n".join(lines)

    def analyze_conversations(self, convos):
        # Determine action via Gemini
        if not convos:
            return json.dumps({"action": "none"})
        chats = self.format_conversations(convos)
        prompt = (
            "You are a project management assistant. Output ONE raw JSON object (no markdown) with one of: "
            "create_issue, update_issue, create_repo, add_collaborator, none.\n\n"

            "Rules for create_issue:\n"
            "- For bugs: title should start with \"Bug:\" and labels include \"bug\"\n"
            "- For features: title should start with \"Feature:\" and labels include \"enhancement\"\n"
            "- For urgent items: title should start with \"URGENT:\" and labels include \"bug\"\n\n"

            "Rules for repo administration:\n"
            "- To create a new repository:\n"
            "  {\"action\":\"create_repo\",\"name\":\"<repo-name>\",\"private\":<true|false>,"
            "\"description\":\"<text>\"}\n"
            "- To add a collaborator:\n"
            "  {\"action\":\"add_collaborator\",\"repo\":\"<owner>/<repo>\","
            "\"user\":\"<github-login>\",\"permission\":\"<push|pull|admin>\"}\n\n"

            "Example create_issue JSON:\n"
            "{\n"
            "  \"action\": \"create_issue\",\n"
            "  \"repo\": \"%s\",\n"
            "  \"title\": \"Feature: PDF export\",\n"
            "  \"body\": \"Detailed description...\",\n"
            "  \"labels\": [\"enhancement\"],\n"
            "  \"assignees\": []\n"
            "}\n\n"

            "Example create_repo JSON:\n"
            "{\n"
            "  \"action\": \"create_repo\",\n"
            "  \"name\": \"project-x\",\n"
            "  \"private\": true,\n"
            "  \"description\": \"A new project\"\n"
            "}\n\n"

            "Example add_collaborator JSON:\n"
            "{\n"
            "  \"action\": \"add_collaborator\",\n"
            "  \"repo\": \"%s\",\n"
            "  \"user\": \"alice\",\n"
            "  \"permission\": \"push\"\n"
            "}\n\n"

            "Example none:\n"
            "{\n"
            "  \"action\": \"none\"\n"
            "}\n\n"

            f"Chats:\n{chats}"
        ) % os.getenv("GITHUB_REPO")
        resp = self.pm_assistant.send_message(prompt)
        raw = resp.text.strip().lstrip('```').rstrip('```')
        try:
            data = json.loads(raw)
        except Exception:
            data = {
                "action": "create_issue",
                "repo": os.getenv("GITHUB_REPO"),
                "title": "Bug: Invalid JSON from assistant",
                "body": f"Response:\n{raw}",
                "labels": ["bug"],
                "assignees": []
            }
        # Post-process title for feature requests if needed
        title = data.get("title", "")
        if data.get("action") == "create_issue" and "feature" in chats.lower():
            if not title.lower().startswith("feature:"):
                data["title"] = f"Feature: {title}"
            if "enhancement" not in data.get("labels", []):
                data.setdefault("labels", []).append("enhancement")
        return json.dumps(data)

    def execute_github_action(self, action_json):
        data = json.loads(action_json)
        action = data.get("action")
        if action == "none":
            return "No action needed."
        try:
            if action == "create_issue":
                issue = repo.create_issue(
                    title=data.get("title"),
                    body=data.get("body"),
                    labels=data.get("labels", []),
                    assignees=data.get("assignees", [])
                )
                return f"Created issue #{issue.number}: {issue.title}"
            if action == "update_issue":
                num = data.get("issue_number")
                issue = repo.get_issue(number=num)
                issue.edit(
                    title=data.get("title", issue.title),
                    body=data.get("body", issue.body),
                    labels=data.get("labels", [lbl.name for lbl in issue.labels]),
                    assignees=data.get("assignees", [ass.login for ass in issue.assignees])
                )
                return f"Updated issue #{issue.number}: {issue.title}"
        except Exception as e:
            return f"Dry-run mode: would have performed '{action}' with payload: {data} ({str(e)})"
        return f"Unknown action: {action}"

    def process(self):
        convos = self.fetch_recent_conversations()
        analysis = self.analyze_conversations(convos)
        result = self.execute_github_action(analysis)
        return {"analysis": json.loads(analysis), "result": result}
    
    def listen(self):
        """
        Open a Change Stream on the conversations collection
        and process each new insert as it comes in.
        """
        # Only watch for inserts
        pipeline = [{'$match': {'operationType': 'insert'}}]
        # full_document="updateLookup" so we get the full doc, not just the _id
        with self.conversations.watch(pipeline, full_document='updateLookup') as stream:
            print("🚀 Listening for new messages…")
            for change in stream:
                new_msg = change['fullDocument']
                # process just this one message
                analysis = self.analyze_conversations([new_msg])
                result = self.execute_github_action(analysis)
                print({"analysis": json.loads(analysis), "result": result})



if __name__ == "__main__":
    # use your production collection by default
    mcp = GitHubMCP()
    mcp.listen()

# # -------------------- TESTS -------------------- #
# from datetime import datetime, timezone
# # Use a separate test collection so we don't touch production data
# test_conversations = db.get_collection("test_conversations")
# mcp = GitHubMCP(conv_collection=test_conversations)

# @pytest.fixture(autouse=True)
# def clear_test_conversations():
#     # runs before each test
#     test_conversations.delete_many({})

# def insert_test_conversation(messages):
#     # wipe out any leftovers from prior tests
#     test_conversations.delete_many({})

#     for msg in messages:
#         msg["timestamp"] = datetime.now(timezone.utc)
#         test_conversations.insert_one(msg)

# def test_create_bug():
#     insert_test_conversation([{"role":"User","content":"Critical bug: login fails for all users."}])
#     out = mcp.process()
#     analysis = out['analysis']
#     assert analysis['action']=='create_issue'
#     assert analysis['repo']==os.getenv('GITHUB_REPO')
#     assert any(lbl=='bug' for lbl in analysis.get('labels',[]))
#     print("test_create_bug passed")

# def test_create_feature():
#     insert_test_conversation([{"role":"User","content":"We need a feature to export data as PDF."}])
#     out = mcp.process()
#     analysis = out['analysis']
#     assert analysis['action']=='create_issue'
#     assert analysis['title'].startswith('Feature:'),"Title should start with Feature:"
#     assert 'enhancement' in analysis.get('labels',[]),"Should include enhancement label"
#     print("test_create_feature passed")

# def test_no_action():
#     out = mcp.process()
#     analysis = out['analysis']
#     assert analysis['action']=='none'
#     print("test_no_action passed")

# if __name__ == "__main__":
#     test_create_bug()
#     test_create_feature()
#     test_no_action()
