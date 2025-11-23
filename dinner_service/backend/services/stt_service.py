from __future__ import annotations

import os
import logging
from io import BytesIO
from typing import Optional

from .ai_client import get_ai_client

logger = logging.getLogger(__name__)

class STTService:
    def __init__(self) -> None:
        self.client = get_ai_client()

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        filename: str,
        mime_type: str | None = None,
        language: str | None = None,
    ) -> str:
        if not audio_bytes:
            raise ValueError("음성 데이터가 비어 있습니다.")

        try:
            # AI Server handles language automatically or defaults to Korean in our implementation
            return await self.client.transcribe(audio_bytes, filename=filename)
        except Exception as e:
            logger.error(f"STT failed: {e}")
            raise

stt_service = None

def get_stt_service() -> STTService:
    global stt_service
    if stt_service is None:
        stt_service = STTService()
    return stt_service

