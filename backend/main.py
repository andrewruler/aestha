from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import google.generativeai as genai
import time
import os
import json
import asyncio
import requests
from typing import Optional
# --- NEW IMPORT ---
from serpapi import GoogleSearch

app = FastAPI(title="Aestha AI Backend")
# --- NEW API KEY ---
SERPAPI_API_KEY = os.environ.get("SERPAPI_API_KEY")

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

# Upgraded Retail Catalog with UI Metadata
GARMENT_CATALOG = {
    "white t-shirt": {
        "id": "white_tshirt",
        "brand": "ESSENTIALS",
        "name": "Heavyweight Cotton Tee",
        "price": "$45",
        "url": "https://i.ibb.co/pLp1pMh/white-tshirt.png",
        "category": "tops",
        "aliases": ["white tee", "tshirt", "t-shirt", "tee shirt"],
    },
    "blue jeans": {
        "id": "blue_jeans",
        "brand": "ACNE STUDIOS",
        "name": "1989 Loose Fit Denim",
        "price": "$380",
        "url": "https://i.ibb.co/M9vGv1s/blue-jeans.png",
        "category": "bottoms",
        "aliases": ["jeans", "denim jeans", "blue denim"],
    },
    "black hoodie": {
        "id": "black_hoodie",
        "brand": "AESTHA CORE",
        "name": "Oversized Tech Hoodie",
        "price": "$120",
        "url": "https://i.ibb.co/6y4T0h9/black-hoodie.png",
        "category": "tops",
        "aliases": ["hoodie", "black sweatshirt"],
    },
    "floral dress": {
        "id": "floral_dress",
        "brand": "ZIMMERMANN",
        "name": "Botanical Silk Midi",
        "price": "$650",
        "url": "https://i.ibb.co/RQYh5Z5/floral-dress.png",
        "category": "one-pieces",
        "aliases": ["dress", "floral one piece"],
    },
    "beige chinos": {
        "id": "beige_chinos",
        "brand": "LEMAIRE",
        "name": "Pleated Wide Trousers",
        "price": "$495",
        "url": "https://i.ibb.co/vX3wVfQ/beige-chinos.png",
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


@app.get("/catalog")
async def get_catalog():
    """
    Returns the live retail inventory for the frontend carousel.
    """
    items = []
    for key, val in GARMENT_CATALOG.items():
        image_url = validate_or_fallback_garment_url(val["url"])
        items.append({
            "id": val["id"],
            "brand": val["brand"],
            "name": val["name"],
            "price": val["price"],
            "image": image_url,
            "label": key,
        })
    return {"status": "success", "catalog": items}


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
            "mode": "quality",
            "moderation_level": "permissive",
            "garment_photo_type": "flat-lay",
            "output_format": "png",
            "num_samples": 1,
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
    front_image: Optional[UploadFile] = File(None),
    face_image: Optional[UploadFile] = File(None),
    image: Optional[UploadFile] = File(None),  # Backward-compatible fallback
    gender: str = Form("unknown"),
    height_cm: str = Form("unknown"),
    shoulder_cm: str = Form("unknown"),
    chest_cm: str = Form("unknown"),
    waist_cm: str = Form("unknown"),
    hip_cm: str = Form("unknown"),
    fit_preference: str = Form("unknown"),
    aesthetic: str = Form("unknown"),
    preferred_fit: str = Form("unknown"),
    preferred_palette: str = Form("unknown"),
    preferred_aesthetic: str = Form("unknown"),
):
    resolved_front = front_image or image
    if not resolved_front:
        return {
            "schema_version": "v3",
            "status": "error",
            "message": "Missing required image upload (front_image or image).",
        }

    resolved_fit = fit_preference if fit_preference != "unknown" else preferred_fit
    resolved_aesthetic = aesthetic if aesthetic != "unknown" else preferred_aesthetic

    parts = []
    front_bytes = await resolved_front.read()
    parts.append({
        "mime_type": resolved_front.content_type or "image/jpeg",
        "data": front_bytes,
    })

    if face_image:
        face_bytes = await face_image.read()
        parts.append({
            "mime_type": face_image.content_type or "image/jpeg",
            "data": face_bytes,
        })

    prompt = f"""
    You are an elite Creative Director and Fashion Stylist specializing in K-style, Asian streetwear, and high-fashion minimalism.
    Analyze the provided photos (a front-body silhouette and optionally a face/shoulder shot).

    CRITICAL CLIENT DATA:
    - Gender Profile: {gender}
    - Exact Measurements: Height {height_cm}cm | Shoulders {shoulder_cm}cm | Chest {chest_cm}cm | Waist {waist_cm}cm | Hips {hip_cm}cm
    - User Preferences: Fit ({resolved_fit}), Aesthetic ({resolved_aesthetic}), Palette ({preferred_palette})

    YOUR TASK:
    1. Color Theory: If a face image is provided, infer their Seasonal Color Palette (e.g., Soft Autumn, Clear Winter). If no face image, set color_season to "Unknown".
    2. Body Geometry: Use literal centimeter measurements to classify Kibbe body type or geometric silhouette.
    3. Synthesis: Generate a cohesive 2-piece outfit recommendation (1 top, 1 bottom) honoring preferences.

    Return ONLY a valid JSON object with this exact structure:
    {{
      "spatial_analysis": {{
        "body_shape": "e.g., Flamboyant Natural, Pear, Inverted Triangle",
        "color_season": "e.g., Deep Autumn (or 'Unknown' if no face photo)",
        "geometry_advice": "2 sentences explaining how to dress for exact {shoulder_cm}cm shoulders and {hip_cm}cm hips."
      }},
      "style_synthesis": {{
        "overall_vibe": "A 3-word summary of the look",
        "outfit": [
          {{"category": "tops", "description": "specific top recommendation", "search_term": "top search term"}},
          {{"category": "bottoms", "description": "specific bottom recommendation", "search_term": "bottom search term"}}
        ],
        "stylist_rationale": "2 sentences explaining why this outfit flatters color season and geometry."
      }},
      "detected_outfit": {{
        "status": "success",
        "items": [
          {{"label": "white t-shirt", "color": "white", "type": "top"}},
          {{"label": "blue jeans", "color": "blue", "type": "bottom"}}
        ],
        "style_tags": ["k-style", "minimalist"]
      }}
    }}
    """
    parts.insert(0, prompt)

    try:
        response = model.generate_content(
            parts,
            generation_config={"response_mime_type": "application/json"}
        )
        ai_data = json.loads(response.text)
        return {
            "schema_version": "v3",
            "request_id": str(int(time.time())),
            "status": "success",
            "analysis": ai_data
        }
    except Exception as e:
        return {
            "schema_version": "v3",
            "status": "error",
            "message": str(e)
        }