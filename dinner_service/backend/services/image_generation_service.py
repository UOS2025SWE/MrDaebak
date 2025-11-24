from __future__ import annotations

import logging
from typing import Tuple
from .ai_client import get_ai_client

logger = logging.getLogger(__name__)


class ImageGenerationService:
    def __init__(self) -> None:
        self.client = get_ai_client()

    def _resolve_resolution(self, aspect_ratio: str) -> Tuple[int, int]:
        # 현재는 케이크 이미지를 1:1 고정 해상도로만 생성/수정
        # VRAM 절약을 위해 1024x1024 대신 768x768으로 고정 사용
        # (Stable Diffusion 3.5에서 권장 해상도 범위 내, 8의 배수)
        return (768, 768)

    async def generate_image(self, prompt: str, aspect_ratio: str = "1:1") -> Tuple[bytes, str]:
        width, height = self._resolve_resolution(aspect_ratio)
        try:
            return await self.client.generate_image(
                prompt=prompt,
                width=width,
                height=height,
            )
        except Exception as e:
            logger.error(f"Image generation failed: {e}")
            raise


image_generation_service = None


def get_image_generation_service() -> ImageGenerationService:
    global image_generation_service
    if image_generation_service is None:
        image_generation_service = ImageGenerationService()
    return image_generation_service
