import weaviate

client = weaviate.Client(
    url="https://aazwtdqnquaa8rfnihndtw.c0.us-west3.gcp.weaviate.cloud",
    auth_client_secret=weaviate.AuthApiKey("uFpUAtwSF2FOw5duExPZP55rGomBwCrZk2UU"),
)

# ⚡ Delete ProjectDocs class
if client.schema.exists("ProjectDocs"):
    client.schema.delete_class("ProjectDocs")

# ⚡ Recreate it with correct schema
projectdocs_schema = {
    "class": "ProjectDocs",
    "vectorizer": "none",   # external embeddings
    "properties": [
        {"name": "project_id", "dataType": ["text"]},
        {"name": "filename", "dataType": ["text"]},
        {"name": "uploader_id", "dataType": ["text"]},
        {"name": "chunk_id", "dataType": ["text"]},
        {"name": "text", "dataType": ["text"]},
    ],
}
client.schema.create_class(projectdocs_schema)

print("✅ ProjectDocs reset and ready.")
