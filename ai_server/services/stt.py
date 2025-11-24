import torch
import io
import soundfile as sf
import numpy as np
from transformers import pipeline
from pydub import AudioSegment
from ..config import settings

class STTService:
    def __init__(self):
        # CPU 강제 사용 또는 GPU_ID가 -1이면 CPU 사용
        if settings.STT_USE_CPU or settings.STT_GPU_ID < 0:
            device = "cpu"
        elif torch.cuda.is_available() and settings.STT_GPU_ID >= 0:
            device = f"cuda:{settings.STT_GPU_ID}"
        else:
            device = "cpu"
        print(f"Loading STT Model on {device}...")
        self.pipe = pipeline(
            "automatic-speech-recognition",
            model=settings.STT_MODEL,
            chunk_length_s=30,
            device=device,
        )

    def transcribe(self, audio_data: bytes, language: str = "korean") -> dict:
        try:
            # Try to read with soundfile first (for wav, flac, etc.)
            try:
            data, samplerate = sf.read(io.BytesIO(audio_data))
            except Exception:
                # If soundfile fails, try converting with pydub (for webm, mp4, etc.)
                try:
                    # Detect format from audio data
                    audio_segment = AudioSegment.from_file(io.BytesIO(audio_data))
                    # Convert to wav format (16kHz mono, which is what Whisper expects)
                    audio_segment = audio_segment.set_frame_rate(16000).set_channels(1)
                    # Export to wav bytes
                    wav_buffer = io.BytesIO()
                    audio_segment.export(wav_buffer, format="wav")
                    wav_buffer.seek(0)
                    # Now read with soundfile
                    data, samplerate = sf.read(wav_buffer)
                except Exception as e2:
                    print(f"STT Error: Failed to convert audio format: {e2}")
                    raise ValueError(f"Failed to process audio: Unsupported format or corrupted audio data")
            
            # The pipeline expects input to be a numpy array (or list)
            # It automatically handles resampling if needed
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

