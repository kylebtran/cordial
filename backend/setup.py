import os
import google.generativeai as genai
from dotenv import load_dotenv


GOOGLE_API_KEY = os.getenv('gemini_api')

client = genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash')


chat_session = model.start_chat(history=[])
prompt = "what model are you?"

try:
    response = chat_session.send_message(prompt)
    print(response.text)

    prompt2 = "What can you do?"
    print(f"User: {prompt2}")
    response2 = chat_session.send_message(prompt2)
    print(f"Assistant: {response2.text}")


except Exception as e:
    print(f"An error occurred: {e}")
