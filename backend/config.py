import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv(".env")

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
JIRA_DOMAIN = os.getenv("JIRA_DOMAIN")  # e.g., cordial-la.atlassian.net
JIRA_EMAIL = os.getenv("JIRA_EMAIL")    # your Atlassian email
JIRA_API_TOKEN = os.getenv("JIRA_API_TOKEN")
JIRA_DEFAULT_LEAD_ACCOUNT_ID = os.getenv("JIRA_LEAD_ACCOUNT_ID")  # your Atlassian Account ID
