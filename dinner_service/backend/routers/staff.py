"""
직원 관리 API 라우터
Staff management API router for handling staff status and operations
"""

from typing import Annotated, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.staff_service import staff_service
from ..services.login_service import get_current_user

router = APIRouter(tags=["staff"])


class AssignPositionRequest(BaseModel):
    position: Annotated[str, Field(pattern="^(COOK|DELIVERY|REJECT)$")]  # COOK, DELIVERY, 또는 REJECT (탈락)

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


@router.get("/pending")
async def get_pending_staff(
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """포지션 미정 직원 목록 조회 (매니저 전용)"""
    try:
        # 매니저 권한 확인
        if current_user.get('user_type') != 'MANAGER':
            raise HTTPException(status_code=403, detail="매니저 권한이 필요합니다")

        query = text("""
            SELECT 
                u.user_id,
                u.email,
                u.name,
                u.phone_number,
                u.created_at,
                sd.position
            FROM users u
            LEFT JOIN staff_details sd ON u.user_id = sd.staff_id
            WHERE u.user_type = 'STAFF'
              AND (sd.position IS NULL OR sd.position = '')
            ORDER BY u.created_at DESC
        """)

        results = db.execute(query).fetchall()
        staff_list = []

        for row in results:
            staff_list.append({
                "staff_id": str(row[0]),
                "email": row[1],
                "name": row[2],
                "phone_number": row[3],
                "created_at": row[4].isoformat() if row[4] else None,
                "position": row[5]
            })

        return {
            "success": True,
            "staff": staff_list,
            "count": len(staff_list)
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "error": f"포지션 미정 직원 조회 실패: {str(e)}",
            "staff": []
        }


@router.post("/{staff_id}/assign-position")
async def assign_staff_position(
    staff_id: str,
    request: AssignPositionRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """직원 포지션 할당 (매니저 전용)"""
    try:
        # 매니저 권한 확인
        if current_user.get('user_type') != 'MANAGER':
            raise HTTPException(status_code=403, detail="매니저 권한이 필요합니다")

        # 직원 존재 및 타입 확인
        check_query = text("""
            SELECT u.user_id, u.user_type, sd.position
            FROM users u
            LEFT JOIN staff_details sd ON u.user_id = sd.staff_id
            WHERE u.user_id = CAST(:staff_id AS uuid)
        """)

        staff = db.execute(check_query, {"staff_id": staff_id}).fetchone()

        if not staff:
            raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다")

        if staff[1] != 'STAFF':
            raise HTTPException(status_code=400, detail="직원이 아닌 사용자입니다")

        # REJECT인 경우 직원 계정 삭제
        if request.position == "REJECT":
            delete_query = text("""
                DELETE FROM users
                WHERE user_id = CAST(:staff_id AS uuid)
                  AND user_type = 'STAFF'
            """)
            db.execute(delete_query, {"staff_id": staff_id})
            db.commit()
            
            return {
                "success": True,
                "message": "직원 계정이 삭제되었습니다",
                "staff": {
                    "staff_id": staff_id,
                    "status": "deleted"
                }
            }

        # 포지션에 따른 권한 및 급여 설정
        if request.position == "COOK":
            permissions = {"cook": True, "cooking_start": True, "cooking_complete": True}
            salary = 3500000
        elif request.position == "DELIVERY":
            permissions = {"delivery": True, "delivery_start": True, "delivery_complete": True}
            salary = 2800000
        else:
            raise HTTPException(status_code=400, detail="유효하지 않은 포지션입니다")

        import json
        permissions_json = json.dumps(permissions)

        # store_id 가져오기
        store_query = text("SELECT store_id FROM stores LIMIT 1")
        store_result = db.execute(store_query).fetchone()
        store_id = str(store_result[0]) if store_result else None

        # staff_details 업데이트 또는 생성
        if staff[2]:  # 이미 staff_details가 있으면 업데이트
            update_query = text("""
                UPDATE staff_details
                SET position = :position,
                    salary = :salary,
                    permissions = :permissions::jsonb
                WHERE staff_id = CAST(:staff_id AS uuid)
            """)
            db.execute(update_query, {
                "staff_id": staff_id,
                "position": request.position,
                "salary": salary,
                "permissions": permissions_json
            })
        else:  # 없으면 새로 생성
            insert_query = text("""
                INSERT INTO staff_details (staff_id, store_id, position, salary, permissions)
                VALUES (CAST(:staff_id AS uuid), CAST(:store_id AS uuid), :position, :salary, :permissions::jsonb)
            """)
            db.execute(insert_query, {
                "staff_id": staff_id,
                "store_id": store_id,
                "position": request.position,
                "salary": salary,
                "permissions": permissions_json
            })

        db.commit()

        return {
            "success": True,
            "message": f"직원 포지션이 {request.position}로 할당되었습니다",
            "staff": {
                "staff_id": staff_id,
                "position": request.position,
                "salary": salary
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "error": f"포지션 할당 실패: {str(e)}"
        }


@router.post("/{staff_id}/check-in")
async def check_in_staff(
    staff_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """직원 출근 처리"""
    try:
        # 본인만 출근 가능
        if str(current_user.get("id")) != staff_id:
            raise HTTPException(status_code=403, detail="본인만 출근할 수 있습니다")
        
        from datetime import datetime
        check_in_query = text("""
            UPDATE staff_details
            SET is_on_duty = TRUE,
                last_check_in = :check_in_time
            WHERE staff_id = CAST(:staff_id AS uuid)
            RETURNING is_on_duty, last_check_in
        """)
        
        check_in_time = datetime.now()
        result = db.execute(check_in_query, {
            "staff_id": staff_id,
            "check_in_time": check_in_time
        }).fetchone()
        
        db.commit()
        
        return {
            "success": True,
            "message": "출근 처리되었습니다",
            "is_on_duty": result[0],
            "last_check_in": result[1].isoformat() if result[1] else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "error": f"출근 처리 실패: {str(e)}"
        }


@router.post("/{staff_id}/check-out")
async def check_out_staff(
    staff_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    """직원 퇴근 처리"""
    try:
        # 본인만 퇴근 가능
        if str(current_user.get("id")) != staff_id:
            raise HTTPException(status_code=403, detail="본인만 퇴근할 수 있습니다")
        
        from datetime import datetime
        check_out_query = text("""
            UPDATE staff_details
            SET is_on_duty = FALSE,
                last_check_out = :check_out_time
            WHERE staff_id = CAST(:staff_id AS uuid)
            RETURNING is_on_duty, last_check_out
        """)
        
        check_out_time = datetime.now()
        result = db.execute(check_out_query, {
            "staff_id": staff_id,
            "check_out_time": check_out_time
        }).fetchone()
        
        db.commit()
        
        return {
            "success": True,
            "message": "퇴근 처리되었습니다",
            "is_on_duty": result[0],
            "last_check_out": result[1].isoformat() if result[1] else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "error": f"퇴근 처리 실패: {str(e)}"
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