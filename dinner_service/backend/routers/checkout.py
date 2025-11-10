"""
주문 체크아웃 API 라우터
FR-012: 배송지 입력 기능
FR-013: Mock 결제 시스템
"""

from datetime import date, datetime, time
from typing import Annotated, Any, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging

from ..services.database import get_db
from ..services.payment_service import PaymentService
from ..services.order_service import OrderService

router = APIRouter(tags=["checkout"])
logger = logging.getLogger(__name__)


# ===== Pydantic Models =====

class DeliveryInfo(BaseModel):
    """배송지 정보"""
    address: str = Field(..., description="배송 주소", min_length=2)
    recipient_name: Optional[str] = Field(None, description="수령인 이름")
    recipient_phone: Optional[str] = Field(None, description="수령인 전화번호")
    delivery_notes: Optional[str] = Field(None, description="배송 요청사항")
    scheduled_date: Optional[date] = Field(None, description="예약 배송일 (YYYY-MM-DD)")
    scheduled_time_slot: Optional[str] = Field(
        None,
        description="예약 시간대 (HH:MM, 24시간 형식)"
    )


class PaymentInfo(BaseModel):
    """결제 정보"""
    card_number: str = Field(..., description="카드 번호 (16자리)")
    cardholder_name: str = Field(..., description="카드 소유자 이름")
    expiry_date: str = Field(..., description="유효기간 (MM/YY)")
    cvc: str = Field(..., description="CVC 코드 (3자리)")


class CheckoutRequest(BaseModel):
    """통합 체크아웃 요청"""
    # 주문 정보
    menu_code: str = Field(..., description="메뉴 코드")
    style: str = Field(..., description="스타일 (simple, grand, deluxe)")
    quantity: int = Field(1, ge=1, le=10, description="수량")

    # 배송 정보
    delivery: DeliveryInfo

    # 결제 정보
    payment: PaymentInfo

    # 사용자 정보 (선택)
    user_id: Optional[str] = Field(None, description="로그인한 사용자 ID (UUID)")
    save_as_default_address: bool = Field(False, description="기본 배송지로 저장 여부")

    # 커스터마이징 정보 (선택)
    customizations: Optional[dict[str, int]] = Field(None, description="재료 커스터마이징 정보 {재료명: 수량}")


class CheckoutResponse(BaseModel):
    """체크아웃 응답"""
    success: bool
    order_id: str
    order_number: str
    payment_id: str
    transaction_id: str
    total_price: float
    delivery_address: str
    masked_card_number: str
    payment_status: str
    message: str


# ===== API Endpoints =====

@router.post("/checkout", response_model=CheckoutResponse)
async def process_checkout(
    request: CheckoutRequest,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """
    통합 체크아웃 프로세스

    1. 주문 생성 (order_service)
    2. Mock 결제 처리 (payment_service)
    3. 배송지 기본값 저장 (선택적)
    4. 트랜잭션 관리
    """
    try:
        scheduled_for_iso: str | None = None

        if request.delivery.scheduled_date:
            try:
                time_slot = request.delivery.scheduled_time_slot or "18:00"
                scheduled_time = time.fromisoformat(time_slot)
                scheduled_dt = datetime.combine(request.delivery.scheduled_date, scheduled_time)
                scheduled_for_iso = scheduled_dt.isoformat()
            except ValueError:
                logger.warning(f"잘못된 배송 일정 입력: date={request.delivery.scheduled_date}, time={request.delivery.scheduled_time_slot}")

        # 1. 주문 생성
        order_result = OrderService.create_order(
            db=db,
            order_data={
                "dinner_code": request.menu_code,  # menu_code → dinner_code
                "style": request.style,
                "quantity": request.quantity,
                "delivery_address": request.delivery.address,
                "user_id": request.user_id,
                "order_type": "gui",
                "scheduled_for": scheduled_for_iso,
                "special_requests": request.delivery.delivery_notes,
                "customizations": request.customizations
            }
        )

        if not order_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=order_result.get("error", "주문 생성 실패")
            )

        order_id = order_result["order"]["id"]  # order_id → id
        total_price = order_result["order"]["pricing"]["final_price"]  # total_price → pricing.final_price

        # 2. Mock 결제 처리
        payment_result = PaymentService.process_mock_payment(
            order_id=order_id,
            amount=total_price,
            card_number=request.payment.card_number,
            cardholder_name=request.payment.cardholder_name,
            expiry_date=request.payment.expiry_date,
            cvc=request.payment.cvc,
            db=db
        )

        if not payment_result.get("success"):
            # 결제 실패 시 주문 상태를 결제실패로 기록
            cancel_query = text("""
                UPDATE orders
                SET order_status = 'PAYMENT_FAILED',
                    payment_status = 'FAILED'
                WHERE order_id = :order_id
            """)
            db.execute(cancel_query, {"order_id": order_id})
            db.commit()

            error_message = payment_result.get("message", "유효하지 않은 카드 번호입니다")
            logger.error(f"결제 실패: order_id={order_id}, reason={error_message}")
            raise HTTPException(
                status_code=400,
                detail=error_message
            )

        # 3. 배송지 기본값 저장 (선택적)
        if request.save_as_default_address and request.user_id:
            try:
                update_address_query = text("""
                    UPDATE users
                    SET address = :address
                    WHERE user_id = :user_id
                """)
                db.execute(update_address_query, {
                    "address": request.delivery.address,
                    "user_id": request.user_id
                })
                db.commit()
                logger.info(f"기본 배송지 저장 완료: user_id={request.user_id}")
            except Exception as e:
                logger.error(f"기본 배송지 저장 실패: {e}")
                # 실패해도 주문/결제는 성공으로 처리

        # 4. 커스터마이징 정보 저장 (선택적)
        if request.customizations and len(request.customizations) > 0:
            try:
                # order_item_id 조회
                order_item_query = text("""
                    SELECT order_item_id
                    FROM order_items
                    WHERE order_id = CAST(:order_id AS uuid)
                    LIMIT 1
                """)
                order_item_result = db.execute(order_item_query, {"order_id": order_id}).fetchone()

                if order_item_result:
                    order_item_id = str(order_item_result[0])
                    base_ingredients = OrderService.get_base_ingredients(db, request.menu_code, request.style)

                    # 각 커스터마이징 항목 저장
                    for item_name, quantity in request.customizations.items():
                        try:
                            qty_int = int(quantity)
                        except (TypeError, ValueError):
                            continue

                        base_qty = base_ingredients.get(item_name, 0)
                        diff = qty_int - base_qty

                        if diff == 0:
                            continue

                        change_type_value = 'INCREASE' if diff > 0 else 'DECREASE'
                        total_diff = diff * max(1, request.quantity)

                        customization_query = text("""
                            INSERT INTO order_item_customizations
                            (order_item_id, item_name, change_type, quantity_change)
                            VALUES (CAST(:order_item_id AS uuid), :item_name, :change_type, :quantity_change)
                        """)
                        db.execute(customization_query, {
                            "order_item_id": order_item_id,
                            "item_name": item_name,
                            "change_type": change_type_value,
                            "quantity_change": total_diff
                        })

                    db.commit()
                    logger.info(f"커스터마이징 저장 완료: order_id={order_id}, items={len(request.customizations)}")
            except Exception as e:
                logger.error(f"커스터마이징 저장 실패: {e}")
                # 실패해도 주문/결제는 성공으로 처리

        # 5. 성공 응답
        return {
            "success": True,
            "order_id": order_id,
            "order_number": order_result["order"]["order_number"],
            "payment_id": payment_result["payment_id"],
            "transaction_id": payment_result["transaction_id"],
            "total_price": total_price,
            "delivery_address": request.delivery.address,
            "masked_card_number": payment_result["masked_card_number"],
            "payment_status": payment_result.get("payment_status", "PAID"),
            "message": "주문 및 결제가 성공적으로 완료되었습니다"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"체크아웃 처리 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"체크아웃 처리 중 오류가 발생했습니다: {str(e)}"
        )


@router.get("/delivery-info/{user_id}")
async def get_user_delivery_info(
    user_id: str,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """
    사용자의 기본 배송지 정보 조회

    Args:
        user_id: 사용자 ID (UUID)

    Returns:
        배송지 정보 또는 빈 객체
    """
    try:
        query = text("""
            SELECT
                name,
                phone_number,
                address
            FROM users
            WHERE user_id = :user_id
        """)

        result = db.execute(query, {"user_id": user_id})
        row = result.fetchone()

        if not row:
            return {
                "has_default": False,
                "delivery_info": None
            }

        return {
            "has_default": bool(row[2]),  # address 필드가 있는지
            "delivery_info": {
                "recipient_name": row[0],
                "recipient_phone": row[1],
                "address": row[2]
            } if row[2] else None
        }

    except Exception as e:
        logger.error(f"배송지 정보 조회 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail="배송지 정보 조회 중 오류가 발생했습니다"
        )


@router.put("/delivery-info/{user_id}")
async def update_user_delivery_info(
    user_id: str,
    delivery: DeliveryInfo,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """
    사용자의 기본 배송지 정보 업데이트

    Args:
        user_id: 사용자 ID (UUID)
        delivery: 배송지 정보

    Returns:
        업데이트 결과
    """
    try:
        query = text("""
            UPDATE users
            SET address = :address
            WHERE user_id = :user_id
            RETURNING user_id
        """)

        result = db.execute(query, {
            "address": delivery.address,
            "user_id": user_id
        })

        if result.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="사용자를 찾을 수 없습니다"
            )

        db.commit()

        return {
            "success": True,
            "message": "기본 배송지가 저장되었습니다",
            "delivery_info": {
                "address": delivery.address,
                "recipient_name": delivery.recipient_name,
                "recipient_phone": delivery.recipient_phone
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"배송지 정보 업데이트 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail="배송지 정보 업데이트 중 오류가 발생했습니다"
        )


@router.get("/payment-info/{order_id}")
async def get_payment_info(
    order_id: str,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """
    주문의 결제 정보 조회

    Args:
        order_id: 주문 ID (UUID)

    Returns:
        결제 정보
    """
    try:
        payment_info = PaymentService.get_payment_info(order_id, db)

        if not payment_info:
            raise HTTPException(
                status_code=404,
                detail="결제 정보를 찾을 수 없습니다"
            )

        return {
            "success": True,
            "payment_info": payment_info
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"결제 정보 조회 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail="결제 정보 조회 중 오류가 발생했습니다"
        )


@router.get("/payments/user/{user_id}")
async def get_user_payments(
    user_id: str,
    db: Annotated[Session, Depends(get_db)]
) -> dict[str, Any]:
    """사용자의 결제 내역 리스트 반환"""
    try:
        payments = PaymentService.get_user_payments(user_id, db)

        return {
            "success": True,
            "payments": payments,
            "message": "결제 내역이 없습니다." if not payments else None
        }

    except Exception as e:
        logger.error(f"사용자 결제 내역 조회 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail="사용자 결제 내역 조회 중 오류가 발생했습니다"
        )