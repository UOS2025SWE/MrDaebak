"""
재료 관리 API 라우터
Ingredient management API router for handling ingredient inventory and operations
"""

from typing import Annotated, Any
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text

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
    """재료 입고 기록 (COOK 또는 매니저만 가능)"""

    user_type = current_user.get("user_type")
    position = current_user.get("position")
    
    if not user_type:
        user_type = "MANAGER" if current_user.get("is_admin") else None

    # COOK 또는 매니저만 접근 가능
    if user_type == "MANAGER":
        pass  # 매니저는 접근 가능
    elif user_type == "STAFF" and position == "COOK":
        pass  # COOK은 접근 가능
    else:
        raise HTTPException(status_code=403, detail="요리사 또는 매니저만 재료 입고를 기록할 수 있습니다")

    # 매니저는 즉시 반영, COOK은 승인 필요
    if user_type == "MANAGER":
        # 매니저는 즉시 반영
        result = ingredient_service.record_intake(
            db=db,
            intake_items=[item.model_dump() for item in request.intake_items],
            staff_id=current_user.get("id"),
            note=request.intake_note
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "재료 입고 처리 실패"))
        
        return result
    else:
        # COOK은 승인 요청으로 저장 (PENDING 상태)
        from sqlalchemy import text
        import json
        
        # JSON 문자열을 jsonb로 변환하여 저장
        intake_items_json = json.dumps([item.model_dump() for item in request.intake_items])
        
        # SQLAlchemy bindparam을 사용하여 jsonb 타입 명시
        from sqlalchemy import bindparam
        from sqlalchemy.dialects.postgresql import JSONB
        
        intake_query = text("""
            INSERT INTO ingredient_intake_requests (staff_id, intake_items, note, status)
            VALUES (
                CAST(:staff_id AS uuid),
                :intake_items,
                :note,
                'PENDING'
            )
            RETURNING intake_id, created_at
        """).bindparams(
            bindparam('intake_items', type_=JSONB)
        )
        
        result = db.execute(intake_query, {
            "staff_id": current_user.get("id"),
            "intake_items": intake_items_json,
            "note": request.intake_note if request.intake_note else None
        }).fetchone()
        
        db.commit()
        
        return {
            "success": True,
            "message": "입고 기록이 제출되었습니다. 매니저 승인을 기다려주세요.",
            "intake_id": str(result[0]),
            "status": "PENDING",
            "created_at": result[1].isoformat()
        }


@router.get("/intake/pending")
async def get_pending_intakes(
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """대기 중인 입고 기록 조회 (매니저 전용)"""
    user_type = current_user.get("user_type")
    if user_type != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 조회할 수 있습니다")
    
    from sqlalchemy import text
    query = text("""
        SELECT 
            iir.intake_id,
            iir.staff_id,
            u.name as staff_name,
            iir.intake_items,
            iir.note,
            iir.created_at,
            iir.status
        FROM ingredient_intake_requests iir
        JOIN users u ON iir.staff_id = u.user_id
        WHERE iir.status = 'PENDING'
        ORDER BY iir.created_at DESC
    """)
    
    results = db.execute(query).fetchall()
    intakes = []
    for row in results:
        intakes.append({
            "intake_id": str(row[0]),
            "staff_id": str(row[1]),
            "staff_name": row[2],
            "intake_items": row[3],
            "note": row[4],
            "created_at": row[5].isoformat() if row[5] else None,
            "status": row[6]
        })
    
    return {
        "success": True,
        "intakes": intakes,
        "count": len(intakes)
    }


@router.get("/intake/history")
async def get_intake_history(
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user),
    limit: int = 25
) -> dict[str, Any]:
    """최근 재료 입고 기록 조회 (매니저 전용)"""
    user_type = current_user.get("user_type")
    if user_type != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 조회할 수 있습니다")

    history_query = text("""
        SELECT
            iir.intake_id,
            iir.staff_id,
            staff_user.name AS staff_name,
            staff_user.email AS staff_email,
            iir.intake_items,
            iir.note,
            iir.status,
            iir.created_at,
            iir.approved_at,
            approver.name AS approved_by_name
        FROM ingredient_intake_requests iir
        LEFT JOIN users staff_user ON iir.staff_id = staff_user.user_id
        LEFT JOIN users approver ON iir.approved_by = approver.user_id
        ORDER BY iir.created_at DESC
        LIMIT :limit
    """)

    results = db.execute(history_query, {"limit": max(1, min(limit, 100))}).fetchall()

    history: list[dict[str, Any]] = []
    for row in results:
        intake_items = row[4]
        if isinstance(intake_items, str):
            try:
                intake_items = json.loads(intake_items)
            except json.JSONDecodeError:
                intake_items = []

        history.append({
            "intake_id": str(row[0]),
            "staff_id": str(row[1]) if row[1] else None,
            "staff_name": row[2],
            "staff_email": row[3],
            "intake_items": intake_items,
            "note": row[5],
            "status": row[6],
            "created_at": row[7].isoformat() if row[7] else None,
            "approved_at": row[8].isoformat() if row[8] else None,
            "approved_by": row[9]
        })

    return {
        "success": True,
        "history": history,
        "count": len(history)
    }


@router.post("/intake/{intake_id}/approve")
async def approve_intake(
    intake_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """입고 기록 승인 (매니저 전용)"""
    user_type = current_user.get("user_type")
    if user_type != "MANAGER":
        raise HTTPException(status_code=403, detail="매니저만 승인할 수 있습니다")
    
    from sqlalchemy import text
    from datetime import datetime
    import json
    
    # 입고 기록 조회
    get_query = text("""
        SELECT intake_id, staff_id, intake_items, note
        FROM ingredient_intake_requests
        WHERE intake_id = CAST(:intake_id AS uuid) AND status = 'PENDING'
    """)
    
    intake = db.execute(get_query, {"intake_id": intake_id}).fetchone()
    if not intake:
        raise HTTPException(status_code=404, detail="대기 중인 입고 기록을 찾을 수 없습니다")
    
    # 재고 반영
    intake_items = json.loads(intake[2]) if isinstance(intake[2], str) else intake[2]
    result = ingredient_service.record_intake(
        db=db,
        intake_items=intake_items,
        staff_id=str(intake[1]),
        note=intake[3]
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "재고 반영 실패"))
    
    # 승인 상태로 업데이트
    approve_query = text("""
        UPDATE ingredient_intake_requests
        SET status = 'APPROVED',
            approved_at = :approved_at,
            approved_by = CAST(:approved_by AS uuid)
        WHERE intake_id = CAST(:intake_id AS uuid)
    """)
    
    db.execute(approve_query, {
        "intake_id": intake_id,
        "approved_at": datetime.now(),
        "approved_by": current_user.get("id")
    })
    
    db.commit()
    
    return {
        "success": True,
        "message": "입고 기록이 승인되어 재고에 반영되었습니다",
        "intake_id": intake_id
    }


@router.get("/pricing")
async def get_ingredient_pricing() -> dict[str, Any]:
    """재료 단가 목록 조회"""
    return ingredient_service.get_ingredient_pricing()