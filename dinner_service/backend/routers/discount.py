"""
할인 API 라우터
고객 할인 정보 조회 및 할인 계산
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.discount_service import DiscountService

router = APIRouter(tags=["discount"])


@router.get("/{user_id}")
async def get_user_discount_info(
    user_id: str,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """사용자 할인 정보 조회 (UUID 기반)"""
    try:
        discount_info = DiscountService.get_customer_discount_info(user_id, db)
        return {
            "success": True,
            "data": discount_info
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"할인 정보 조회 실패: {str(e)}"
        }