from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from contextlib import asynccontextmanager
import base64
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from .services.stt import get_stt_service
from .services.llm import get_llm_service
from .services.image import get_image_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize services on startup
    logger.info("Initializing AI models...")
    try:
        get_stt_service()
        get_image_service()
        get_llm_service()
        logger.info("AI models initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")
        # We might allow startup even if models fail, but requests will fail
    yield
    logger.info("Shutting down AI server.")

app = FastAPI(lifespan=lifespan, title="AI Server")

# Pydantic models
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str = "exaone"
    messages: List[ChatMessage]
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.7

class ImageGenerationRequest(BaseModel):
    prompt: str
    size: str = "1024x1024"
    n: int = 1

@app.post("/v1/audio/transcriptions")
async def transcribe_audio(file: UploadFile = File(...), model: str = "whisper"):
    service = get_stt_service()
    content = await file.read()
    try:
        result = service.transcribe(content)
        return result
    except Exception as e:
        logger.error(f"STT failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat/completions")
async def chat_completion(request: ChatCompletionRequest):
    service = get_llm_service()
    messages = [msg.model_dump() for msg in request.messages]
    try:
        response_text = await service.chat_completion(
            messages=messages, 
            max_tokens=request.max_tokens
        )
        return {
            "id": "chatcmpl-custom",
            "object": "chat.completion",
            "created": 1234567890,
            "model": request.model,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": response_text
                },
                "finish_reason": "stop"
            }]
        }
    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/images/generations")
async def generate_image(request: ImageGenerationRequest):
    service = get_image_service()
    # Parse size
    try:
        width, height = map(int, request.size.split("x"))
    except:
        width, height = 1024, 1024
        
    try:
        image_bytes = service.generate(request.prompt, width=width, height=height)
        b64_json = base64.b64encode(image_bytes).decode("utf-8")
        return {
            "created": 1234567890,
            "data": [{"b64_json": b64_json}]
        }
    except Exception as e:
        logger.error(f"Image generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok"}

