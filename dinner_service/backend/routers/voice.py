"""
음성 주문 API 라우터
STT + AI Server 기반 메뉴 추천 및 주문 처리
"""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..services.voice_analysis_service import get_voice_analysis_service, VoiceAnalysisService
from ..services.database import get_db
from ..services.stt_service import get_stt_service, STTService

router = APIRouter(tags=["voice"])

class VoiceInputRequest(BaseModel):
    """음성 입력 요청 모델"""
    transcript: str = Field(..., description="음성 인식된 텍스트")
    user_id: str | None = Field(None, description="로그인한 사용자 ID (UUID 문자열)")
    session_id: str | None = Field(None, description="대화 세션 ID")

class VoiceAnalysisResponse(BaseModel):
    """음성 분석 응답 모델"""
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

@router.post("/analyze", response_model=VoiceAnalysisResponse)
async def analyze_voice_input(
    request: VoiceInputRequest,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """
    음성 입력 분석 및 메뉴 추천 (고도화 버전)
    """
    try:
        # Voice Service 인스턴스
        voice_service = get_voice_analysis_service()

        # 음성 입력 분석
        result = await voice_service.analyze_voice_input(
            transcript=request.transcript,
            user_id=request.user_id,
            session_id=request.session_id,
            db=db
        )

        return result

    except ValueError as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Voice 서비스 값 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"요청 처리 오류: {str(e)}"
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"음성 분석 중 예상치 못한 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"음성 분석 중 오류 발생: {str(e)}"
        )


@router.post("/stt")
async def speech_to_text(
    stt_service: Annotated[STTService, Depends(get_stt_service)],
    audio_file: UploadFile = File(...),
    language: str = Form("ko"),
) -> dict[str, Any]:
    """
    업로드된 오디오 파일을 AI Server STT 모델로 변환
    """
    try:
        file_bytes = await audio_file.read()
        transcript = await stt_service.transcribe_audio(
            audio_bytes=file_bytes,
            filename=audio_file.filename or "recording.webm",
            mime_type=audio_file.content_type,
            language=language,
        )
        return {"success": True, "transcript": transcript}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"STT 처리 중 오류: {exc}") from exc


@router.post("/chat/init")
async def init_chat_session(
    user_id: str | None = None
) -> dict[str, Any]:
    """
    채팅 세션 초기화
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
