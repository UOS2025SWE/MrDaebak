from __future__ import annotations

import logging
from typing import Tuple
from .ai_client import get_ai_client

logger = logging.getLogger(__name__)

class ImageGenerationService:
    def __init__(self) -> None:
        self.client = get_ai_client()

    async def generate_image(self, prompt: str, aspect_ratio: str = "1:1") -> Tuple[bytes, str]:
        # Aspect ratio mapping to resolution
        # Default 1:1
        width, height = 1024, 1024
        
        if aspect_ratio == "16:9":
            width, height = 1216, 832
        elif aspect_ratio == "9:16":
            width, height = 832, 1216
        elif aspect_ratio == "4:3":
            width, height = 1152, 896
        elif aspect_ratio == "3:4":
            width, height = 896, 1152
            
        try:
            return await self.client.generate_image(prompt, width=width, height=height)
        except Exception as e:
            logger.error(f"Image generation failed: {e}")
            raise

    async def edit_image(self, *args, **kwargs):
        raise NotImplementedError("Image editing not supported in this version.")

image_generation_service = None

def get_image_generation_service() -> ImageGenerationService:
    global image_generation_service
    if image_generation_service is None:
        image_generation_service = ImageGenerationService()
    return image_generation_service

