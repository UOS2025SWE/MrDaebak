import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # STT Settings
    STT_MODEL: str = "openai/whisper-large-v3"
    STT_GPU_ID: int = int(os.getenv("STT_GPU_ID", "0"))

    # LLM Settings
    LLM_MODEL: str = "LGAI-EXAONE/EXAONE-4.0-1.2B"
    LLM_GPU_ID: int = int(os.getenv("LLM_GPU_ID", "0"))
    LLM_MAX_MODEL_LEN: int = 4096

    # Image Gen Settings
    IMAGE_MODEL: str = "Kwai-Kolors/Kolors-diffusers"
    IMAGE_GPU_ID: int = int(os.getenv("IMAGE_GPU_ID", "0"))

    class Config:
        env_file = ".env"

settings = Settings()

