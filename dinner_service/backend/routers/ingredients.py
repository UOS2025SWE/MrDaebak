"""
재료 관리 API 라우터
Ingredient management API router for handling ingredient inventory and operations
"""

from typing import Annotated, Any
from decimal import Decimal
import json

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..services.database import get_db
from ..services.ingredient_service import ingredient_service
from ..services.login_service import get_current_user

router = APIRouter(tags=["ingredients"])


class IngredientIntakeItem(BaseModel):
    ingredient_code: str = Field(..., description="재료 코드 (ingredients.name)")
    expected_quantity: Decimal = Field(..., gt=0, description="매니저가 기록한 입고 예정 수량")
    unit_price: Decimal = Field(..., ge=0, description="입고 단가")
    remarks: str | None = Field(None, max_length=200, description="입고 항목 비고")


class IngredientIntakeRequest(BaseModel):
    intake_items: list[IngredientIntakeItem] = Field(..., min_length=1, description="입고 항목 목록")
    intake_note: str | None = Field(None, max_length=500, description="입고 비고")


class BulkRestockRequest(BaseModel):
    quantity: int | None = Field(None, ge=1, le=10000, description="재입고 수량 (미지정 시 기본값 사용)")


class IngredientRestockItem(BaseModel):
    ingredient_code: str = Field(..., min_length=1, description="재료 코드 (ingredients.name)")
    quantity: int = Field(..., ge=1, le=10000, description="재입고 수량")


class IngredientRestockRequest(BaseModel):
    items: list[IngredientRestockItem] = Field(..., min_length=1, max_length=100, description="재입고 재료 목록")


class IntakeConfirmationItem(BaseModel):
    intake_item_id: str = Field(..., description="입고 항목 ID")
    actual_quantity: Decimal | None = Field(None, ge=0, description="실제 입고 수량")
    unit_price: Decimal | None = Field(None, ge=0, description="조정된 입고 단가")
    remarks: str | None = Field(None, max_length=200, description="요리사 비고")


class IntakeConfirmationRequest(BaseModel):
    items: list[IntakeConfirmationItem] = Field(default_factory=list, description="검수 항목 목록")
    cook_note: str | None = Field(None, max_length=500, description="요리사 공통 비고")


class IngredientCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120, description="재료 이름")
    unit: str = Field('piece', max_length=32, description="재료 단위")
    unit_price: Decimal = Field(..., ge=0, description="재료 단가")
    initial_stock: Decimal | None = Field(None, ge=0, description="초기 재고 (옵션)")


class IngredientPricingUpdateRequest(BaseModel):
    unit_price: Decimal = Field(..., ge=0, description="재료 단가 (원)")

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
    current_user: dict = Depends(get_current_user),
    request: Annotated[BulkRestockRequest | None, Body()] = None
) -> dict[str, Any]:
    """특정 카테고리의 모든 재료 일괄 재입고 (관리자 권한 필요)"""
    try:
        # 관리자 권한 확인
        if not current_user.get('is_admin', False):
            raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")
        
        restock_amount = request.quantity if request else None
        result = ingredient_service.bulk_restock_by_category(category_key, restock_amount)
        return result
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": f"카테고리별 일괄 재입고 실패: {str(e)}"
        }


@router.post("/restock")
async def restock_selected_ingredients(
    request: IngredientRestockRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """선택한 재료들을 지정된 수량만큼 재입고 (매니저 전용)"""
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 재입고를 요청할 수 있습니다")

    result = ingredient_service.restock_selected_items(
        db=db,
        items=[item.model_dump() for item in request.items]
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "선택 재료 재입고에 실패했습니다"))

    return result


@router.delete("/manage/{ingredient_code}")
async def delete_ingredient(
    ingredient_code: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """재료 삭제 (매니저 전용)"""
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 재료를 삭제할 수 있습니다")

    result = ingredient_service.delete_ingredient(db, ingredient_code)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "재료 삭제에 실패했습니다"))
    return result


@router.post("/create")
async def create_new_ingredient(
    request: IngredientCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """새로운 재료 등록 (매니저 전용)"""
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 재료를 등록할 수 있습니다")

    result = ingredient_service.create_ingredient(
        db=db,
        name=request.name,
        unit=request.unit,
        unit_price=request.unit_price,
        initial_stock=request.initial_stock
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "재료 등록에 실패했습니다"))

    return result


@router.post("/intake")
async def record_ingredient_intake(
    request: IngredientIntakeRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """재료 입고 배치를 생성 (요리사/매니저)"""

    user_type = current_user.get("user_type")
    position = current_user.get("position")
    if user_type not in ("MANAGER", "STAFF"):
        raise HTTPException(status_code=403, detail="권한이 없습니다")
    if user_type == "STAFF" and position != "COOK":
        raise HTTPException(status_code=403, detail="요리사만 입고를 기록할 수 있습니다")

    result = ingredient_service.create_intake_batch(
        db=db,
        manager_id=current_user.get("id"),
        intake_items=[item.model_dump() for item in request.intake_items],
        note=request.intake_note
    )

    if not result.get("success"):
        status_code = 400 if result.get("missing") else 500
        raise HTTPException(status_code=status_code, detail=result.get("error", "입고 배치 생성 실패"))

    # 요리사가 직접 기록한 경우 즉시 확정 처리
    if user_type == "STAFF":
        confirm_result = ingredient_service.confirm_intake_batch(
            db=db,
            batch_id=result["batch_id"],
            cook_id=current_user.get("id"),
            adjustments=[],
            cook_note=request.intake_note
        )
        if not confirm_result.get("success"):
            raise HTTPException(status_code=500, detail=confirm_result.get("error", "입고 배치 확정 실패"))
        result["status"] = confirm_result.get("status", "COMPLETED")

    return result


@router.get("/intake/pending")
async def get_pending_intakes(
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """대기 중인 입고 배치 조회 (요리사/매니저)"""

    user_type = current_user.get("user_type")
    position = current_user.get("position")
    is_manager = user_type == "MANAGER"
    is_cook = user_type == "STAFF" and position == "COOK"

    if not (is_manager or is_cook):
        raise HTTPException(status_code=403, detail="매니저 또는 요리사만 조회할 수 있습니다")

    query = text(
        """
        SELECT
            b.batch_id::text,
            b.manager_id::text,
            mu.name AS manager_name,
            b.note,
            b.created_at,
            COALESCE(
                json_agg(
                    json_build_object(
                        'intake_item_id', i.intake_item_id::text,
                        'ingredient_code', ing.name,
                        'expected_quantity', i.expected_quantity,
                        'actual_quantity', i.actual_quantity,
                        'unit_price', i.unit_price,
                        'expected_total_cost', i.expected_total_cost,
                        'actual_total_cost', i.actual_total_cost,
                        'remarks', i.remarks
                    )
                    ORDER BY ing.name
                ) FILTER (WHERE i.intake_item_id IS NOT NULL),
                '[]'::json
            ) AS intake_items,
            b.total_expected_cost,
            b.total_actual_cost
        FROM ingredient_intake_batches b
        JOIN users mu ON b.manager_id = mu.user_id
        LEFT JOIN ingredient_intake_items i ON i.batch_id = b.batch_id
        LEFT JOIN ingredients ing ON ing.ingredient_id = i.ingredient_id
        WHERE b.status = 'AWAITING_COOK'
        GROUP BY b.batch_id, mu.name, b.note, b.created_at, b.total_expected_cost, b.total_actual_cost
        ORDER BY b.created_at DESC
        """
    )

    results = db.execute(query).fetchall()
    batches: list[dict[str, Any]] = []

    for row in results:
        intake_items = row[5]
        if isinstance(intake_items, str):
            intake_items = json.loads(intake_items)

        batches.append({
            "batch_id": row[0],
            "manager_id": row[1],
            "manager_name": row[2],
            "note": row[3],
            "created_at": row[4].isoformat() if row[4] else None,
            "intake_items": intake_items or [],
            "total_expected_cost": float(row[6]) if row[6] is not None else 0.0,
            "total_actual_cost": float(row[7]) if row[7] is not None else 0.0
        })

    return {
        "success": True,
        "batches": batches,
        "count": len(batches)
    }


@router.get("/intake/history")
async def get_intake_history(
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user),
    limit: int = 25
) -> dict[str, Any]:
    """최근 재료 입고 배치 이력 조회 (매니저 전용)"""
    user_type = current_user.get("user_type")
    if user_type != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 조회할 수 있습니다")

    history_query = text(
        """
        SELECT
            b.batch_id::text,
            b.status,
            b.note,
            b.created_at,
            b.reviewed_at,
            b.total_expected_cost,
            b.total_actual_cost,
            manager.name AS manager_name,
            manager.email AS manager_email,
            cook.name AS cook_name,
            COALESCE(
                json_agg(
                    json_build_object(
                        'intake_item_id', i.intake_item_id::text,
                        'ingredient_code', ing.name,
                        'expected_quantity', i.expected_quantity,
                        'actual_quantity', i.actual_quantity,
                        'unit_price', i.unit_price,
                        'expected_total_cost', i.expected_total_cost,
                        'actual_total_cost', i.actual_total_cost,
                        'remarks', i.remarks
                    )
                    ORDER BY ing.name
                ) FILTER (WHERE i.intake_item_id IS NOT NULL),
                '[]'::json
            ) AS intake_items
        FROM ingredient_intake_batches b
        JOIN users manager ON b.manager_id = manager.user_id
        LEFT JOIN users cook ON b.cook_id = cook.user_id
        LEFT JOIN ingredient_intake_items i ON i.batch_id = b.batch_id
        LEFT JOIN ingredients ing ON ing.ingredient_id = i.ingredient_id
        GROUP BY
            b.batch_id,
            b.status,
            b.note,
            b.created_at,
            b.reviewed_at,
            b.total_expected_cost,
            b.total_actual_cost,
            manager.name,
            manager.email,
            cook.name
        ORDER BY b.created_at DESC
        LIMIT :limit
        """
    )

    results = db.execute(history_query, {"limit": max(1, min(limit, 100))}).fetchall()

    history: list[dict[str, Any]] = []
    for row in results:
        intake_items = row[10]
        if isinstance(intake_items, str):
            intake_items = json.loads(intake_items)

        history.append({
            "batch_id": row[0],
            "status": row[1],
            "note": row[2],
            "created_at": row[3].isoformat() if row[3] else None,
            "reviewed_at": row[4].isoformat() if row[4] else None,
            "total_expected_cost": float(row[5]) if row[5] is not None else 0.0,
            "total_actual_cost": float(row[6]) if row[6] is not None else 0.0,
            "manager_name": row[7],
            "manager_email": row[8],
            "cook_name": row[9],
            "intake_items": intake_items or []
        })

    return {
        "success": True,
        "history": history,
        "count": len(history)
    }


@router.post("/intake/{batch_id}/confirm")
async def confirm_intake_batch(
    batch_id: str,
    request: IntakeConfirmationRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """입고 배치 확정 (요리사 또는 매니저)"""

    user_type = current_user.get("user_type")
    position = current_user.get("position")
    is_manager = user_type == "MANAGER"
    is_cook = user_type == "STAFF" and position == "COOK"

    if not (is_manager or is_cook):
        raise HTTPException(status_code=403, detail="매니저 또는 요리사만 입고 배치를 확정할 수 있습니다")

    result = ingredient_service.confirm_intake_batch(
        db=db,
        batch_id=batch_id,
        cook_id=current_user.get("id"),
        adjustments=[item.model_dump() for item in request.items],
        cook_note=request.cook_note
    )

    if not result.get("success"):
        detail = result.get("error", "입고 배치 확정에 실패했습니다")
        status_code = 409 if "이미 처리된" in detail else 400
        raise HTTPException(status_code=status_code, detail=detail)

    return result


@router.get("/pricing")
async def get_ingredient_pricing() -> dict[str, Any]:
    """재료 단가 목록 조회"""
    return ingredient_service.get_ingredient_pricing()


@router.put("/pricing/{ingredient_code}")
async def update_ingredient_pricing(
    ingredient_code: str,
    request: IngredientPricingUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """재료 단가 업데이트 (매니저 전용)"""
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 단가를 수정할 수 있습니다")

    result = ingredient_service.update_ingredient_price(db, ingredient_code, request.unit_price)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "재료 단가 수정에 실패했습니다"))
    return result