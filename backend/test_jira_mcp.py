import asyncio
from jira_mcp import JiraMCP, conversations
from datetime import datetime, UTC
import json


def insert_test_conversation(messages):
    """Insert a sequence of test messages into MongoDB"""
    for msg in messages:
        msg["timestamp"] = datetime.now(UTC)
        conversations.insert_one(msg)
        print(f"Inserted message: {msg['role']}: {msg['content']}")

def test_create_bug():
    """Test creating a bug issue"""
    mcp = JiraMCP()
    conversations.delete_many({})
    
    print("\nTest: Creating a bug issue")
    bug_conversation = [
        {
            "role": "User",
            "content": "Found a critical bug: The login system is completely down. Users can't access their accounts."
        },
        {
            "role": "Assistant",
            "content": "This sounds serious. Can you provide more details about when this started?"
        },
        {
            "role": "User",
            "content": "Started about 30 minutes ago. All login attempts fail with a 500 error."
        }
    ]
    
    insert_test_conversation(bug_conversation)
    result = mcp.process_recent_conversations()
    
    try:
        result_json = json.loads(result)
        print("\nJira Action Result:")
        print(json.dumps(result_json, indent=2))
        
        # Verify the response
        analysis = result_json.get("analysis", {})
        assert analysis.get("action") == "create_issue", "Should create an issue"
        assert analysis.get("project_key") == "HI", "Should use correct project key"
        
        print("\nTest passed: Successfully created bug issue")
    except Exception as e:
        print("\nTest failed:", str(e))
    finally:
        conversations.delete_many({})

def test_create_urgent_issue():
    """Test creating an urgent issue"""
    mcp = JiraMCP()
    conversations.delete_many({})
    
    print("\nTest: Creating an urgent issue")
    urgent_conversation = [
        {
            "role": "User",
            "content": "URGENT: Production database is completely down! All services affected."
        },
        {
            "role": "User",
            "content": "Error in logs: 'FATAL: database connection failed'"
        }
    ]
    
    insert_test_conversation(urgent_conversation)
    result = mcp.process_recent_conversations()
    
    try:
        result_json = json.loads(result)
        print("\nJira Action Result:")
        print(json.dumps(result_json, indent=2))
        
        # Verify the response
        analysis = result_json.get("analysis", {})
        assert analysis.get("action") == "create_issue", "Should create an issue"
        assert analysis.get("project_key") == "HI", "Should use correct project key"
        assert "URGENT" in analysis.get("summary", ""), "Should have URGENT in summary"
        
        print("\nTest passed: Successfully created urgent issue")
    except Exception as e:
        print("\nTest failed:", str(e))
    finally:
        conversations.delete_many({})

def test_create_feature():
    """Test creating a feature request"""
    mcp = JiraMCP()
    conversations.delete_many({})
    
    print("\nTest: Creating a feature request")
    feature_conversation = [
        {
            "role": "User",
            "content": "We need to add a new feature: export data to PDF format"
        },
        {
            "role": "Assistant",
            "content": "What specific requirements do you have for the PDF export?"
        },
        {
            "role": "User",
            "content": "It should support tables, charts, and include a cover page with our logo"
        }
    ]
    
    insert_test_conversation(feature_conversation)
    result = mcp.process_recent_conversations()
    
    try:
        result_json = json.loads(result)
        print("\nJira Action Result:")
        print(json.dumps(result_json, indent=2))
        
        # Verify the response
        analysis = result_json.get("analysis", {})
        assert analysis.get("action") == "create_issue", "Should create an issue"
        assert analysis.get("project_key") == "HI", "Should use correct project key"
        assert "Feature" in analysis.get("summary", ""), "Should have Feature in summary"
        
        print("\nTest passed: Successfully created feature request")
    except Exception as e:
        print("\nTest failed:", str(e))
    finally:
        conversations.delete_many({})

if __name__ == "__main__":
    test_create_bug()
    test_create_urgent_issue()
    test_create_feature() 