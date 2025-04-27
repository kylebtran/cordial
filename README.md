# Cordial - Project Manager Assistant

Cordial is a web-based assistant built to help teams manage their projects more smoothly. It uses Google's Gemini AI to understand project discussions and automatically handles tasks in tools like GitHub and Jira, letting your team focus more on doing the work.

## What Cordial Does

*   **Project Hub:** Gives your team a central place online to define projects, upload relevant files, and chat about tasks.
*   **Smart Chat:** Team members talk with an AI assistant (powered by Gemini) to describe new features, report bugs, ask for help using uploaded project documents, or discuss task progress.
*   **Understands Roles:** Has different roles for users. A 'Product Manager' can manage project settings and access uploaded data, while 'Team Members' focus on their tasks.
*   **Connects to Your Tools:** Automatically links conversations to actions in GitHub and Jira.
*   **Automated Task Management:**
    *   **GitHub:** Creates new issues (bugs, features), edits existing ones (like closing or reopening), and adds collaborators based on the chat.
    *   **Jira:** Creates detailed work items (tasks, stories, epics), understands team member expertise (from project setup), and can assign tasks accordingly.
*   **Data Storage:** Keeps project details, uploaded files, and conversation history organized in a MongoDB database.

## How it Works - The Flow

1.  **Team Conversation:** A team member chats with the Cordial assistant on the website. They might say something like, "Found a bug on the login page," "Let's add a PDF export option," or "I finished work on issue #45, please close it." They can also ask questions about documents uploaded to the project.
2.  **Saving the Chat:** Cordial saves this conversation, along with who said it and any linked project files, into the MongoDB database.
3.  **Backend Agents Listen:** Special backend services (we call them **Integration Agents**) constantly watch the database for new messages or updates.
4.  **Understanding the Request:** When an agent sees a new message, it analyzes the conversation history using its *own* specialized Gemini model. This model is trained to figure out if the chat requires a specific action in GitHub or Jira (like creating an issue, closing one, or making a new Jira task). It translates the natural language request into a structured format (JSON).
5.  **Taking Action:** If an action is needed, the agent uses the structured information (the JSON) to talk to the GitHub or Jira API and perform the requested task automatically.

## Technology Stack

*   **Backend:** Python
*   **AI Models:** Google Gemini API (using models like `gemini-2.5-exp-03-25`)
*   **Database:** MongoDB
*   **GitHub Integration:** PyGithub library, GitHub API
*   **Jira Integration:** Docker, Jira Cloud API
*   **Web Frontend:** Next.js
*   **Configuration:** Python-dotenv (`.env` files)

## Setup

*(Adjust these steps based on your actual project structure)*

1.  **Get the Code:**
    ```bash
    git clone https://github.com/kylebtran/cordial
    cd cordial
    ```
2.  **Set up the Backend:**
    *   Install necessary Python packages:
        ```bash
        pip install -r requirements.txt
        ```
    *   Create a `.env` file in the main project folder (or wherever your backend scripts expect it). Copy the contents from the example below and fill in your details.
3.  **Set up the Frontend:**
    *   Go to the frontend code directory (if it's separate): `cd frontend`
    *   Install its dependencies: `npm install` (or `yarn install`, etc.)
    *   *(Add any frontend build commands if needed)*

## Configuration (`.env` file)

Create a file named `.env` in your project's root directory and add your specific keys and settings:

```dotenv
# --- Core Settings ---
# SECRET_KEY=a_very_strong_random_secret_key_for_web_sessions 

# --- Gemini API ---
GEMINI_API_KEY="your_google_ai_studio_api_key"

# --- MongoDB ---
MONGODB_URI="your_mongodb_connection_string" # e.g., mongodb://user:pass@host:port/
MONGODB_DB="cordial_database_name"          

# --- GitHub Integration ---
GITHUB_REPO="your_github_owner/your_repo_name"     # Target repository
GITHUB_TOKEN="your_github_personal_access_token" # Needs repo permissions

# --- Jira Integration ---
JIRA_URL="https://your-domain.atlassian.net"     # Your Jira Cloud URL
JIRA_USER="your_jira_account_email@example.com" # Email used for Jira API token
JIRA_TOKEN="your_jira_api_token"               # The API token generated in Jira settings
# JIRA_PROJECT_KEY="PROJ" # Optional: Default project key if needed by agents

