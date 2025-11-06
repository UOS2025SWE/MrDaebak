"""
직원 관리 API 라우터
Staff management API router for handling staff status and operations
"""

from typing import Annotated, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.staff_service import staff_service
from ..services.login_service import get_current_user

router = APIRouter(tags=["staff"])

@router.get("/")
async def get_all_staff(
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """전체 직원 목록 조회 (주문 상태와 연동)"""
    try:
        # 주문과 연동된 실시간 상태 반환
        result = staff_service.get_staff_with_order_status(db)
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"직원 목록 조회 실패: {str(e)}",
            "data": []
        }


@router.post("/{staff_id}/toggle")
async def toggle_staff_status(
    staff_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """직원 상태 토글 (관리자 권한 필요, UUID 기반)"""
    try:
        # 관리자 권한 확인
        if not current_user.get('is_admin', False):
            raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")

        result = staff_service.toggle_staff_status(staff_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": f"직원 상태 토글 실패: {str(e)}"
        }