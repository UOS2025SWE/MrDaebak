"""
메뉴 API 라우터
순수 메뉴 조회 및 메뉴 데이터 관리
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.menu_service import MenuService

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