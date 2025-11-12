"""
주문 API 라우터
주문 생성, 관리 및 용량 확인
"""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.order_service import OrderService
from ..services.login_service import LoginService
from ..services.websocket_manager import manager as ws_manager

security = HTTPBearer()

# 주문 요청 모델
class OrderRequest(BaseModel):
    dinner_code: str  # valentine, french, english, champagne
    style: str  # simple, grand, deluxe
    quantity: Annotated[int, Field(default=1, ge=1, le=10)]
    delivery_address: Annotated[str, Field(default="", max_length=200)]
    user_id: str | None = None  # UUID 문자열
    customizations: dict[str, int] | None = None
    notes: Annotated[str, Field(default="", max_length=500)]
    order_type: Annotated[str, Field(default="gui", pattern="^(gui|voice)$")]


router = APIRouter(tags=["orders"])


@router.post("/")
async def create_order_endpoint(
    order_request: OrderRequest,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """주문 생성"""
    order_data = order_request.model_dump()
    return OrderService.create_order(db, order_data)


@router.get("/{order_id}")
async def get_order(
    order_id: str,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """주문 정보 조회 (단일 주문)"""
    try:
        query = text("""
            SELECT
                o.order_id,
                o.order_number,
                o.customer_id,
                o.delivery_address,
                o.total_price,
                o.order_status,
                o.payment_status,
                o.created_at,
                o.delivery_time_estimated
            FROM orders o
            WHERE o.order_id = CAST(:order_id AS uuid)
        """)

        result = db.execute(query, {"order_id": order_id}).fetchone()

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="주문을 찾을 수 없습니다"
            )

        return {
            "success": True,
            "order": {
                "order_id": str(result.order_id),
                "order_number": result.order_number,
                "customer_id": str(result.customer_id) if result.customer_id else None,
                "delivery_address": result.delivery_address,
                "total_price": float(result.total_price) if result.total_price else 0,
                "order_status": result.order_status,
                "payment_status": result.payment_status,
                "created_at": result.created_at.isoformat() if result.created_at else None,
                "delivery_time_estimated": result.delivery_time_estimated.isoformat() if result.delivery_time_estimated else None
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"주문 조회 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"주문 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get("/user/{user_id}")
async def get_user_orders(
    user_id: str,  # UUID 문자열
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """사용자의 주문 내역 조회 (JWT 토큰 필요)"""
    # JWT 토큰 검증
    token = credentials.credentials
    payload = LoginService.verify_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 토큰입니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 토큰의 사용자 ID와 요청한 사용자 ID가 일치하는지 확인
    token_user_id = payload.get("user_id")
    if token_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="본인의 주문 내역만 조회할 수 있습니다"
        )
    
    return OrderService.get_user_orders(db, user_id)


@router.get("/{order_id}/customizations")
async def get_customizations(
    order_id: str,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """주문 커스터마이징 내역 조회"""
    try:
        logger = logging.getLogger(__name__)

        # JWT 토큰 검증
        token = credentials.credentials
        payload = LoginService.verify_token(token)

        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = payload.get("user_id")

        # 주문 소유권 확인
        order_check_query = text("""
            SELECT customer_id
            FROM orders
            WHERE order_id = CAST(:order_id AS uuid)
        """)

        order_result = db.execute(order_check_query, {"order_id": order_id}).fetchone()

        if not order_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="주문을 찾을 수 없습니다"
            )

        if str(order_result.customer_id) != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="본인의 주문만 조회할 수 있습니다"
            )

        # 커스터마이징 내역 조회
        query = text("""
            SELECT customization_id, order_item_id, item_name, change_type, quantity_change
            FROM order_item_customizations
            WHERE order_item_id IN (
                SELECT order_item_id
                FROM order_items
                WHERE order_id = CAST(:order_id AS uuid)
            )
            ORDER BY customization_id
        """)

        results = db.execute(query, {"order_id": order_id}).fetchall()

        customizations = [
            {
                "customization_id": str(row.customization_id),
                "order_item_id": str(row.order_item_id),
                "item_name": row.item_name,
                "change_type": row.change_type,
                "quantity_change": row.quantity_change
            }
            for row in results
        ]

        logger.info(f"커스터마이징 조회 성공: order_id={order_id}, count={len(customizations)}")

        return {
            "success": True,
            "customizations": customizations,
            "count": len(customizations)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"커스터마이징 조회 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"커스터마이징 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.post("/reorder/{order_id}")
async def reorder(
    order_id: str,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """과거 주문을 재주문 (원클릭 재주문)"""
    try:
        logger = logging.getLogger(__name__)

        # JWT 토큰 검증
        token = credentials.credentials
        payload = LoginService.verify_token(token)

        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = payload.get("user_id")

        # 원본 주문 조회
        order_query = text("""
            SELECT
                o.order_id, o.customer_id, o.delivery_address, o.order_status,
                oi.menu_item_id, oi.serving_style_id, oi.quantity,
                mi.code as dinner_code,
                ss.name as style_name
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN menu_items mi ON oi.menu_item_id = mi.menu_item_id
            JOIN serving_styles ss ON oi.serving_style_id = ss.serving_style_id
            WHERE o.order_id = CAST(:order_id AS uuid)
        """)

        result = db.execute(order_query, {"order_id": order_id}).fetchone()

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="주문을 찾을 수 없습니다"
            )

        # 권한 확인 (본인의 주문만 재주문 가능)
        # customer_id가 null인 경우 (구주문) 권한 체크 스킵
        if result.customer_id and str(result.customer_id) != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="본인의 주문만 재주문할 수 있습니다"
            )

        # 취소된 주문은 재주문 불가
        if result.order_status == 'CANCELLED':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="취소된 주문은 재주문할 수 없습니다"
            )

        # 재주문 데이터 구성
        reorder_data = {
            "dinner_code": result.dinner_code,
            "style": result.style_name,
            "quantity": result.quantity,
            "delivery_address": result.delivery_address,
            "user_id": user_id,  # JWT에서 얻은 현재 사용자 ID
            "order_type": "gui"
        }

        # 새 주문 생성 (최신 가격/할인율 자동 적용)
        new_order_result = OrderService.create_order(db, reorder_data)

        if not new_order_result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=new_order_result.get("error", "재주문 생성 실패")
            )

        logger.info(f"재주문 성공: 원본={order_id}, 새주문={new_order_result['order']['id']}")

        return {
            "success": True,
            "message": "과거 주문을 재주문했습니다",
            "original_order_id": order_id,
            "order": new_order_result["order"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"재주문 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"재주문 중 오류가 발생했습니다: {str(e)}"
        )


# 직원용 API 엔드포인트
@router.get("/staff/all")
async def get_all_orders_for_staff(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)],
    order_status: str | None = None
) -> dict[str, Any]:
    """직원용 전체 주문 목록 조회"""
    try:
        logger = logging.getLogger(__name__)

        # JWT 토큰 검증
        token = credentials.credentials
        payload = LoginService.verify_token(token)

        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 직원 또는 관리자 권한 확인
        user_type = payload.get("user_type")
        if user_type not in ["STAFF", "MANAGER"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="직원 또는 관리자 권한이 필요합니다"
            )

        # 주문 조회 쿼리 (고객 정보 포함)
        query_parts = ["""
            SELECT
                o.order_id,
                o.order_number,
                o.order_status,
                o.payment_status,
                o.total_price,
                o.delivery_address,
                o.created_at,
                o.delivery_time_estimated,
                mi.name AS menu_name,
                mi.code AS menu_code,
                ss.name AS style_name,
                oi.quantity,
                oi.price_per_item,
                oi.order_item_id,
                u.name AS customer_name,
                u.phone_number AS customer_phone,
                u.email AS customer_email
            FROM orders o
            LEFT JOIN order_items oi ON o.order_id = oi.order_id
            LEFT JOIN menu_items mi ON oi.menu_item_id = mi.menu_item_id
            LEFT JOIN serving_styles ss ON oi.serving_style_id = ss.serving_style_id
            LEFT JOIN users u ON o.customer_id = u.user_id
        """]

        params = {}
        if order_status:
            query_parts.append("WHERE o.order_status = :order_status")
            params["order_status"] = order_status

        query_parts.append("ORDER BY o.created_at DESC")

        query = text(" ".join(query_parts))
        results = db.execute(query, params).fetchall()

        if not results:
            return {
                "success": True,
                "orders": [],
                "message": "주문이 없습니다."
            }

        # 주문 데이터 변환 (커스터마이징 정보 포함)
        orders = []
        for result in results:
            (order_id, order_number, order_status_val, payment_status_val, total_price,
             delivery_address, created_at, delivery_time_estimated, menu_name,
             menu_code, style_name, quantity, price_per_item, order_item_id,
             customer_name, customer_phone, customer_email) = result

            # 커스터마이징 정보 조회
            customization_query = text("""
                SELECT oic.item_name, oic.quantity_change
                FROM order_item_customizations oic
                INNER JOIN order_items oi ON oic.order_item_id = oi.order_item_id
                WHERE oi.order_id = CAST(:order_id AS uuid)
            """)
            customization_results = db.execute(customization_query, {"order_id": str(order_id)}).fetchall()

            # 커스터마이징을 dict 형태로 변환
            customizations = {}
            for item_name, quantity_change in customization_results:
                customizations[item_name] = quantity_change

            cake_customization = None
            if order_item_id:
                cake_query = text(
                    """
                    SELECT image_path, message, flavor, size, status, created_at
                    FROM cake_customizations
                    WHERE order_item_id = CAST(:order_item_id AS uuid)
                    ORDER BY created_at DESC
                    LIMIT 1
                    """
                )
                cake_row = db.execute(
                    cake_query, {"order_item_id": str(order_item_id)}
                ).fetchone()
                if cake_row:
                    cake_customization = {
                        "image_path": cake_row[0],
                        "message": cake_row[1],
                        "flavor": cake_row[2],
                        "size": cake_row[3],
                        "status": cake_row[4],
                        "created_at": cake_row[5].isoformat() if cake_row[5] else None,
                    }

            orders.append({
                "id": str(order_id),
                "order_number": order_number,
                "status": order_status_val,
                "payment_status": payment_status_val,
                "menu_name": menu_name or "알 수 없는 메뉴",
                "menu_code": menu_code or "",
                "style": style_name.lower() if style_name else "",
                "quantity": quantity or 1,
                "unit_price": float(price_per_item) if price_per_item else 0,
                "total_price": float(total_price),
                "delivery_address": delivery_address or "",
                "order_date": created_at.strftime("%Y-%m-%d %H:%M") if created_at else "",
                "estimated_delivery_time": delivery_time_estimated.strftime("%Y-%m-%d %H:%M") if delivery_time_estimated else "",
                "customer_name": customer_name or "비회원",
                "customer_phone": customer_phone or "",
                "customer_email": customer_email or "",
                "customizations": customizations if customizations else None,
                "cake_customization": cake_customization
            })

        logger.info(f"직원용 주문 조회 성공: {len(orders)}건")

        return {
            "success": True,
            "orders": orders,
            "total_count": len(orders)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"직원용 주문 조회 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"주문 조회 중 오류가 발생했습니다: {str(e)}"
        )


class UpdateOrderStatusRequest(BaseModel):
    new_status: str  # RECEIVED, PREPARING, DELIVERING, COMPLETED


@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: str,
    request: UpdateOrderStatusRequest,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """주문 상태 업데이트 (직원 전용)"""
    try:
        logger = logging.getLogger(__name__)

        # JWT 토큰 검증
        token = credentials.credentials
        payload = LoginService.verify_token(token)

        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 직원 또는 관리자 권한 확인
        user_type = payload.get("user_type")
        if user_type not in ["STAFF", "MANAGER"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="직원 또는 관리자 권한이 필요합니다"
            )

        # 주문 상태 유효성 검증
        valid_statuses = ["RECEIVED", "PREPARING", "DELIVERING", "COMPLETED", "CANCELLED", "PAYMENT_FAILED"]
        if request.new_status not in valid_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"유효하지 않은 상태입니다: {request.new_status}"
            )

        # 주문 존재 여부 확인
        check_query = text("""
            SELECT order_id, order_status, customer_id
            FROM orders
            WHERE order_id = CAST(:order_id AS uuid)
        """)
        order = db.execute(check_query, {"order_id": order_id}).fetchone()

        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="주문을 찾을 수 없습니다"
            )

        # 주문 상태 업데이트
        update_query = text("""
            UPDATE orders
            SET order_status = :new_status
            WHERE order_id = CAST(:order_id AS uuid)
            RETURNING order_id, order_number, order_status
        """)

        result = db.execute(update_query, {
            "order_id": order_id,
            "new_status": request.new_status
        }).fetchone()

        # 조리 시작 시점(RECEIVED → PREPARING)에 고객 주문 횟수 증가
        if order.order_status == 'RECEIVED' and request.new_status == 'PREPARING':
            if order.customer_id:
                try:
                    from ..services.discount_service import DiscountService
                    # 주문 총액 조회
                    price_query = text("SELECT total_price FROM orders WHERE order_id = CAST(:order_id AS uuid)")
                    price_result = db.execute(price_query, {"order_id": order_id}).fetchone()
                    total_price = float(price_result[0]) if price_result and price_result[0] else 0
                    
                    DiscountService.increment_user_orders(str(order.customer_id), db, total_price)
                    logger.info(f"조리 시작: 고객 주문 횟수 증가 - customer_id={order.customer_id}, order_id={order_id}")
                except Exception as inc_error:
                    logger.warning(f"주문 횟수 증가 실패 (상태 변경은 성공): {inc_error}")

        transitioned_to_completed = order.order_status != 'COMPLETED' and request.new_status == 'COMPLETED'
        if transitioned_to_completed:
            consume_result = OrderService.consume_order_inventory(db, order_id)
            if not consume_result.get("success", False):
                error_message = consume_result.get("error", "주문 재고 차감에 실패했습니다")
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=error_message
                )

        db.commit()

        logger.info(f"주문 상태 업데이트 성공: order_id={order_id}, {order.order_status} → {request.new_status}")

        # WebSocket 브로드캐스트
        try:
            import asyncio
            from datetime import datetime

            message_data = {
                "type": "ORDER_STATUS_CHANGED",
                "data": {
                    "id": str(result.order_id),
                    "order_number": result.order_number,
                    "old_status": order.order_status,
                    "new_status": result.order_status
                },
                "message": f"주문 {result.order_number}의 상태가 변경되었습니다",
                "timestamp": datetime.now().isoformat()
            }

            # 모든 직원에게 브로드캐스트
            asyncio.create_task(ws_manager.broadcast_to_staff(message_data))

            # 해당 주문의 고객에게도 전송 (customer_id 조회 필요)
            customer_query = text("SELECT customer_id FROM orders WHERE order_id = CAST(:order_id AS uuid)")
            customer_result = db.execute(customer_query, {"order_id": order_id}).fetchone()
            if customer_result and customer_result.customer_id:
                asyncio.create_task(ws_manager.send_to_user(str(customer_result.customer_id), message_data))

            logger.info(f"WebSocket 브로드캐스트 전송: ORDER_STATUS_CHANGED - {result.order_number}")
        except Exception as ws_error:
            logger.warning(f"WebSocket 브로드캐스트 실패 (상태 변경은 성공): {ws_error}")

        return {
            "success": True,
            "order": {
                "id": str(result.order_id),
                "order_number": result.order_number,
                "status": result.order_status
            },
            "message": f"주문 상태가 {request.new_status}(으)로 변경되었습니다"
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"주문 상태 업데이트 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"주문 상태 업데이트 중 오류가 발생했습니다: {str(e)}"
        )


@router.post("/{order_id}/cancel")
async def cancel_order(
    order_id: str,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """고객 주문 취소 (RECEIVED 상태에서만 가능, 조리 수락 전)"""
    try:
        logger = logging.getLogger(__name__)

        # JWT 토큰 검증
        token = credentials.credentials
        payload = LoginService.verify_token(token)

        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 주문 존재 및 상태 확인
        check_query = text("""
            SELECT order_id, order_number, order_status, customer_id, payment_status
            FROM orders
            WHERE order_id = CAST(:order_id AS uuid)
        """)
        order = db.execute(check_query, {"order_id": order_id}).fetchone()

        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="주문을 찾을 수 없습니다"
            )

        # 고객 본인 주문인지 확인
        user_id = payload.get("user_id")
        if str(order.customer_id) != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="본인의 주문만 취소할 수 있습니다"
            )

        # RECEIVED 상태에서만 취소 가능
        if order.order_status != 'RECEIVED':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="조리 수락 전 주문만 취소할 수 있습니다"
            )

        # 주문 취소 처리
        update_query = text("""
            UPDATE orders
            SET order_status = 'CANCELLED',
                payment_status = 'REFUNDED'
            WHERE order_id = CAST(:order_id AS uuid)
            RETURNING order_id, order_number, order_status
        """)
        result = db.execute(update_query, {"order_id": order_id}).fetchone()

        db.execute(
            text("""
                DELETE FROM order_inventory_reservations
                WHERE order_id = CAST(:order_id AS uuid)
                  AND consumed = FALSE
            """),
            {"order_id": order_id}
        )

        db.commit()

        logger.info(f"고객 주문 취소: order_id={order_id}, order_number={order.order_number}")

        # WebSocket 브로드캐스트
        try:
            import asyncio
            from datetime import datetime

            message_data = {
                "type": "ORDER_STATUS_CHANGED",
                "data": {
                    "id": str(result.order_id),
                    "order_number": result.order_number,
                    "old_status": order.order_status,
                    "new_status": result.order_status
                },
                "message": f"주문 {result.order_number}이(가) 취소되었습니다",
                "timestamp": datetime.now().isoformat()
            }

            # 직원에게 알림
            asyncio.create_task(ws_manager.broadcast_to_staff(message_data))
            # 고객에게도 알림
            asyncio.create_task(ws_manager.send_to_user(user_id, message_data))

            logger.info(f"WebSocket 브로드캐스트 전송: ORDER_CANCELLED - {result.order_number}")
        except Exception as ws_error:
            logger.warning(f"WebSocket 브로드캐스트 실패 (취소는 성공): {ws_error}")

        return {
            "success": True,
            "order": {
                "id": str(result.order_id),
                "order_number": result.order_number,
                "status": result.order_status
            },
            "message": "주문이 취소되었습니다. 환불 처리가 완료되었습니다."
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"주문 취소 실패: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"주문 취소 중 오류가 발생했습니다: {str(e)}"
        )