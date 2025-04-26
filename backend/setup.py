import os
from google import genai


GOOGLE_API_KEY = os.getenv('gemini_api')

client = genai.Client(api_key=GOOGLE_API_KEY)
chat = client.chats.create(model="gemini-2.0-flash")

response = chat.send_message("What model are you?")
print(response.text)
