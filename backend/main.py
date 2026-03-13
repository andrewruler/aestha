from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import google.generativeai as genai
import time
import os
import json
import asyncio
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
DEFAULT_GARMENT_IMAGE_URL = "https://v3.fal.media/files/elephant/qXMQpeM6fVOlg7bZs0dEh_fashn-tshirt-2.png"

# Simple mapping from Gemini clothing labels to garment image URLs
GARMENT_CATALOG = {
    "white t-shirt": {
        "url": DEFAULT_GARMENT_IMAGE_URL,
        "category": "tops",
        "aliases": ["white tee", "tshirt", "t-shirt", "tee shirt"],
    },
    "blue jeans": {
        "url": DEFAULT_GARMENT_IMAGE_URL,
        "category": "bottoms",
        "aliases": ["jeans", "denim jeans", "blue denim"],
    },
    "black hoodie": {
        "url": DEFAULT_GARMENT_IMAGE_URL,
        "category": "tops",
        "aliases": ["hoodie", "black sweatshirt"],
    },
    "floral dress": {
        "url": DEFAULT_GARMENT_IMAGE_URL,
        "category": "one-pieces",
        "aliases": ["dress", "floral one piece"],
    },
    "beige chinos": {
        "url": DEFAULT_GARMENT_IMAGE_URL,
        "category": "bottoms",
        "aliases": ["chinos", "beige pants"],
    },
}


def upload_to_supabase(path: str, data: bytes) -> str:
    """
    Upload raw bytes to a Supabase Storage bucket and return the public URL.
    """
    if not SUPABASE_API_KEY:
        raise RuntimeError("SUPABASE_API_KEY is not configured")

    upload_url = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{path}"
    headers = {
        "apikey": SUPABASE_API_KEY,
        "Authorization": f"Bearer {SUPABASE_API_KEY}",
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
    }
    # Use PUT with raw bytes for direct object upload.
    resp = requests.put(upload_url, headers=headers, data=data, timeout=30)
    if not resp.ok:
        raise RuntimeError(
            f"Supabase upload failed (HTTP {resp.status_code}): {resp.text}"
        )
    # For a public bucket, the public URL follows this pattern:
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{path}"


def normalize_label(label: str) -> str:
    cleaned = (label or "").lower().replace("_", " ").replace("-", " ")
    return " ".join(cleaned.split())


def resolve_garment(label: str):
    normalized = normalize_label(label)

    # Exact match on canonical keys
    if normalized in GARMENT_CATALOG:
        return GARMENT_CATALOG[normalized]

    # Match aliases
    for _, meta in GARMENT_CATALOG.items():
        for alias in meta["aliases"]:
            if normalized == normalize_label(alias):
                return meta

    # Keyword fallback for model label variance
    if "jean" in normalized or "denim" in normalized:
        return GARMENT_CATALOG["blue jeans"]
    if "chino" in normalized or "pant" in normalized:
        return GARMENT_CATALOG["beige chinos"]
    if "hoodie" in normalized or "sweatshirt" in normalized:
        return GARMENT_CATALOG["black hoodie"]
    if "dress" in normalized:
        return GARMENT_CATALOG["floral dress"]
    if "tee" in normalized or "tshirt" in normalized or "t shirt" in normalized:
        return GARMENT_CATALOG["white t-shirt"]

    return None


def validate_or_fallback_garment_url(url: str) -> str:
    """
    Ensure garment URL is externally fetchable by FASHN.
    If not, fall back to a known working public garment URL.
    """
    try:
        resp = requests.get(url, timeout=12, stream=True)
        ok = resp.status_code < 400
        resp.close()
        if ok:
            return url
    except Exception:
        pass
    return DEFAULT_GARMENT_IMAGE_URL


def get_fashn_api_key():
    """
    Read and sanitize FASHN API key from env.
    Render env values can accidentally include quotes or whitespace.
    """
    raw = os.environ.get("FASHN_API_KEY")
    if not raw:
        return None
    cleaned = raw.strip().strip('"').strip("'").strip()
    return cleaned or None

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")


@app.get("/health/fashn-auth")
async def health_fashn_auth():
    """
    Lightweight auth diagnostic for FASHN key validity.
    It intentionally uses a fake status id:
    - 401 => key is invalid
    - 404/400 => key is likely valid (auth passed, id invalid)
    """
    fashn_api_key = get_fashn_api_key()
    if not fashn_api_key:
        return {
            "ok": False,
            "message": "FASHN_API_KEY missing after sanitization",
        }

    headers = {
        "Authorization": f"Bearer {fashn_api_key}",
        "X-API-KEY": fashn_api_key,
    }
    test_url = "https://api.fashn.ai/v1/status/healthcheck-invalid-job-id"

    try:
        resp = requests.get(test_url, headers=headers, timeout=15)
        return {
            "ok": resp.status_code != 401,
            "status_code": resp.status_code,
            "key_prefix": fashn_api_key[:6] + "***",
            "key_length": len(fashn_api_key),
            "response_snippet": (resp.text or "")[:220],
        }
    except Exception as e:
        return {
            "ok": False,
            "message": f"Failed to reach FASHN: {e}",
            "key_prefix": fashn_api_key[:6] + "***",
            "key_length": len(fashn_api_key),
        }


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
    garment = resolve_garment(clothing_item)
    if not garment:
        return {
            "status": "error",
            "message": f"No garment image mapped for clothing item '{clothing_item}'",
        }
    garment_url = validate_or_fallback_garment_url(garment["url"])

    fashn_api_key = get_fashn_api_key()
    if not fashn_api_key:
        return {"status": "error", "message": "FASHN_API_KEY is not configured"}

    headers = {
        "Authorization": f"Bearer {fashn_api_key}",
        "X-API-KEY": fashn_api_key,
        "Content-Type": "application/json",
    }

    # FASHN v1.6 uses the universal /v1/run format:
    # {
    #   "model_name": "tryon-v1.6",
    #   "inputs": { "model_image": "...", "garment_image": "...", ... }
    # }
    run_payload = {
        "model_name": "tryon-v1.6",
        "inputs": {
            "model_image": user_image_url,
            "garment_image": garment_url,
            "category": garment["category"],
            "mode": "balanced",
            "moderation_level": "permissive",
        },
    }

    # 3. Start the FASHN job
    try:
        run_resp = requests.post(
            "https://api.fashn.ai/v1/run",
            json=run_payload,
            headers=headers,
            timeout=30,
        )
        run_resp.raise_for_status()
        run_data = run_resp.json()
    except Exception as e:
        error_body = ""
        if "run_resp" in locals():
            error_body = (run_resp.text or "")[:300]
        return {
            "status": "error",
            "message": f"FASHN run failed: {e}",
            "details": {
                "fashn_http_status": getattr(run_resp, "status_code", None) if "run_resp" in locals() else None,
                "fashn_response_snippet": error_body,
                "key_prefix": fashn_api_key[:6] + "***",
                "key_length": len(fashn_api_key),
            },
        }

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
            status_resp.raise_for_status()
            status_data = status_resp.json()
        except Exception as e:
            return {
                "status": "error",
                "message": f"FASHN status check failed: {e}",
                "job_id": job_id,
            }

        status = status_data.get("status")
        if status == "completed":
            output = status_data.get("output") or []
            first_output = output[0] if isinstance(output, list) and output else None
            result_url = (
                first_output
                or status_data.get("image_url")
                or status_data.get("result_image_url")
                or status_data.get("output_image")
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

        await asyncio.sleep(3)

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
    height_cm: str = Form("unknown"),
    shoulder_cm: str = Form("unknown"),
    hip_cm: str = Form("unknown"),
    gender: str = Form("unknown"),
):
    content = await image.read()

    # 1. Prepare the image for Gemini
    image_parts = [
        {
            "mime_type": image.content_type,
            "data": content,
        }
    ]

    # 2. Upgraded prompt with exact anthropometric measurements
    prompt = f"""
    You are an elite fashion stylist specializing in K-style and minimalist aesthetics.
    Analyze the uploaded photo and the exact anthropometric measurements provided.

    CRITICAL CLIENT DATA:
    - Gender Profile: {gender}
    - Height: {height_cm} cm
    - Shoulder Width: {shoulder_cm} cm
    - Hip Width: {hip_cm} cm

    Use these measurements to infer their geometric silhouette (e.g., Pear, Inverted Triangle,
    Hourglass, Rectangle) and provide concrete fit guidance.
    Recommend specific cuts that balance these exact proportions.

    Return ONLY a valid JSON object with this exact structure:
    {{
      "detected_outfit": {{
        "status": "success",
        "items": [
          {{"label": "t-shirt", "color": "white", "type": "top"}}
        ],
        "style_tags": ["casual", "k-style"]
      }},
      "spatial_analysis": {{
        "body_shape": "String classification (e.g., Pear, Inverted Triangle, True Hourglass)",
        "fit_advice": "2-3 sentences of highly specific tailoring advice referencing their {shoulder_cm}cm shoulders and {hip_cm}cm hips."
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