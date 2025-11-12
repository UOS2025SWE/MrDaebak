"""Side dish API router"""

from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.login_service import get_current_user, get_optional_user
from ..services.side_dish_service import side_dish_service

router = APIRouter(tags=["side-dishes"])


class SideDishIngredientInput(BaseModel):
    ingredient_code: str = Field(..., min_length=1, description="재료 코드 (ingredients.name)")
    quantity: Decimal = Field(..., gt=0, description="필요 수량")


class SideDishCreateRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=60, description="사이드 디시 코드")
    name: str = Field(..., min_length=1, max_length=120, description="사이드 디시 이름")
    description: str | None = Field(None, max_length=500, description="설명")
    base_price: Decimal = Field(..., ge=0, description="기본 가격")
    ingredients: list[SideDishIngredientInput] = Field(..., min_length=1, description="필요 재료 목록")


class SideDishAvailabilityPatch(BaseModel):
    is_available: bool = Field(..., description="활성 여부")


class SideDishIngredientUpsertRequest(BaseModel):
    ingredient_code: str = Field(..., min_length=1, description="재료 코드 (ingredients.name)")
    quantity: Decimal = Field(..., gt=0, description="필요 수량")


class CustomCakeRecipeUpsertRequest(BaseModel):
    flavor: str = Field(..., min_length=1, description="커스텀 케이크 맛 코드")
    size: str = Field(..., min_length=1, description="커스텀 케이크 사이즈 코드")
    ingredient_code: str = Field(..., min_length=1, description="재료 코드 (ingredients.name)")
    quantity: Decimal = Field(..., gt=0, description="필요 수량")


@router.get("/")
async def list_side_dishes(
    db: Annotated[Session, Depends(get_db)],
    current_user: dict | None = Depends(get_optional_user),
    include_inactive: bool = False
) -> dict[str, Any]:
    """사이드 디시 목록 조회"""
    include_all = include_inactive if (current_user and current_user.get("user_type") == "MANAGER") else False
    result = side_dish_service.list_side_dishes(db, include_inactive=include_all)
    return result


@router.get("")
async def list_side_dishes_no_slash(
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user),
    include_inactive: bool = False
) -> dict[str, Any]:
    return await list_side_dishes(db=db, current_user=current_user, include_inactive=include_inactive)


@router.options("/")
async def options_side_dishes_root() -> Response:
    return Response(status_code=204)


@router.options("")
async def options_side_dishes_root_no_slash() -> Response:
    return Response(status_code=204)


@router.post("/")
async def create_side_dish(
    request: SideDishCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """사이드 디시 생성 (매니저 전용)"""
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 사이드 디시를 생성할 수 있습니다")

    result = side_dish_service.create_side_dish(
        db=db,
        manager_id=current_user.get("id"),
        code=request.code,
        name=request.name,
        description=request.description,
        base_price=request.base_price,
        ingredients=[item.model_dump() for item in request.ingredients]
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "사이드 디시 생성 실패"))

    return result


@router.post("")
async def create_side_dish_no_slash(
    request: SideDishCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return await create_side_dish(request=request, db=db, current_user=current_user)


@router.put("/{side_dish_id}/ingredients")
async def upsert_side_dish_ingredient(
    side_dish_id: str,
    request: SideDishIngredientUpsertRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """사이드 디시 재료 추가/수정 (매니저 전용)"""
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 재료를 수정할 수 있습니다")

    result = side_dish_service.upsert_side_dish_ingredient(
        db=db,
        side_dish_id=side_dish_id,
        ingredient_code=request.ingredient_code,
        quantity=request.quantity
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "사이드 디시 재료 수정에 실패했습니다"))
    return result


@router.delete("/{side_dish_id}/ingredients/{ingredient_code}")
async def delete_side_dish_ingredient(
    side_dish_id: str,
    ingredient_code: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """사이드 디시 재료 삭제 (매니저 전용)"""
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 재료를 삭제할 수 있습니다")

    result = side_dish_service.remove_side_dish_ingredient(db, side_dish_id, ingredient_code)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "사이드 디시 재료 삭제에 실패했습니다"))
    return result


@router.patch("/{side_dish_id}/availability")
async def update_side_dish_availability(
    side_dish_id: str,
    request: SideDishAvailabilityPatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """사이드 디시 활성/비활성 토글 (매니저 전용)"""
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 상태를 변경할 수 있습니다")

    result = side_dish_service.set_availability(db, side_dish_id, request.is_available)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "상태 변경 실패"))

    return result


@router.delete("/{side_dish_id}")
async def delete_side_dish(
    side_dish_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 사이드 디시를 삭제할 수 있습니다")

    result = side_dish_service.delete_side_dish(db, side_dish_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "사이드 디시 삭제에 실패했습니다"))
    return result


@router.get("/custom-cake/recipes")
async def list_custom_cake_recipes(
    db: Annotated[Session, Depends(get_db)],
    current_user: dict | None = Depends(get_optional_user)
) -> dict[str, Any]:
    """커스텀 케이크 맛/사이즈별 레시피 조회"""
    return side_dish_service.get_custom_cake_recipes(db)


@router.put("/custom-cake/recipes")
async def upsert_custom_cake_recipe(
    request: CustomCakeRecipeUpsertRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 커스텀 케이크 레시피를 수정할 수 있습니다")

    result = side_dish_service.upsert_custom_cake_recipe(
        db,
        flavor=request.flavor,
        size=request.size,
        ingredient_code=request.ingredient_code,
        quantity=request.quantity,
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "레시피 저장에 실패했습니다"))
    return result


@router.delete("/custom-cake/recipes/{flavor}/{size}/{ingredient_code}")
async def delete_custom_cake_recipe(
    flavor: str,
    size: str,
    ingredient_code: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 커스텀 케이크 레시피를 삭제할 수 있습니다")

    result = side_dish_service.remove_custom_cake_recipe(db, flavor, size, ingredient_code)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "레시피 삭제에 실패했습니다"))
    return result
