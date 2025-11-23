import torch
import io
import soundfile as sf
import numpy as np
from transformers import pipeline
from ..config import settings

class STTService:
    def __init__(self):
        device = f"cuda:{settings.STT_GPU_ID}" if torch.cuda.is_available() and settings.STT_GPU_ID >= 0 else "cpu"
        print(f"Loading STT Model on {device}...")
        self.pipe = pipeline(
            "automatic-speech-recognition",
            model=settings.STT_MODEL,
            chunk_length_s=30,
            device=device,
        )

    def transcribe(self, audio_data: bytes, language: str = "korean") -> dict:
        try:
            # sf.read can read from file-like object
            data, samplerate = sf.read(io.BytesIO(audio_data))
            
            # The pipeline expects input to be a numpy array (or list)
            # It automatically handles resampling if needed? 
            # Usually it expects 16kHz, but pipeline handles it if we pass the array.
            
            result = self.pipe(data, generate_kwargs={"language": language})
            return {"text": result["text"]}
        except Exception as e:
            print(f"STT Error: {e}")
            raise ValueError(f"Failed to process audio: {e}")

stt_service = None
def get_stt_service():
    global stt_service
    if stt_service is None:
        stt_service = STTService()
    return stt_service

