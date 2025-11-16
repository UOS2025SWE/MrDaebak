"""
OpenAI 음성(STT/TTS) 서비스

- STT: OpenAI Python SDK v1.x 클라이언트 (client.audio.transcriptions)
- TTS: OpenAI Python SDK v1.x 클라이언트 (client.audio.speech.create)
"""

from __future__ import annotations

import os
from functools import lru_cache
from io import BytesIO

from openai import OpenAI


TTS_MIME_TYPES: dict[str, str] = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "aac": "audio/aac",
    "opus": "audio/opus",
}

MIME_EXTENSION_FALLBACK: dict[str, str] = {
    "audio/webm": "webm",
    "audio/webm;codecs=opus": "webm",
    "audio/ogg": "ogg",
    "audio/ogg;codecs=opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/aac": "aac",
    "audio/mp4": "mp4",
}


class OpenAIAudioService:
    """OpenAI Speech-to-Text / Text-to-Speech 서비스"""

    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

        # OpenAI 클라이언트 (STT/TTS 공통)
        self.client = OpenAI(api_key=api_key)
        self.stt_model = os.getenv("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe")
        # 공식 문서 기준 TTS 모델 (필요시 환경변수로 오버라이드)
        self.tts_model = os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
        self.default_voice = os.getenv("OPENAI_TTS_VOICE", "nova")
        self.default_tts_format = os.getenv("OPENAI_TTS_FORMAT", "mp3")

    @staticmethod
    def _extension_from_mime(mime_type: str | None) -> str:
        if not mime_type:
            return "webm"
        return MIME_EXTENSION_FALLBACK.get(mime_type.lower(), "webm")

    def transcribe_audio(
        self,
        audio_bytes: bytes,
        filename: str,
        mime_type: str | None = None,
        language: str | None = None,
    ) -> str:
        if not audio_bytes:
            raise ValueError("음성 데이터가 비어 있습니다.")

        buffer = BytesIO(audio_bytes)
        buffer.name = filename or f"recording.{self._extension_from_mime(mime_type)}"

        response = self.client.audio.transcriptions.create(
            model=self.stt_model,
            file=buffer,
            language=language or "ko",
        )

        transcript = getattr(response, "text", "").strip()
        if not transcript:
            raise ValueError("음성 인식 결과를 가져올 수 없습니다.")
        return transcript

    def synthesize_speech(
        self,
        text: str,
        *,
        voice: str | None = None,
        audio_format: str | None = None,
    ) -> tuple[bytes, str]:
        """
        텍스트를 음성으로 변환하고 (오디오 바이트, MIME 타입)을 반환합니다.

        OpenAI Python SDK v1.x의 audio.speech.create 응답 형식 차이를 흡수하기 위해
        여러 가능한 속성(to_bytes, read, data 등)을 처리합니다.
        """
        safe_text = (text or "").strip()
        if not safe_text:
            raise ValueError("음성으로 변환할 텍스트가 비어 있습니다.")

        selected_voice = voice or self.default_voice
        selected_format = (audio_format or self.default_tts_format).lower()
        if selected_format not in TTS_MIME_TYPES:
            selected_format = self.default_tts_format

        # OpenAI Python SDK v1.x audio.speech.create 사용 (공식 TTS 가이드)
        try:
            # OpenAI Python SDK v1.x 기준: 인자 이름은 response_format
            response = self.client.audio.speech.create(
                model=self.tts_model,
                voice=selected_voice,
                input=safe_text,
                response_format=selected_format,
            )
        except Exception as exc:  # pragma: no cover - 외부 API 오류
            raise ValueError(f"OpenAI TTS 호출 실패: {exc}") from exc

        audio_bytes: bytes | None = None

        # 새로운 SDK 객체는 to_bytes()를 제공
        if hasattr(response, "to_bytes"):
            try:
                audio_bytes = response.to_bytes()
            except Exception:
                audio_bytes = None

        # streaming 응답 또는 파일 유사 객체
        if audio_bytes is None and hasattr(response, "read"):
            try:
                audio_bytes = response.read()  # type: ignore[assignment]
            except Exception:
                audio_bytes = None

        # 일부 버전은 data 속성에 바이트를 담을 수 있음
        if audio_bytes is None and hasattr(response, "data"):
            data = getattr(response, "data")
            if isinstance(data, (bytes, bytearray)):
                audio_bytes = bytes(data)

        if audio_bytes is None:
            raise ValueError("음성 변환 결과를 가져올 수 없습니다.")

        return audio_bytes, TTS_MIME_TYPES[selected_format]


@lru_cache(maxsize=1)
def get_audio_service() -> OpenAIAudioService:
    """단일 인스턴스 제공"""
    return OpenAIAudioService()

