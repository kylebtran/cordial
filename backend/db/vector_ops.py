# db/vector_ops.py

from services.vector_service import embed_and_store_texts

async def push_document_embedding(document_text: str, metadata: dict):
    """
    Embed a single document's text and store it into the vector database.
    """
    texts = [document_text]
    metadatas = [metadata]
    embed_and_store_texts(texts, metadatas)
