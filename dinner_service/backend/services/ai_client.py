import os
import json
import uuid
import base64
import logging
import redis.asyncio as redis
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class AIClient:
    def __init__(self):
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.redis = redis.from_url(self.redis_url)
        self.task_queue = "ai_task_queue"

    async def _send_request(self, task_type: str, payload: Dict[str, Any], timeout: int = 60) -> Dict[str, Any]:
        request_id = str(uuid.uuid4())
        message = {
            "type": task_type,
            "payload": payload,
            "request_id": request_id
        }

        result_key = f"ai_result:{request_id}"

        try:
            await self.redis.rpush(self.task_queue, json.dumps(message))

            # Wait for result
            # blpop returns (key, value) tuple
            result = await self.redis.blpop(result_key, timeout=timeout)

            if not result:
                raise TimeoutError("AI Server request timed out")

            _, response_data = result
            response = json.loads(response_data)

            if response.get("status") == "error":
                raise Exception(response.get(
                    "error", "Unknown error from AI Server"))

            return response.get("data")

        except Exception as e:
            logger.error(f"Redis AI Request Error ({task_type}): {e}")
            raise

    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        # Encode audio to base64
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        payload = {
            "audio_data": audio_b64,
            "filename": filename
        }

        result = await self._send_request("transcribe", payload)
        return result.get("text", "")

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.7
    ) -> str:
        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }

        result = await self._send_request("chat_completion", payload)
        return result.get("content", "")

    async def generate_image(
        self,
        prompt: str,
        width: int = 1024,
        height: int = 1024
    ) -> tuple[bytes, str]:
        payload = {
            "prompt": prompt,
            "width": width,
            "height": height
        }

        result = await self._send_request("generate_image", payload, timeout=120)
        image_b64 = result.get("image_data")
        return base64.b64decode(image_b64), "image/png"


ai_client = None


def get_ai_client():
    global ai_client
    if ai_client is None:
        ai_client = AIClient()
    return ai_client
