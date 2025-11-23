import torch
import io
from diffusers import DiffusionPipeline
from ..config import settings

class ImageService:
    def __init__(self):
        self.device = f"cuda:{settings.IMAGE_GPU_ID}" if torch.cuda.is_available() and settings.IMAGE_GPU_ID >= 0 else "cpu"
        print(f"Loading Image Model on {self.device}...")
        
        # Kolors might require specific loading logic, but assuming Diffusers support
        try:
            self.pipe = DiffusionPipeline.from_pretrained(
                settings.IMAGE_MODEL,
                torch_dtype=torch.float16 if "cuda" in self.device else torch.float32,
                variant="fp16" if "cuda" in self.device else None,
                use_safetensors=True
            )
            self.pipe.to(self.device)
        except Exception as e:
            print(f"Failed to load Image model: {e}")
            # Fallback or re-raise
            raise

    def generate(self, prompt: str, width: int = 1024, height: int = 1024) -> bytes:
        # Kolors specific: It might use 'prompt' and 'negative_prompt'
        
        image = self.pipe(
            prompt=prompt,
            height=height,
            width=width,
            num_inference_steps=25
        ).images[0]
        
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='PNG')
        return img_byte_arr.getvalue()

image_service = None
def get_image_service():
    global image_service
    if image_service is None:
        image_service = ImageService()
    return image_service

