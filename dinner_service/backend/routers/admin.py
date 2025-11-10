"""
관리자/개발자 API 라우터
개발용 엔드포인트 및 관리자 전용 기능
환경 기반 보안 적용
"""

import os
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..services.login_service import LoginService, verify_admin_access
from ..services.ingredient_service import ingredient_service
from ..services.database import get_db

# 환경 변수 체크
ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
security = HTTPBearer()

router = APIRouter(tags=["admin"])


def verify_dev_environment():
    """개발 환경 확인"""
    if ENVIRONMENT not in ["development", "dev", "local"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="개발 환경에서만 접근 가능합니다"
        )


def verify_admin_token(credentials: HTTPAuthorizationCredentials) -> dict:
    """관리자 토큰 검증"""
    token = credentials.credentials
    payload = LoginService.verify_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 토큰입니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    is_admin = payload.get("is_admin", False)
    if not verify_admin_access(is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다"
        )
    
    return payload


@router.post("/seed/ingredients")
async def seed_ingredient_data(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict[str, Any]:
    """초기 재료 데이터 삽입 (관리자 권한 필요)"""
    verify_admin_token(credentials)
    
    try:
        result = ingredient_service.seed_initial_data()
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"초기 데이터 삽입 중 오류 발생: {str(e)}"
        }


@router.get("/ingredients/")
async def get_ingredients(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict[str, Any]:
    """전체 재료 목록 조회 (관리자 권한 필요, 한국어 번역 포함)"""
    verify_admin_token(credentials)
    
    try:
        result = ingredient_service.get_all_ingredients()
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"재료 목록 조회 중 오류 발생: {str(e)}"
        }


@router.get("/ingredients/categorized")
async def get_categorized_ingredients(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict[str, Any]:
    """카테고리별 재료 목록 조회 (관리자 권한 필요, 한국어)"""
    verify_admin_token(credentials)
    
    try:
        result = ingredient_service.get_categorized_ingredients()
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"카테고리별 재료 조회 중 오류 발생: {str(e)}"
        }


@router.post("/ingredients/add-stock")
async def add_ingredient_stock(
    data: dict,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict[str, Any]:
    """재료 재고 추가 (관리자 권한 필요)"""
    verify_admin_token(credentials)
    
    try:
        ingredient_id = data.get('ingredientId')
        quantity = data.get('quantity')
        
        if not ingredient_id:
            return {
                "success": False,
                "error": "재료 ID가 필요합니다"
            }
        
        result = ingredient_service.add_stock(ingredient_id, quantity)
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"재고 추가 중 오류 발생: {str(e)}"
        }


@router.post("/ingredients/bulk-restock")
async def bulk_restock_ingredients(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict[str, Any]:
    """재고 부족 재료 일괄 재입고 (관리자 권한 필요)"""
    verify_admin_token(credentials)
    
    try:
        result = ingredient_service.bulk_restock_low_items()
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"일괄 재입고 중 오류 발생: {str(e)}"
        }


@router.get("/system/health")
async def system_health(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> dict[str, Any]:
    """시스템 상태 확인 (관리자 권한 필요)"""
    verify_admin_token(credentials)

    try:
        # 데이터베이스 연결 상태 확인
        # 추후 더 상세한 헬스체크 로직 추가 가능

        return {
            "success": True,
            "status": "healthy",
            "environment": ENVIRONMENT,
            "services": {
                "database": "connected",
                "menu_service": "active",
                "data_files": "active",
                "ingredient_service": "active"
            }
        }
    except Exception as e:
        return {
            "success": False,
            "status": "unhealthy",
            "error": str(e)
        }


@router.get("/accounting/stats")
async def get_accounting_stats(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """회계 통계 조회 (관리자 권한 필요)"""
    verify_admin_token(credentials)

    try:
        # 총 주문 수 및 총 매출 (결제실패/취소 제외)
        orders_query = text("""
            SELECT
                COUNT(*) as total_orders,
                COALESCE(SUM(total_price), 0) as total_revenue
            FROM orders
            WHERE order_status IN ('RECEIVED', 'PREPARING', 'DELIVERING', 'COMPLETED')
              AND order_status NOT IN ('PAYMENT_FAILED', 'CANCELLED')
        """)
        orders_result = db.execute(orders_query).fetchone()

        total_orders = orders_result[0] if orders_result else 0
        total_revenue = float(orders_result[1]) if orders_result else 0.0

        # 평균 주문 금액
        average_order_amount = total_revenue / total_orders if total_orders > 0 else 0.0

        # 총 고객 수
        customers_query = text("""
            SELECT COUNT(*) as total_customers
            FROM users
            WHERE user_type = 'CUSTOMER'
        """)
        customers_result = db.execute(customers_query).fetchone()
        total_customers = customers_result[0] if customers_result else 0

        # 인기 메뉴 Top 5 (order_items와 menu_items JOIN)
        popular_menus_query = text("""
            SELECT
                mi.name as menu_name,
                COUNT(*) as order_count,
                COALESCE(SUM(o.total_price), 0) as total_revenue
            FROM orders o
            INNER JOIN order_items oi ON o.order_id = oi.order_id
            INNER JOIN menu_items mi ON oi.menu_item_id = mi.menu_item_id
            WHERE o.order_status IN ('RECEIVED', 'PREPARING', 'DELIVERING', 'COMPLETED')
              AND o.order_status NOT IN ('PAYMENT_FAILED', 'CANCELLED')
            GROUP BY mi.name
            ORDER BY order_count DESC, total_revenue DESC
            LIMIT 5
        """)
        popular_menus_result = db.execute(popular_menus_query).fetchall()

        popular_menus = [
            {
                "menu_name": row[0],
                "order_count": row[1],
                "total_revenue": float(row[2])
            }
            for row in popular_menus_result
        ]

        return {
            "success": True,
            "stats": {
                "total_orders": total_orders,
                "total_revenue": total_revenue,
                "total_customers": total_customers,
                "average_order_amount": average_order_amount,
                "popular_menus": popular_menus
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"회계 통계 조회 중 오류 발생: {str(e)}"
        }