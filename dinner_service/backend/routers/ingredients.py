"""
재료 관리 API 라우터
Ingredient management API router for handling ingredient inventory and operations
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.ingredient_service import ingredient_service
from ..services.login_service import get_current_user

router = APIRouter(tags=["ingredients"])


class IngredientIntakeItem(BaseModel):
    ingredient_code: str = Field(..., description="재료 코드 (ingredients.name)")
    quantity: int = Field(..., gt=0, description="입고 수량")


class IngredientIntakeRequest(BaseModel):
    intake_items: list[IngredientIntakeItem] = Field(..., min_length=1, description="입고 항목 목록")
    intake_note: str | None = Field(None, max_length=200, description="비고")

@router.get("/")
async def get_all_ingredients(
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """전체 재료 목록 조회"""
    try:
        result = ingredient_service.get_all_ingredients()
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"재료 목록 조회 실패: {str(e)}",
            "data": []
        }


@router.post("/bulk-restock-category/{category_key}")
async def bulk_restock_by_category(
    category_key: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """특정 카테고리의 모든 재료 일괄 재입고 (관리자 권한 필요)"""
    try:
        # 관리자 권한 확인
        if not current_user.get('is_admin', False):
            raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")
        
        result = ingredient_service.bulk_restock_by_category(category_key)
        return result
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": f"카테고리별 일괄 재입고 실패: {str(e)}"
        }


@router.post("/intake")
async def record_ingredient_intake(
    request: IngredientIntakeRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """재료 입고 기록 (직원/관리자 권한)"""

    user_type = current_user.get("user_type")
    if not user_type:
        user_type = "MANAGER" if current_user.get("is_admin") else None

    if user_type not in {"STAFF", "MANAGER"}:
        raise HTTPException(status_code=403, detail="직원 또는 관리자만 재료 입고를 기록할 수 있습니다")

    result = ingredient_service.record_intake(
        db=db,
        intake_items=[item.model_dump() for item in request.intake_items],
        staff_id=current_user.get("id"),
        note=request.intake_note
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "재료 입고 처리 실패"))

    return result


@router.get("/pricing")
async def get_ingredient_pricing() -> dict[str, Any]:
    """재료 단가 목록 조회"""
    return ingredient_service.get_ingredient_pricing()