"""
결제 처리 서비스 (Mock Payment System)
FR-013: Mock 결제 시스템 구현
"""

import os
import uuid
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class PaymentService:
    """Mock 결제 처리 서비스"""

    @staticmethod
    def mask_card_number(card_number: str) -> str:
        """
        카드 번호 마스킹 처리

        Args:
            card_number: 16자리 카드 번호 (예: "1234567890123456")

        Returns:
            마스킹된 카드 번호 (예: "****-****-****-3456")
        """
        # 하이픈 제거
        card_clean = card_number.replace("-", "").replace(" ", "")

        # 16자리가 아니면 에러
        if len(card_clean) != 16:
            raise ValueError("카드 번호는 16자리여야 합니다")

        # 마지막 4자리만 표시
        last_four = card_clean[-4:]
        return f"****-****-****-{last_four}"

    @staticmethod
    def validate_card_number(card_number: str) -> bool:
        """
        카드 번호 유효성 검증 (간단한 형식 체크)

        Args:
            card_number: 검증할 카드 번호

        Returns:
            유효 여부
            
        Raises:
            ValueError: 카드 번호가 유효하지 않은 경우
        """
        if not card_number:
            raise ValueError("유효하지 않은 카드 번호입니다")
        
        # 하이픈, 공백, 모든 비숫자 제거
        card_clean = ''.join(c for c in card_number if c.isdigit())

        # 16자리 숫자인지 확인
        if len(card_clean) != 16:
            logger.warning(f"카드 번호 길이 오류: 입력={card_number}, 정제 후={card_clean}, 길이={len(card_clean)}")
            raise ValueError("유효하지 않은 카드 번호입니다")
        
        return True

    @staticmethod
    def process_mock_payment(
        order_id: str,
        amount: float,
        card_number: str,
        cardholder_name: str,
        expiry_date: str,
        cvc: str,
        db: Session
    ) -> Dict[str, Any]:
        """Mock 결제 처리 (테스트 모드)"""
        try:
            mode = os.getenv("MOCK_PAYMENT_MODE", "always_success").lower()
            force_fail = mode in {"force_fail", "always_fail"}

            if not PaymentService.validate_card_number(card_number):
                raise ValueError("유효하지 않은 카드 번호입니다")

            # 2. 카드 번호 마스킹
            masked_card = PaymentService.mask_card_number(card_number)

            transaction_id = f"TXN-{uuid.uuid4().hex[:12].upper()}"
            payment_id = str(uuid.uuid4())
            payment_status = "PAID"
            error_message: Optional[str] = None

            if force_fail:
                payment_status = "FAILED"
                error_message = f"MOCK_PAYMENT_MODE={mode}"

            update_order_query = text("""
                UPDATE orders
                SET payment_status = :payment_status
                WHERE order_id = :order_id
            """)

            db.execute(update_order_query, {
                "payment_status": payment_status,
                "order_id": order_id
            })

            insert_payment_query = text("""
                INSERT INTO mock_payments
                (payment_id, order_id, transaction_id, amount, status, masked_card_number, cardholder_name, error_message)
                VALUES (CAST(:payment_id AS uuid), CAST(:order_id AS uuid), :transaction_id, :amount, :status, :masked_card_number, :cardholder_name, :error_message)
            """)

            db.execute(insert_payment_query, {
                "payment_id": payment_id,
                "order_id": order_id,
                "transaction_id": transaction_id,
                "amount": float(amount),
                "status": payment_status,
                "masked_card_number": masked_card,
                "cardholder_name": cardholder_name,
                "error_message": error_message
            })

            db.commit()

            if payment_status == "FAILED":
                logger.error(f"Mock 결제 실패(강제): order_id={order_id}, transaction_id={transaction_id}")
                return {
                    "success": False,
                    "payment_id": payment_id,
                    "transaction_id": transaction_id,
                    "payment_completed_at": datetime.now().isoformat(),
                    "masked_card_number": masked_card,
                    "payment_amount": float(amount),
                    "cardholder_name": cardholder_name,
                    "message": "결제 처리가 실패로 강제되었습니다.",
                    "error": error_message,
                    "payment_status": payment_status
                }

            logger.info(f"Mock 결제 성공: order_id={order_id}, transaction_id={transaction_id}")

            return {
                "success": True,
                "payment_id": payment_id,
                "transaction_id": transaction_id,
                "payment_completed_at": datetime.now().isoformat(),
                "masked_card_number": masked_card,
                "payment_amount": float(amount),
                "cardholder_name": cardholder_name,
                "message": "결제가 성공적으로 완료되었습니다"
            }

        except ValueError as ve:
            db.rollback()
            logger.error(f"결제 검증 실패: {ve}")
            return {
                "success": False,
                "error": str(ve),
                "message": "결제 정보 검증에 실패했습니다"
            }

        except Exception as e:
            db.rollback()
            logger.error(f"결제 처리 실패: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "결제 처리 중 오류가 발생했습니다"
            }

    @staticmethod
    def get_payment_info(order_id: str, db: Session) -> Optional[Dict[str, Any]]:
        """
        주문의 결제 정보 조회

        Args:
            order_id: 주문 ID
            db: 데이터베이스 세션

        Returns:
            결제 정보 또는 None
        """
        try:
            query = text("""
                SELECT
                    mp.payment_id::text,
                    mp.order_id::text,
                    mp.transaction_id,
                    mp.amount,
                    mp.status,
                    mp.masked_card_number,
                    mp.cardholder_name,
                    mp.created_at,
                    mp.error_message
                FROM mock_payments mp
                WHERE mp.order_id = CAST(:order_id AS uuid)
                ORDER BY mp.created_at DESC
                LIMIT 1
            """)

            result = db.execute(query, {"order_id": order_id})
            row = result.fetchone()

            if not row:
                return None

            return {
                "payment_id": row.payment_id,
                "order_id": row.order_id,
                "transaction_id": row.transaction_id,
                "amount": float(row.amount) if row.amount is not None else 0,
                "status": row.status,
                "masked_card_number": row.masked_card_number,
                "cardholder_name": row.cardholder_name,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "error_message": row.error_message
            }

        except Exception as e:
            logger.error(f"결제 정보 조회 실패: {e}")
            return None

    @staticmethod
    def get_user_payments(user_id: str, db: Session) -> list[Dict[str, Any]]:
        """특정 사용자의 결제 내역 조회"""
        try:
            query = text("""
                SELECT
                    mp.payment_id::text,
                    mp.order_id::text,
                    o.order_number,
                    mp.transaction_id,
                    mp.amount,
                    mp.status,
                    mp.masked_card_number,
                    mp.cardholder_name,
                    mp.created_at,
                    mp.error_message
                FROM mock_payments mp
                JOIN orders o ON o.order_id = mp.order_id
                WHERE o.customer_id = CAST(:user_id AS uuid)
                ORDER BY mp.created_at DESC
            """)

            results = db.execute(query, {"user_id": user_id}).fetchall()

            payments: list[Dict[str, Any]] = []
            for row in results:
                payments.append({
                    "payment_id": row.payment_id,
                    "order_id": row.order_id,
                    "order_number": row.order_number,
                    "transaction_id": row.transaction_id,
                    "amount": float(row.amount) if row.amount is not None else 0,
                    "status": row.status,
                    "masked_card_number": row.masked_card_number,
                    "cardholder_name": row.cardholder_name,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                    "error_message": row.error_message
                })

            return payments

        except Exception as e:
            logger.error(f"사용자 결제 내역 조회 실패: {e}")
            return []