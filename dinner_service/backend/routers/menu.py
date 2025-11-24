"""
메뉴 API 라우터
순수 메뉴 조회 및 메뉴 데이터 관리
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.menu_service import MenuService
from ..services.login_service import get_current_user

router = APIRouter(tags=["menu"])


@router.get("/")
async def get_menu_list(
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """전체 메뉴 목록 조회"""
    result = MenuService.get_menu_data(db)
    if result["success"]:
        return {
            "success": True,
            "data": result["data"],
            "total": len(result["data"]),
            "fallback": result.get("fallback", False)
        }
    else:
        return {
            "success": False,
            "error": result.get("error", "메뉴 조회 실패"),
            "data": []
        }


@router.get("/metadata")
async def get_menu_metadata(
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """메뉴, 재료, 스타일 메타데이터 조회 (프론트엔드 초기화용)"""
    ingredients = MenuService.get_all_ingredients(db)
    styles = MenuService.get_serving_styles(db)
    
    return {
        "success": True,
        "data": {
            "ingredients": ingredients,
            "styles": styles
        }
    }


@router.get("/{menu_code}")
async def get_menu_detail(
    menu_code: str,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """특정 메뉴 상세 정보 조회 (코드 기반)"""
    result = MenuService.get_menu_data(db)
    if not result["success"]:
        return {
            "success": False,
            "error": result.get("error", "메뉴 조회 실패"),
            "data": None
        }
    
    menu = next((item for item in result["data"] if item["code"] == menu_code), None)
    if not menu:
        return {
            "success": False,
            "error": "메뉴를 찾을 수 없습니다.",
            "data": None
        }
    
    return {
        "success": True,
        "data": menu
    }


@router.get("/base-ingredients")
async def get_base_ingredients(
    db: Annotated[Session, Depends(get_db)],
    menu_code: str | None = Query(default=None)
) -> dict[str, Any]:
    """메뉴별 기본 재료 구성 조회"""
    data = MenuService.get_base_ingredient_data(db, menu_code)
    return {
        "success": True,
        "data": data
    }


class BaseIngredientUpsertRequest(BaseModel):
    ingredient_code: str = Field(..., min_length=1, description="재료 코드 (ingredients.name)")
    base_quantity: int = Field(..., ge=0, description="기본 수량")


@router.put("/base-ingredients/{menu_code}/{style}")
async def upsert_base_ingredient(
    menu_code: str,
    style: str,
    request: BaseIngredientUpsertRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 기본 재료를 수정할 수 있습니다")

    result = MenuService.upsert_base_ingredient(
        db,
        menu_code=menu_code,
        style=style,
        ingredient_code=request.ingredient_code,
        base_quantity=request.base_quantity
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "기본 재료 수정에 실패했습니다"))
    return result


@router.delete("/base-ingredients/{menu_code}/{style}/{ingredient_code}")
async def delete_base_ingredient(
    menu_code: str,
    style: str,
    ingredient_code: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 기본 재료를 삭제할 수 있습니다")

    result = MenuService.remove_base_ingredient(
        db,
        menu_code=menu_code,
        style=style,
        ingredient_code=ingredient_code
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "기본 재료 삭제에 실패했습니다"))
    return result
