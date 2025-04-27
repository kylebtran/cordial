import os
import json
import asyncio
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from google.cloud import storage
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
import requests
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = "test"
PROJECTFILES_COLLECTION = "projectFiles"
print(f"[DEBUG] Connecting to MongoDB: {MONGO_URI}")
mongo_client = AsyncIOMotorClient(MONGO_URI)
db = mongo_client[DB_NAME]
project_files_collection = db[PROJECTFILES_COLLECTION]

# Google Cloud Storage Configuration
storage_client = storage.Client.from_service_account_json("../frontend/key.json")

# Store active monitoring tasks
active_monitors = {}

# FastAPI Setup
app = FastAPI()

class ProjectCreated(BaseModel):
    projectId: str

async def monitor_for_manifest_file(project_id: str):
    """
    Poll for manifest files periodically instead of using change streams
    """
    print(f"[DEBUG] Starting monitor for project {project_id}")
    
    # Look only for recent files (within the last hour to start)
    start_time = datetime.utcnow() - timedelta(hours=1)
    
    # Verify database connection
    try:
        server_info = await mongo_client.server_info()
        print(f"[DEBUG] Connected to MongoDB: {server_info.get('version', 'unknown version')}")
    except Exception as e:
        print(f"[DEBUG] Failed to connect to MongoDB: {str(e)}")
    
    # Verify collection exists
    collections = await db.list_collection_names()
    print(f"[DEBUG] Available collections: {collections}")
    
    poll_count = 0
    while project_id in active_monitors:
        poll_count += 1
        try:
            # Query for any .txt files for this project created since we last checked
            query = {
                "projectId": ObjectId(project_id),
                "filename": {"$regex": r"\.txt$"},
                "createdAt": {"$gte": start_time}
            }
            
            print(f"[DEBUG] Poll #{poll_count} - Executing query: {query}")
            
            # First, count matching documents
            count = await project_files_collection.count_documents(query)
            print(f"[DEBUG] Found {count} matching documents")
            
            # If we have matches, process them
            if count > 0:
                # Find any matching files
                cursor = project_files_collection.find(query).sort("createdAt", 1)
                
                file_found = False
                async for file_metadata in cursor:
                    file_found = True
                    print(f"[DEBUG] Processing file metadata: {file_metadata}")
                    print(f"Found manifest file: {file_metadata['filename']}")
                    
                    # Check if publicUrl exists
                    if 'publicUrl' not in file_metadata:
                        print(f"[DEBUG] No publicUrl found in file metadata")
                        continue
                    
                    # Download the file from Google Cloud Storage
                    download_url = file_metadata['publicUrl']
                    print(f"[DEBUG] Downloading from URL: {download_url}")
                    file_content = download_file_from_gcs(download_url)
                    
                    # Process the manifest file content
                    process_manifest(file_content)
                    
                    # Stop monitoring after finding and processing the file
                    active_monitors.pop(project_id, None)
                    print(f"Monitoring ended for project {project_id}")
                    return
                
                if not file_found:
                    print(f"[DEBUG] Cursor returned no documents despite count={count}")
            
            # Let's also try a more general query to see what's in the collection
            if poll_count % 10 == 1:  # Only do this periodically to avoid log spam
                print(f"[DEBUG] Checking for ANY files for this project")
                any_files_query = {"projectId": ObjectId(project_id)}
                any_count = await project_files_collection.count_documents(any_files_query)
                print(f"[DEBUG] Found {any_count} total files for this project")
                
                if any_count > 0:
                    # Show some sample files
                    async for doc in project_files_collection.find(any_files_query).limit(3):
                        print(f"[DEBUG] Sample file: {doc.get('filename', 'unknown')} - Created: {doc.get('createdAt', 'unknown')}")
            
            # Update the time for the next query to only look for new files
            start_time = datetime.utcnow()
            
            # Sleep before checking again
            print(f"[DEBUG] Sleeping for 5 seconds before next poll")
            await asyncio.sleep(5)  # Poll every 5 seconds
            
        except Exception as e:
            print(f"[DEBUG] Error in monitor loop: {str(e)}")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(5)  # Continue with polling even after errors

def download_file_from_gcs(url: str) -> str:
    """Download file content from Google Cloud Storage"""
    try:
        print(f"[DEBUG] Attempting to download from: {url}")
        # Make a request to Google Cloud to fetch the file content
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for bad status codes
        content = response.text
        print(f"[DEBUG] Successfully downloaded {len(content)} bytes")
        return content
    except Exception as e:
        print(f"[DEBUG] Error downloading file from GCS: {str(e)}")
        return ""

def process_manifest(file_content: str):
    """Process the content of the manifest file"""
    try:
        print(f"[DEBUG] Processing manifest content length: {len(file_content)}")
        if len(file_content) < 100:  # Only show the full content if it's small
            print(f"[DEBUG] Content: {file_content}")
        else:
            print(f"[DEBUG] Content excerpt: {file_content[:100]}...")
            
        # Add your manifest processing logic here
        # For example, parse JSON content and take actions based on it
        manifest_data = json.loads(file_content)
        print(f"[DEBUG] Parsed manifest data: {manifest_data}")
        # Implement additional processing logic as needed
    except json.JSONDecodeError:
        print("[DEBUG] The manifest file is not valid JSON")
    except Exception as e:
        print(f"[DEBUG] Error processing manifest: {str(e)}")

@app.post("/process-manifest/")
async def project_created(project: ProjectCreated, background_tasks: BackgroundTasks):
    """Endpoint to start monitoring for a project's manifest file"""
    project_id = project.projectId
    print(f"Project {project_id} created, now monitoring for manifest file...")
    
    # Stop any existing monitoring task for this project
    if project_id in active_monitors:
        active_monitors.pop(project_id, None)
    
    # Mark this project as being monitored
    active_monitors[project_id] = True
    
    # Start monitoring in the background
    background_tasks.add_task(monitor_for_manifest_file, project_id)
    
    return {"status": "monitoring_started", "project_id": project_id}

@app.get("/status/")
async def get_monitoring_status():
    """Get status of all active monitoring tasks"""
    return {
        "active_monitors": list(active_monitors.keys()),
        "count": len(active_monitors)
    }

@app.delete("/stop-monitoring/{project_id}")
async def stop_monitoring(project_id: str):
    """Stop monitoring a specific project"""
    if project_id in active_monitors:
        active_monitors.pop(project_id)
        return {"status": "stopped", "project_id": project_id}
    return {"status": "not_found", "project_id": project_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)