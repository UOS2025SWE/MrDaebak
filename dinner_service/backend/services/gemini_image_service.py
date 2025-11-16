"""
Gemini 이미지 생성/편집 서비스
REST API를 직접 사용하여 이미지 생성 기능 제공
"""

from __future__ import annotations

import base64
import json
import logging
import mimetypes
import os
from typing import Tuple

import httpx

logger = logging.getLogger(__name__)

GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

ALLOWED_ASPECT_RATIOS: tuple[str, ...] = (
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
)


class GeminiImageService:
    """Gemini 이미지 생성 및 편집을 담당하는 서비스"""

    def __init__(self) -> None:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY 또는 GOOGLE_API_KEY 환경 변수가 필요합니다")

        self._api_key = api_key
        self._model_name = GEMINI_IMAGE_MODEL
        self._api_url = f"{GEMINI_API_BASE}/models/{GEMINI_IMAGE_MODEL}:generateContent"

    @staticmethod
    def normalize_aspect_ratio(value: str | None) -> str:
        """허용된 가로세로 비율인지 검증"""
        if not value:
            return "1:1"

        normalized = value.strip()
        if normalized not in ALLOWED_ASPECT_RATIOS:
            raise ValueError(f"지원하지 않는 비율입니다: {normalized}")
        return normalized

    @staticmethod
    def _force_cake_prompt(user_prompt: str) -> str:
        """프롬프트가 반드시 케이크 이미지를 생성하도록 보강"""
        safe_prompt = (user_prompt or "").strip()
        if not safe_prompt:
            raise ValueError("프롬프트를 입력해주세요.")

        guardrails = (
            "Design an artisan custom celebration cake for a bakery catalogue. "
            "Always feature a cake as the main subject on a serving stand or board, "
            "with edible decorations, frosting details, and photogenic lighting. "
            "Do not generate scenes without a cake. "
            "Incorporate the following customer request: "
        )
        return f"{guardrails}{safe_prompt}"

    def generate_image(self, prompt: str, aspect_ratio: str = "1:1") -> Tuple[bytes, str]:
        """텍스트 프롬프트 기반 이미지 생성"""
        final_prompt = self._force_cake_prompt(prompt)
        ratio = self.normalize_aspect_ratio(aspect_ratio)

        try:
            payload = {
                "contents": [{
                    "parts": [{"text": final_prompt}]
                }],
                "generationConfig": {
                    "imageConfig": {
                        "aspectRatio": ratio
                    }
                }
            }

            response = httpx.post(
                f"{self._api_url}?key={self._api_key}",
                json=payload,
                timeout=60.0
            )
            response.raise_for_status()
            
            data = response.json()
            logger.debug("Gemini API 응답 구조: %s", json.dumps(data, indent=2, ensure_ascii=False)[:500])
            return self._extract_image_bytes_from_response(data)
        except httpx.HTTPStatusError as exc:
            error_text = exc.response.text[:500] if exc.response.text else "응답 없음"
            logger.error("Gemini API HTTP 오류: %s - %s", exc.response.status_code, error_text)
            raise RuntimeError(f"이미지 생성 API 호출 실패 (HTTP {exc.response.status_code}): {error_text}") from exc
        except Exception as exc:
            logger.error("Gemini 이미지 생성 실패: %s", exc, exc_info=True)
            raise

    def edit_image(
        self,
        base_image_bytes: bytes,
        base_mime_type: str,
        prompt: str,
        aspect_ratio: str = "1:1",
    ) -> Tuple[bytes, str]:
        """기존 이미지를 프롬프트로 수정"""
        if not base_image_bytes:
            raise ValueError("수정할 기본 이미지를 제공해주세요.")

        final_prompt = self._force_cake_prompt(prompt)
        ratio = self.normalize_aspect_ratio(aspect_ratio)

        mime_type = base_mime_type or "image/png"
        image_b64 = base64.b64encode(base_image_bytes).decode("utf-8")

        try:
            payload = {
                "contents": [{
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": image_b64
                            }
                        },
                        {"text": final_prompt}
                    ]
                }],
                "generationConfig": {
                    "imageConfig": {
                        "aspectRatio": ratio
                    }
                }
            }

            response = httpx.post(
                f"{self._api_url}?key={self._api_key}",
                json=payload,
                timeout=60.0
            )
            response.raise_for_status()
            
            data = response.json()
            logger.debug("Gemini API 응답 구조 (편집): %s", json.dumps(data, indent=2, ensure_ascii=False)[:500])
            return self._extract_image_bytes_from_response(data)
        except httpx.HTTPStatusError as exc:
            error_text = exc.response.text[:500] if exc.response.text else "응답 없음"
            logger.error("Gemini API HTTP 오류 (편집): %s - %s", exc.response.status_code, error_text)
            raise RuntimeError(f"이미지 편집 API 호출 실패 (HTTP {exc.response.status_code}): {error_text}") from exc
        except Exception as exc:
            logger.error("Gemini 이미지 편집 실패: %s", exc, exc_info=True)
            raise

    @staticmethod
    def _extract_image_bytes_from_response(response_data: dict) -> Tuple[bytes, str]:
        """REST API JSON 응답에서 이미지 바이트 추출"""
        try:
            # 응답 구조 로깅 (디버깅용)
            logger.debug("응답 데이터 키: %s", list(response_data.keys()))
            
            # 에러 체크
            if "error" in response_data:
                error_msg = response_data["error"].get("message", "알 수 없는 오류")
                raise RuntimeError(f"Gemini API 오류: {error_msg}")
            
            candidates = response_data.get("candidates", [])
            if not candidates:
                # 응답 전체를 로깅하여 구조 파악
                logger.error("응답에 candidates가 없습니다. 전체 응답: %s", 
                           json.dumps(response_data, indent=2, ensure_ascii=False)[:1000])
                raise RuntimeError("응답에 candidates가 없습니다. API 응답 구조를 확인해주세요.")

            for idx, candidate in enumerate(candidates):
                logger.debug("Candidate %d 키: %s", idx, list(candidate.keys()) if isinstance(candidate, dict) else "N/A")
                
                content = candidate.get("content", {})
                if not content:
                    logger.debug("Candidate %d에 content가 없습니다", idx)
                    continue
                    
                parts = content.get("parts", [])
                if not parts:
                    logger.debug("Candidate %d의 content에 parts가 없습니다", idx)
                    continue

                for part_idx, part in enumerate(parts):
                    logger.debug("Part %d 키: %s", part_idx, list(part.keys()) if isinstance(part, dict) else "N/A")
                    
                    # inline_data 또는 inlineData (camelCase) 모두 확인
                    inline_data = part.get("inline_data") or part.get("inlineData")
                    if not inline_data:
                        # 텍스트 응답인 경우 로깅
                        if part.get("text"):
                            logger.debug("Part %d는 텍스트 응답입니다: %s", part_idx, part.get("text")[:100])
                        continue
                    
                    # data 필드 확인
                    data_b64 = inline_data.get("data")
                    mime_type = inline_data.get("mime_type") or inline_data.get("mimeType") or "image/png"

                    if not data_b64:
                        logger.debug("Part %d의 inline_data에 data가 없습니다", part_idx)
                        continue

                    try:
                        image_bytes = base64.b64decode(data_b64)
                        logger.info("이미지 데이터 추출 성공: %d bytes, mime_type: %s", len(image_bytes), mime_type)
                        return image_bytes, mime_type
                    except Exception as exc:
                        logger.warning("이미지 데이터 디코딩 실패: %s", exc)
                        continue

            # 모든 후보를 확인했지만 이미지를 찾지 못함
            logger.error("모든 candidates를 확인했지만 이미지 데이터를 찾을 수 없습니다. 응답 구조: %s",
                        json.dumps(response_data, indent=2, ensure_ascii=False)[:2000])
            raise RuntimeError("응답에서 이미지 데이터를 찾을 수 없습니다. API 응답을 확인해주세요.")
        except RuntimeError:
            raise
        except Exception as exc:
            logger.error("응답 파싱 중 예상치 못한 오류: %s", exc, exc_info=True)
            logger.error("응답 데이터: %s", json.dumps(response_data, indent=2, ensure_ascii=False)[:2000])
            raise RuntimeError(f"응답 파싱 실패: {exc}") from exc


_gemini_image_service: GeminiImageService | None = None


def get_gemini_image_service() -> GeminiImageService:
    global _gemini_image_service
    if _gemini_image_service is None:
        _gemini_image_service = GeminiImageService()
    return _gemini_image_service


def guess_extension(mime_type: str | None) -> str:
    if not mime_type:
        return ".png"
    guessed = mimetypes.guess_extension(mime_type)
    if not guessed:
        return ".png"
    return guessed

