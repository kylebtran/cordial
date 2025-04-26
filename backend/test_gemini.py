import asyncio
from services.gemini_service import GeminiService

async def test_gemini():
    try:
        # Initialize the service
        gemini = GeminiService()
        
        # Test basic chat
        print("Testing basic chat...")
        response = await gemini.send_message("Hello! Can you tell me about yourself?")
        print(f"Response: {response}\n")
        
        # Test with context
        print("Testing with context...")
        context = """
        Project: Cordial
        Description: A project management assistant that helps teams collaborate effectively.
        Current Task: Setting up the initial backend infrastructure.
        """
        response = await gemini.send_message(
            "What should be our next steps?",
            context=context
        )
        print(f"Response with context: {response}\n")
        
        # Test chat reset
        print("Testing chat reset...")
        await gemini.reset_chat()
        response = await gemini.send_message("What was our previous conversation about?")
        print(f"Response after reset: {response}\n")
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_gemini()) 