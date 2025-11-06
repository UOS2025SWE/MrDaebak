"""
단골 할인 서비스 - total_orders 기반 자동 할인 시스템
3회 이상: 10% 할인 (단골)
10회 이상: 20% 할인 (VIP 단골)
"""

import logging
from typing import Any
from sqlalchemy import text
from sqlalchemy.orm import Session

# 로깅 설정
logger = logging.getLogger(__name__)

class DiscountService:
    """단골 할인 관련 비즈니스 로직 처리"""
    
    # 할인 정책 설정
    REGULAR_CUSTOMER_THRESHOLD = 5      # 단골 최소 주문 횟수
    VIP_CUSTOMER_THRESHOLD = 10         # VIP 단골 최소 주문 횟수
    REGULAR_DISCOUNT_RATE = 0.10        # 단골 할인율 (10%)
    VIP_DISCOUNT_RATE = 0.20           # VIP 할인율 (20%)
    
    @classmethod
    def get_customer_discount_info(cls, user_id: str, db: Session) -> dict[str, Any]:
        """고객의 할인 정보 조회 (UUID 기반)"""
        try:
            # 사용자의 총 주문 횟수 조회 (users + customer_loyalty)
            query = text("""
                SELECT
                    COALESCE(cl.order_count, 0) as order_count,
                    u.name,
                    u.email
                FROM users u
                LEFT JOIN customer_loyalty cl ON u.user_id = cl.customer_id
                WHERE u.user_id = CAST(:user_id AS uuid)
            """)

            result = db.execute(query, {"user_id": user_id}).fetchone()

            if not result:
                return {
                    "eligible": False,
                    "discount_rate": 0.0,
                    "customer_type": "신규고객",
                    "total_orders": 0,
                    "next_tier_orders": cls.REGULAR_CUSTOMER_THRESHOLD
                }

            total_orders = result[0] or 0
            customer_name = result[1] or "고객"
            
            # 할인 등급 결정
            if total_orders >= cls.VIP_CUSTOMER_THRESHOLD:
                return {
                    "eligible": True,
                    "discount_rate": cls.VIP_DISCOUNT_RATE,
                    "customer_type": "VIP 단골",
                    "total_orders": total_orders,
                    "customer_name": customer_name,
                    "next_tier_orders": None,  # 최고 등급
                    "discount_message": f"🌟 VIP 단골 고객님, {int(cls.VIP_DISCOUNT_RATE * 100)}% 할인 적용!"
                }
            elif total_orders >= cls.REGULAR_CUSTOMER_THRESHOLD:
                vip_remaining = cls.VIP_CUSTOMER_THRESHOLD - total_orders
                
                # 8번 이상 구매한 단골 고객만 VIP 혜택 메시지 표시
                if total_orders >= 8:
                    discount_message = f"⭐ 단골 고객님, {int(cls.REGULAR_DISCOUNT_RATE * 100)}% 할인 적용! 💎 VIP까지 {vip_remaining}번 더!"
                else:
                    # 5-7번 구매한 단골 고객에게는 VIP 메시지 없이
                    discount_message = f"⭐ 단골 고객님, {int(cls.REGULAR_DISCOUNT_RATE * 100)}% 할인 적용!"
                
                return {
                    "eligible": True,
                    "discount_rate": cls.REGULAR_DISCOUNT_RATE,
                    "customer_type": "단골",
                    "total_orders": total_orders,
                    "customer_name": customer_name,
                    "next_tier_orders": vip_remaining,
                    "discount_message": discount_message
                }
            else:
                remaining_orders = cls.REGULAR_CUSTOMER_THRESHOLD - total_orders
                
                # 3번 이상 구매한 고객만 단골 혜택 메시지 표시
                if total_orders >= 3:
                    discount_message = f"💡 {remaining_orders}번 더 주문하시면 단골 할인 혜택을 받으실 수 있어요!"
                else:
                    # 신규 고객 (0-2번 구매)에게는 일반적인 환영 메시지
                    discount_message = f"🎉 맛있는 디너를 즐겨주셔서 감사합니다!"
                
                return {
                    "eligible": False,
                    "discount_rate": 0.0,
                    "customer_type": "신규고객",
                    "total_orders": total_orders,
                    "customer_name": customer_name,
                    "next_tier_orders": remaining_orders,
                    "discount_message": discount_message
                }
                
        except Exception as e:
            logger.error(f"할인 정보 조회 중 오류: {e}")
            return {
                "eligible": False,
                "discount_rate": 0.0,
                "customer_type": "신규고객",
                "total_orders": 0,
                "next_tier_orders": cls.REGULAR_CUSTOMER_THRESHOLD
            }
    
    @classmethod
    def apply_discount(cls, original_price: float, discount_rate: float) -> tuple[float, int]:
        """할인 적용 계산"""
        discount_amount = original_price * discount_rate
        discounted_price = original_price - discount_amount
        
        return round(discounted_price), int(discount_amount)
    
    @classmethod
    def calculate_order_pricing(cls, user_id: str, original_price: float, db: Session) -> dict[str, Any]:
        """주문의 최종 가격 계산 (할인 포함, UUID 기반)"""
        try:
            discount_info = cls.get_customer_discount_info(user_id, db)
            
            if discount_info["eligible"]:
                discounted_price, discount_amount = cls.apply_discount(
                    original_price, 
                    discount_info["discount_rate"]
                )
                
                return {
                    "original_price": int(original_price),
                    "discount_rate": discount_info["discount_rate"],
                    "discount_amount": discount_amount,
                    "final_price": discounted_price,
                    "customer_type": discount_info["customer_type"],
                    "discount_message": discount_info["discount_message"],
                    "savings": discount_amount
                }
            else:
                return {
                    "original_price": int(original_price),
                    "discount_rate": 0.0,
                    "discount_amount": 0,
                    "final_price": int(original_price),
                    "customer_type": discount_info["customer_type"],
                    "discount_message": discount_info["discount_message"],
                    "savings": 0
                }
                
        except Exception as e:
            logger.error(f"주문 가격 계산 중 오류: {e}")
            return {
                "original_price": int(original_price),
                "discount_rate": 0.0,
                "discount_amount": 0,
                "final_price": int(original_price),
                "customer_type": "신규고객",
                "discount_message": "할인 정보를 불러올 수 없습니다.",
                "savings": 0
            }

    @classmethod
    def increment_user_orders(cls, user_id: str, db: Session, total_price: float = 0) -> bool:
        """사용자 주문 횟수 및 총 지출 증가, VIP 레벨 자동 업데이트 (UUID 기반, customer_loyalty UPSERT)

        주의: db.commit()은 호출하지 않음 - 호출하는 쪽(order_service)에서 트랜잭션 관리
        """
        try:
            # customer_loyalty 레코드 UPSERT + VIP 레벨 자동 계산
            upsert_query = text("""
                INSERT INTO customer_loyalty (customer_id, order_count, total_spent, vip_level)
                VALUES (CAST(:user_id AS uuid), 1, :total_price,
                    CASE
                        WHEN 1 >= :vip_threshold THEN 'VIP'
                        WHEN 1 >= :regular_threshold THEN 'REGULAR'
                        ELSE 'NEW'
                    END)
                ON CONFLICT (customer_id)
                DO UPDATE SET
                    order_count = customer_loyalty.order_count + 1,
                    total_spent = customer_loyalty.total_spent + :total_price,
                    vip_level = CASE
                        WHEN customer_loyalty.order_count + 1 >= :vip_threshold THEN 'VIP'
                        WHEN customer_loyalty.order_count + 1 >= :regular_threshold THEN 'REGULAR'
                        ELSE 'NEW'
                    END
            """)

            result = db.execute(upsert_query, {
                "user_id": user_id,
                "total_price": total_price,
                "vip_threshold": cls.VIP_CUSTOMER_THRESHOLD,
                "regular_threshold": cls.REGULAR_CUSTOMER_THRESHOLD
            })
            # db.commit() 제거 - 상위 트랜잭션에서 관리

            return result.rowcount > 0

        except Exception as e:
            logger.error(f"주문 횟수 업데이트 중 오류: {e}")
            # db.rollback() 제거 - 상위 트랜잭션에서 관리
            raise  # 예외를 상위로 전파하여 전체 트랜잭션 롤백

