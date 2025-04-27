# services/rag_service.py

from langchain.chains import RetrievalQA
from langchain.chat_models import ChatOpenAI
from services.vector_service import similarity_search
import os

# Initialize OpenAI chat model
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

llm = ChatOpenAI(
    temperature=0,
    openai_api_key=OPENAI_API_KEY,
    model_name="gpt-3.5-turbo"  # or "gpt-4" if you want
)

def generate_answer_from_query(query: str) -> str:
    """
    Given a user query, retrieve relevant project context and generate an LLM-based answer.
    """
    # Step 1: Retrieve top-k documents
    retrieved_docs = similarity_search(query, k=5)

    # Step 2: Aggregate documents
    context = "\n".join([doc.page_content for doc in retrieved_docs])

    # Step 3: Send to LLM
    full_prompt = f"""You are an intelligent assistant helping with project management.
Use the following project context to answer the user's question.

Context:
{context}

Question:
{query}

Answer:"""
    response = llm.invoke(full_prompt)
    return response.content.strip()
