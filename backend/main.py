from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import google.generativeai as genai
import time
import os
import json
import requests  # Used for FASHN integration and listing models
from pydantic import BaseModel

app = FastAPI(title="Aestha AI Backend")

# Keep your CORS setup so Expo can connect!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini (it automatically looks for the GEMINI_API_KEY env var)
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

# Using your specified preview model
model = genai.GenerativeModel('models/gemini-3-flash-preview')

@app.get("/")
async def root():
    return RedirectResponse(url='/docs')

class TryOnRequest(BaseModel):
    user_image: str
    clothing_item: str


@app.post("/try-on")
async def generate_try_on(payload: TryOnRequest):
    """
    Simple, fully synchronous stub for try-on.
    Echoes back the provided user_image as result_image_url so the mobile app
    can display a 'new look' immediately without external dependencies.
    """
    return {
        "status": "completed",
        "result_image_url": payload.user_image,
        "clothing_item": payload.clothing_item,
    }

@app.get("/list-models")
async def list_available_models():
    try:
        models = []
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                models.append({
                    "name": m.name,
                    "display_name": m.display_name,
                    "description": m.description
                })
        return {"available_models": models}
    except Exception as e:
        return {"error": str(e)}

@app.post("/analyze")
async def analyze(
    image: UploadFile = File(...),
    body_ratio: str = Form("unknown"),
):
    content = await image.read()

    # 1. Prepare the image for Gemini
    image_parts = [
        {
            "mime_type": image.content_type,
            "data": content,
        }
    ]

    # 2. The Prompt (image + spatial ratio)
    prompt = f"""
    Analyze this person's outfit and body proportions for a fashion app.
    Use both the uploaded image and the numeric shoulder-to-hip ratio to infer body shape and styling advice.

    CRITICAL SPATIAL DATA: The user's shoulder-to-hip ratio calculated on-device is {body_ratio}.
    - A ratio > 1.2 indicates an inverted triangle shape.
    - A ratio < 0.9 indicates a pear shape.
    - A ratio between 0.9 and 1.1 indicates a rectangular or hourglass shape.
    (Note: if the ratio is 'unknown', just provide general styling advice based on the image alone).

    Return ONLY a valid JSON object with this exact structure:
    {{
      "detected_outfit": {{
        "status": "success",
        "items": [
          {{"label": "t-shirt", "color": "white", "type": "top"}},
          {{"label": "jeans", "color": "blue", "type": "bottom"}}
        ],
        "style_tags": ["casual", "minimalist"]
      }},
      "spatial_analysis": {{
        "body_shape": "string (e.g., Inverted Triangle, Pear, Rectangle, Hourglass, or Unknown)",
        "fit_advice": "1-2 sentences of specific styling advice that explicitly references the {body_ratio} ratio."
      }}
    }}
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
            "schema_version": "v2",
            "request_id": str(int(time.time())),
            "status": "success",
            "analysis": ai_data
        }
        
    except Exception as e:
        return {
            "schema_version": "v2",
            "status": "error",
            "message": str(e)
        }