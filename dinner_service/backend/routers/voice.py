"""
음성 주문 API 라우터
STT + Gemini AI 기반 메뉴 추천 및 주문 처리
"""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..services.gemini_service import get_gemini_service
from ..services.database import get_db
from ..services.openai_audio_service import get_audio_service, OpenAIAudioService

router = APIRouter(tags=["voice"])

class VoiceInputRequest(BaseModel):
    """음성 입력 요청 모델"""
    transcript: str = Field(..., description="음성 인식된 텍스트")
    user_id: str | None = Field(None, description="로그인한 사용자 ID (UUID 문자열)")
    session_id: str | None = Field(None, description="대화 세션 ID")

class VoiceAnalysisResponse(BaseModel):
    """음성 분석 응답 모델 (고도화 버전)"""
    intent: str = Field(..., description="의도 (recommendation, order, question, greeting, other)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="신뢰도")
    response: str = Field(..., description="AI 응답 메시지")
    analysis: dict[str, Any] = Field(default_factory=dict, description="상황 분석 정보")
    recommended_menu: dict[str, Any] | None = Field(None, description="추천 메뉴 정보")
    alternatives: list[dict[str, Any]] = Field(default_factory=list, description="대안 메뉴들")
    additional_questions: list[str] = Field(default_factory=list, description="추가 질문")
    order_state: dict[str, Any] | None = Field(None, description="현재 주문 상태 (단계별 진행 상황)")
    state: str = Field("PROMOTION_GREETING", description="현재 챗봇 주문 상태")
    state_decision: int = Field(0, description="메뉴 대화 단계에서 다음 상태로 진행할 수 있는지 여부 (1=진행 가능)")
    menu_selection: int = Field(0, description="선택된 메뉴 코드 (1=french, 2=english, 3=valentine, 4=champagne)")
    style_selection: int = Field(0, description="선택된 스타일 코드 (1=simple, 2=grand, 3=deluxe)")
    quantity: int | None = Field(1, description="선택된 수량")
    customization_overrides: dict[str, Any] = Field(default_factory=dict, description="재료 커스터마이징 기록")

class TextToSpeechRequest(BaseModel):
    """텍스트를 음성으로 변환하는 요청"""
    text: str = Field(..., min_length=1, max_length=1200, description="변환할 텍스트")
    voice: str | None = Field(None, description="사용할 음성 (기본값 alloy)")
    format: str | None = Field(None, description="오디오 포맷 (mp3, wav, aac, opus)")

class ChatMessage(BaseModel):
    """채팅 메시지 모델"""
    role: str = Field(..., description="메시지 역할 (user, assistant)")
    content: str = Field(..., description="메시지 내용")
    timestamp: str | None = Field(None, description="타임스탬프")
    menu_info: dict[str, Any] | None = Field(None, description="메뉴 정보")

@router.post("/analyze", response_model=VoiceAnalysisResponse)
async def analyze_voice_input(
    request: VoiceInputRequest,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """
    음성 입력 분석 및 메뉴 추천 (고도화 버전)

    - STT로 변환된 텍스트를 받아서
    - Gemini AI가 의도 분석 및 메뉴 추천
    - 과거 주문 이력 및 대화 컨텍스트 활용
    - 대화형 응답 생성
    """
    try:
        # Gemini 서비스 인스턴스
        gemini_service = get_gemini_service()

        # 음성 입력 분석 (과거 이력 + 대화 컨텍스트 포함)
        result = await gemini_service.analyze_voice_input(
            transcript=request.transcript,
            user_id=request.user_id,
            session_id=request.session_id,
            db=db
        )

        return result

    except ValueError as e:
        # 값 오류 (API 키 누락, 응답 파싱 실패 등)
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Gemini 서비스 값 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"요청 처리 오류: {str(e)}"
        )
    except Exception as e:
        # 기타 예외
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"음성 분석 중 예상치 못한 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"음성 분석 중 오류 발생: {str(e)}"
        )


@router.post("/stt")
async def speech_to_text(
    audio_service: Annotated[OpenAIAudioService, Depends(get_audio_service)],
    audio_file: UploadFile = File(...),
    language: str = Form("ko"),
) -> dict[str, Any]:
    """
    업로드된 오디오 파일을 OpenAI STT 모델로 변환
    """
    try:
        file_bytes = await audio_file.read()
        transcript = audio_service.transcribe_audio(
            audio_bytes=file_bytes,
            filename=audio_file.filename or "recording.webm",
            mime_type=audio_file.content_type,
            language=language,
        )
        return {"success": True, "transcript": transcript}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover - 외부 API 오류
        raise HTTPException(status_code=500, detail=f"STT 처리 중 오류: {exc}") from exc


@router.post("/tts")
async def text_to_speech(
    audio_service: Annotated[OpenAIAudioService, Depends(get_audio_service)],
    request: TextToSpeechRequest,
) -> Response:
    """
    텍스트를 음성으로 변환하여 바이너리 오디오로 반환
    """
    try:
        audio_bytes, mime_type = audio_service.synthesize_speech(
            request.text,
            voice=request.voice,
            audio_format=request.format,  # type: ignore[arg-type]
        )
        return Response(
            content=audio_bytes,
            media_type=mime_type,
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": 'inline; filename="assistant-voice"'
            }
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"TTS 처리 중 오류: {exc}") from exc


@router.post("/chat/init")
async def init_chat_session(
    user_id: str | None = None
) -> dict[str, Any]:
    """
    채팅 세션 초기화

    새로운 대화 세션을 시작하고 환영 메시지 반환 (user_id: UUID 문자열)
    """
    session_id = str(uuid.uuid4())
    
    welcome_message = """안녕하세요! 미스터 대박 디너 서비스 AI 상담사입니다. 🍽️
    
어떤 디너를 찾으시나요?
• 로맨틱한 발렌타인 디너
• 고급스러운 프랑스 디너
• 클래식한 잉글리시 디너
• 화려한 샴페인 축제 디너

음성으로 편하게 말씀해 주세요!"""
    
    return {
        "success": True,
        "session_id": session_id,
        "message": welcome_message,
        "timestamp": datetime.now().isoformat()
    }


