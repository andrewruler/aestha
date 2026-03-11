from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import google.generativeai as genai
import time
import os
import json

app = FastAPI(title="Aestha AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini (it automatically looks for the GEMINI_API_KEY env var)
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

# Adding 'models/' prefix and using the stable identifier
model = genai.GenerativeModel('models/gemini-1.5-flash-latest')

@app.get("/")
async def root():
    return RedirectResponse(url='/docs')

@app.post("/analyze")
async def analyze(image: UploadFile = File(...)):
    content = await image.read()
    
    # 1. Prepare the image for Gemini
    image_parts = [
        {
            "mime_type": image.content_type,
            "data": content
        }
    ]
    
    # 2. The Prompt (Strictly defining the contract)
    prompt = """
    Analyze this person's outfit. Return ONLY a valid JSON object matching this exact schema:
    {
      "detected_outfit": {
        "status": "confident" | "needs_user_input",
        "items": [
          {"label": "string", "color": "string", "type": "top" | "bottom" | "outerwear" | "shoes"}
        ],
        "style_tags": ["string", "string"]
      }
    }
    """
    
    try:
        # 3. Call Gemini and force JSON output to prevent formatting hallucinations
        response = model.generate_content(
            [prompt, image_parts[0]],
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Parse the string response back into a Python dictionary
        ai_data = json.loads(response.text)
        
        # 4. Return the final contract to the mobile app
        return {
            "schema_version": "v1",
            "request_id": str(int(time.time())),
            "status": "success",
            "analysis": ai_data
        }
        
    except Exception as e:
        return {
            "schema_version": "v1",
            "status": "error",
            "message": str(e)
        }