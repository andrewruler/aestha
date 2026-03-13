from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import google.generativeai as genai
import time
import os
import json
import requests  # Used for FASHN integration and listing models

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
model = genai.GenerativeModel("models/gemini-3-flash-preview")

# Supabase storage configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://ljrkmsffunpuouqvfvsj.supabase.co")
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "uploads")
SUPABASE_API_KEY = os.environ.get("SUPABASE_API_KEY")

# Simple mapping from Gemini clothing labels to garment image URLs
GARMENT_IMAGE_MAP = {
    "white t-shirt": "https://i.ibb.co/pLp1pMh/white-tshirt.png",
    "blue jeans": "https://i.ibb.co/M9vGv1s/blue-jeans.png",
    "black hoodie": "https://i.ibb.co/6y4T0h9/black-hoodie.png",
    "floral dress": "https://i.ibb.co/RQYh5Z5/floral-dress.png",
    "beige chinos": "https://i.ibb.co/vX3wVfQ/beige-chinos.png",
}


def upload_to_supabase(path: str, data: bytes) -> str:
    """
    Upload raw bytes to a Supabase Storage bucket and return the public URL.
    """
    if not SUPABASE_API_KEY:
        raise RuntimeError("SUPABASE_API_KEY is not configured")

    upload_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{path}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_API_KEY}",
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
    }
    resp = requests.post(upload_url, headers=headers, data=data, timeout=30)
    resp.raise_for_status()
    # For a public bucket, the public URL follows this pattern:
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{path}"

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")


@app.post("/try-on")
async def generate_try_on(
    user_image: UploadFile = File(...),
    clothing_item: str = Form(...),
):
    """
    Real try-on flow:
    - Uploads the user image to Supabase.
    - Looks up a garment image URL from the label.
    - Calls FASHN's run + status endpoints and returns the final result image URL.
    """
    # 1. Read and upload the user image
    user_bytes = await user_image.read()
    filename = user_image.filename or f"user-{int(time.time())}.jpg"
    storage_path = f"user-uploads/{int(time.time())}-{filename}"

    try:
        user_image_url = upload_to_supabase(storage_path, user_bytes)
    except Exception as e:
        return {"status": "error", "message": f"Failed to upload user image: {e}"}

    # 2. Map clothing label to garment URL
    garment_url = GARMENT_IMAGE_MAP.get(clothing_item.lower())
    if not garment_url:
        return {
            "status": "error",
            "message": f"No garment image mapped for clothing item '{clothing_item}'",
        }

    fashn_api_key = os.environ.get("FASHN_API_KEY")
    if not fashn_api_key:
        return {"status": "error", "message": "FASHN_API_KEY is not configured"}

    headers = {
        "Authorization": f"Bearer {fashn_api_key}",
        "Content-Type": "application/json",
    }

    run_payload = {
        "model_image": user_image_url,
        "garment_image": garment_url,
        "category": "tops",  # Could be refined based on clothing_item/type
        "nsfw_filter": True,
    }

    # 3. Start the FASHN job
    try:
        run_resp = requests.post(
            "https://api.fashn.ai/v1/run",
            json=run_payload,
            headers=headers,
            timeout=30,
        )
        run_data = run_resp.json()
    except Exception as e:
        return {"status": "error", "message": f"FASHN run failed: {e}"}

    job_id = run_data.get("id")
    if not job_id:
        return {
            "status": "error",
            "message": "FASHN did not return a job id",
            "details": run_data,
        }

    # 4. Poll status until completion or timeout
    status_url = f"https://api.fashn.ai/v1/status/{job_id}"
    max_attempts = 20  # ~60 seconds if we sleep 3s between polls
    for _ in range(max_attempts):
        try:
            status_resp = requests.get(status_url, headers=headers, timeout=30)
            status_data = status_resp.json()
        except Exception as e:
            return {
                "status": "error",
                "message": f"FASHN status check failed: {e}",
                "job_id": job_id,
            }

        status = status_data.get("status")
        if status == "completed":
            result_url = (
                status_data.get("image_url")
                or status_data.get("result_image_url")
                or user_image_url
            )
            return {
                "status": "completed",
                "job_id": job_id,
                "result_image_url": result_url,
            }
        if status in ("failed", "error"):
            return {
                "status": "error",
                "job_id": job_id,
                "details": status_data,
            }

        time.sleep(3)

    return {
        "status": "timeout",
        "job_id": job_id,
        "message": "FASHN job did not complete in time",
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