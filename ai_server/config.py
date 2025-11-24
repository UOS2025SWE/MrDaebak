import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # STT Settings
    STT_MODEL: str = "openai/whisper-large-v3"
    STT_GPU_ID: int = int(os.getenv("STT_GPU_ID", "0"))
    # STT_USE_CPU: "true" -> CPU 사용, "false" 또는 미설정 -> GPU 사용 (기본값: GPU 사용)
    STT_USE_CPU: bool = os.getenv("STT_USE_CPU", "false").lower() == "true"

    # LLM Settings
    LLM_MODEL: str = "Qwen/Qwen3-4B-Instruct-2507"
    LLM_GPU_ID: int = int(os.getenv("LLM_GPU_ID", "0"))
    # LLM_USE_CPU: "true" -> CPU 사용, "false" 또는 미설정 -> GPU 사용 (기본값: GPU 사용)
    LLM_USE_CPU: bool = os.getenv("LLM_USE_CPU", "false").lower() == "true"
    LLM_MAX_MODEL_LEN: int = 4096

    # Image Gen Settings
    IMAGE_MODEL: str = os.getenv(
        "IMAGE_MODEL", "stabilityai/stable-diffusion-3.5-medium")
    IMAGE_GPU_ID: int = int(os.getenv("IMAGE_GPU_ID", "0"))
    # IMAGE_USE_CPU: "true" -> CPU 사용, "false" 또는 미설정 -> GPU 사용 (기본값: GPU 사용)
    IMAGE_USE_CPU: bool = os.getenv(
        "IMAGE_USE_CPU", "false").lower() == "true"
    IMAGE_USE_QUANTIZATION: bool = os.getenv(
        "IMAGE_USE_QUANTIZATION", "false").lower() == "true"
    IMAGE_ENABLE_CPU_OFFLOAD: bool = os.getenv(
        "IMAGE_ENABLE_CPU_OFFLOAD", "true").lower() == "true"

    class Config:
        env_file = ".env"


settings = Settings()
