# services/vector_service.py

from langchain_community.vectorstores import Weaviate
from langchain_openai import OpenAIEmbeddings
import weaviate
import weaviate
import os

# Load environment variables
WEAVIATE_URL = os.getenv("WEAVIATE_URL")
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Initialize OpenAI embeddings
embedding_function = OpenAIEmbeddings(openai_api_key=OPENAI_API_KEY)

# Connect to Weaviate Cloud
client = weaviate.Client(
    url=WEAVIATE_URL,
    auth_client_secret=weaviate.AuthApiKey(WEAVIATE_API_KEY)
)

# Setup LangChain vectorstore
vectorstore = Weaviate(
    client=client,
    index_name="ProjectDocs",  # Make sure this collection is created
    text_key="text",
    embedding=embedding_function,
    by_text=False,
)

def embed_and_store_texts(texts: list[str], metadatas: list[dict]) -> None:
    """
    Embed and store a list of texts with corresponding metadata into the vector database.
    """
    if len(texts) != len(metadatas):
        raise ValueError("Texts and metadata must have the same length.")

    vectorstore.add_texts(texts=texts, metadatas=metadatas)

def similarity_search(query: str, k: int = 5):
    """
    Perform a similarity search for the given query.
    """
    return vectorstore.similarity_search(query, k=k)
