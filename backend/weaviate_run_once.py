# For Weaviate client v3.26.x (older version)

import weaviate
import os

# Connect
client = weaviate.Client(
    url=os.getenv("WEAVIATE_URL"),
    auth_client_secret=weaviate.AuthApiKey(os.getenv("WEAVIATE_API_KEY"))
)

# Define ProjectDocs class schema
projectdocs_schema = {
    "class": "ProjectDocs",
    "properties": [
        {"name": "text", "dataType": ["text"]},
        {"name": "filename", "dataType": ["text"]},
        {"name": "project_id", "dataType": ["text"]},
        {"name": "uploaded_by", "dataType": ["text"]},
        {"name": "type", "dataType": ["text"]},
    ],
    "vectorizer": "none"  # External embeddings (OpenAI)
}

# Create class if not exists
try:
    client.schema.create_class(projectdocs_schema)
    print("✅ ProjectDocs class created successfully.")
except Exception as e:
    print("⚠️ Class creation failed or already exists:", str(e))
