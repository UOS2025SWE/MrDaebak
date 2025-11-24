import torch
import io
import re
from diffusers import StableDiffusion3Pipeline
from ..config import settings
from .text_embedding import get_text_embedding_service

class ImageService:
    def __init__(self):
        # CPU 강제 사용 또는 GPU_ID가 -1이면 CPU 사용
        if settings.IMAGE_USE_CPU or settings.IMAGE_GPU_ID < 0:
            self.device = "cpu"
        elif torch.cuda.is_available() and settings.IMAGE_GPU_ID >= 0:
            self.device = f"cuda:{settings.IMAGE_GPU_ID}"
        else:
            self.device = "cpu"
        print(f"Loading Image Model on {self.device}...")
        
        # Image model loading with fallback strategies
        # Stable Diffusion 3.5 Medium uses bfloat16 for GPU, float32 for CPU
        try:
            if "cuda" in self.device:
                # GPU mode: try bfloat16 first (SD3.5 recommended), then fallback
                load_attempts = [
                    {
                        "torch_dtype": torch.bfloat16,
                        "desc": "bfloat16 (SD3.5 recommended)"
                    },
                    {
                        "torch_dtype": torch.float16,
                        "desc": "float16 fallback"
                    },
                    {
                        "torch_dtype": torch.float32,
                        "desc": "float32 fallback"
                    }
                ]
            else:
                # CPU mode: use float32
                load_attempts = [
                    {
                        "torch_dtype": torch.float32,
                        "desc": "float32"
                    }
                ]
            
            last_error = None
            for attempt in load_attempts:
                # Retry logic for network/download errors
                max_retries = 3
                retry_delay = 5  # seconds
                
                for retry in range(max_retries):
                    try:
                        if retry > 0:
                            print(f"Retry {retry}/{max_retries-1}: Attempting to load {settings.IMAGE_MODEL} with: {attempt['desc']}")
                        else:
                            print(f"Attempting to load {settings.IMAGE_MODEL} with: {attempt['desc']}")
                        
                        self.pipe = StableDiffusion3Pipeline.from_pretrained(
                settings.IMAGE_MODEL,
                            torch_dtype=attempt["torch_dtype"],
                            local_files_only=False,  # Allow re-download if cache is corrupted
                        )
                        self.pipe = self.pipe.to(self.device)
                        print(f"Image model loaded successfully on {self.device} using {attempt['desc']}")
                        return  # Success, exit
                    except RuntimeError as e:
                        error_str = str(e)
                        # Check if it's a network/download error
                        if "CAS service error" in error_str or "Reqwest Error" in error_str or "error decoding response body" in error_str:
                            if retry < max_retries - 1:
                                print(f"Network error detected, retrying in {retry_delay} seconds... (attempt {retry + 1}/{max_retries})")
                                import time
                                time.sleep(retry_delay)
                                continue
                            else:
                                last_error = e
                                print(f"Failed after {max_retries} retries with {attempt['desc']}: {str(e)[:200]}")
                        else:
                            # Not a network error, don't retry
                            last_error = e
                            print(f"Failed with {attempt['desc']}: {str(e)[:200]}")
                            break
                    except Exception as e:
                        last_error = e
                        print(f"Failed with {attempt['desc']}: {str(e)[:200]}")
                        break  # Don't retry for other errors
            
            # If all attempts failed, raise the last error
            raise last_error if last_error else Exception("All loading attempts failed")
            
        except Exception as e:
            print(f"Failed to load Image model after all attempts: {e}")
            import traceback
            traceback.print_exc()
            raise

        # 텍스트 임베딩 서비스는 항상 CPU에서만 동작
        # (이미지 생성은 GPU에서, 임베딩은 CPU에서)
        try:
            self.text_embedding_service = get_text_embedding_service()
            print(
                "TextEmbeddingService initialised for ImageService "
                f"(model={settings.TEXT_EMBEDDING_MODEL}, device=cpu)"
            )
        except Exception as e:
            # 임베딩 서비스는 부가 기능이므로, 실패해도 이미지 생성 자체는 계속 동작하게 둔다.
            print(f"Failed to initialise TextEmbeddingService: {e}")
            self.text_embedding_service = None

    async def _translate_to_english(self, korean_prompt: str) -> str:
        """한국어 프롬프트를 영어로 번역 (LLM 사용)"""
        try:
            from .llm import get_llm_service
            
            # 한국어가 포함되어 있는지 확인
            korean_pattern = re.compile(r'[가-힣]+')
            if not korean_pattern.search(korean_prompt):
                # 한국어가 없으면 그대로 반환
                return korean_prompt.strip()
            
            llm_service = get_llm_service()
            
            # 번역 프롬프트 생성
            translation_prompt = f"""Translate the following Korean text to English. Only output the English translation, nothing else.

Korean text: {korean_prompt}

English translation:"""
            
            # LLM을 사용하여 번역
            english_prompt = await llm_service.generate(
                prompt=translation_prompt,
                max_tokens=200,
                temperature=0.3  # 낮은 temperature로 일관된 번역
            )
            
            # 결과 정리 (앞뒤 공백 제거, 따옴표 제거 등)
            english_prompt = english_prompt.strip()
            # 따옴표로 감싸져 있으면 제거
            if english_prompt.startswith('"') and english_prompt.endswith('"'):
                english_prompt = english_prompt[1:-1]
            elif english_prompt.startswith("'") and english_prompt.endswith("'"):
                english_prompt = english_prompt[1:-1]
            
            print(f"Translated prompt: {korean_prompt} -> {english_prompt}")
            return english_prompt.strip()
            
        except Exception as e:
            print(f"Translation failed, using original prompt: {e}")
            # 번역 실패 시 원본 프롬프트 반환
            return korean_prompt.strip()

    async def generate(self, prompt: str, width: int = 1024, height: int = 1024, negative_prompt: str = "") -> bytes:
        """
        이미지 생성 (한국어 프롬프트는 자동으로 영어로 번역)
        Stable Diffusion 3.5 Medium 파라미터 사용
        """
        # 한국어 프롬프트를 영어로 번역
        english_prompt = await self._translate_to_english(prompt)
        
        # (옵션) 텍스트 임베딩을 CPU에서 계산해 두고, 필요 시 GPU 파이프라인에서 활용 가능
        # 현재는 주로 검색/로그/추후 기능 확장을 위해 미리 계산해 두는 용도.
        prompt_embedding = None
        if self.text_embedding_service is not None:
            try:
                prompt_embedding = self.text_embedding_service.encode(english_prompt)
            except Exception as e:
                print(f"Text embedding failed (ignored): {e}")

        # Stable Diffusion 3.5 Medium 권장 파라미터 사용
        # num_inference_steps=40, guidance_scale=4.5 (공식 문서 권장값)
        generate_kwargs = {
            "prompt": english_prompt,
            "num_inference_steps": 40,  # SD3.5 권장값
            "guidance_scale": 4.5,  # SD3.5 권장값
            "height": height,
            "width": width,
        }
        
        # negative_prompt가 제공되면 추가
        if negative_prompt:
            generate_kwargs["negative_prompt"] = negative_prompt
        
        # Generator는 선택사항이지만 재현성을 위해 추가 가능
        if "cuda" in self.device:
            generate_kwargs["generator"] = torch.Generator(device=self.device)
        
        # 번역된 영어 프롬프트로 이미지 생성
        image = self.pipe(**generate_kwargs).images[0]
        
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='PNG')
        return img_byte_arr.getvalue()

image_service = None
def get_image_service():
    global image_service
    if image_service is None:
        image_service = ImageService()
    return image_service

