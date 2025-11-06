"""
음성 주문 API 라우터
STT + Gemini AI 기반 메뉴 추천 및 주문 처리
"""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..services.gemini_service import get_gemini_service
from ..services.database import get_db

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

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"음성 분석 중 오류 발생: {str(e)}"
        )



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


