"""
주문 처리 서비스 - 주문 생성, 상태 관리, 주문 내역 조회
Order processing service - order creation, status management, order history
"""

import json
import logging
import traceback
from typing import Any
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.orm import Session

from .discount_service import DiscountService
from .menu_service import MenuService
from .websocket_manager import manager as ws_manager

# 로깅 설정
logger = logging.getLogger(__name__)


# 커스터마이징 단가 (원)
INGREDIENT_UNIT_PRICES: dict[str, Decimal] = {
    "premium_steak": Decimal("18000"),
    "wine": Decimal("15000"),
    "champagne_bottle": Decimal("55000"),
    "champagne": Decimal("45000"),
    "coffee_pot": Decimal("8000"),
    "coffee": Decimal("4000"),
    "fresh_salad": Decimal("6000"),
    "baguette": Decimal("3000"),
    "scrambled_eggs": Decimal("2000"),
    "bacon": Decimal("2000"),
    "bread": Decimal("1500"),
    "heart_plate": Decimal("1000"),
    "cupid_decoration": Decimal("1500"),
    "napkin": Decimal("500")
}


MENU_BASE_INGREDIENTS: dict[str, dict[str, dict[str, int]]] = {
    "valentine": {
        "simple": {"heart_plate": 1, "cupid_decoration": 1, "napkin": 1, "wine": 1, "premium_steak": 1},
        "grand": {"heart_plate": 1, "cupid_decoration": 2, "napkin": 1, "wine": 1, "premium_steak": 1},
        "deluxe": {"heart_plate": 1, "cupid_decoration": 3, "napkin": 2, "wine": 1, "premium_steak": 1}
    },
    "french": {
        "simple": {"coffee": 1, "wine": 1, "fresh_salad": 1, "premium_steak": 1},
        "grand": {"coffee": 1, "wine": 1, "fresh_salad": 1, "premium_steak": 1},
        "deluxe": {"coffee": 1, "wine": 1, "fresh_salad": 1, "premium_steak": 1}
    },
    "english": {
        "simple": {"scrambled_eggs": 1, "bacon": 2, "bread": 1, "premium_steak": 1},
        "grand": {"scrambled_eggs": 2, "bacon": 3, "bread": 1, "premium_steak": 1},
        "deluxe": {"scrambled_eggs": 2, "bacon": 4, "bread": 2, "premium_steak": 1}
    },
    "champagne": {
        "grand": {"champagne_bottle": 1, "baguette": 4, "coffee_pot": 1, "wine": 1, "premium_steak": 2},
        "deluxe": {"champagne_bottle": 1, "baguette": 4, "coffee_pot": 1, "wine": 1, "premium_steak": 2}
    }
}

class OrderService:
    """주문 관련 비즈니스 로직 처리"""

    _ingredient_pricing_cache: dict[str, Decimal] | None = None
    _ingredient_pricing_cache_timestamp: datetime | None = None

    @staticmethod
    def create_order(
        db: Session,
        order_data: dict[str, Any]
    ) -> dict[str, Any]:
        """주문 생성 (router 호환 인터페이스)"""
        # order_data에서 파라미터 추출
        dinner_code = order_data.get("dinner_code")
        style = order_data.get("style")
        
        # 스타일명 한글 → 영문 변환 (프론트엔드가 한글로 보낼 경우 대비)
        style = MenuService._get_style_english_name(style) if style else "simple"
        
        quantity = order_data.get("quantity", 1)
        customer_id = order_data.get("user_id")  # Frontend sends user_id, not customer_id
        delivery_address = order_data.get("delivery_address")
        order_type = order_data.get("order_type", "gui")
        special_requests = order_data.get("special_requests")
        scheduled_for = order_data.get("scheduled_for")
        
        # dinner_code를 dinner_id와 name으로 변환
        dinner_id, menu_name = OrderService._get_dinner_id_by_code(db, dinner_code)
        if not dinner_id:
            return {
                "success": False,
                "error": f"메뉴를 찾을 수 없습니다: {dinner_code}",
                "order": None
            }
        
        customizations = order_data.get("customizations")

        return OrderService._create_order_internal(
            db, dinner_id, dinner_code, style, quantity, customer_id,
            delivery_address, order_type, special_requests, menu_name, scheduled_for, customizations
        )
    
    @staticmethod
    def _get_dinner_id_by_code(db: Session, dinner_code: str) -> tuple[str | None, str | None]:
        """dinner_code로 menu_item_id와 name 조회 (UUID, name 반환)"""
        try:
            query = text("SELECT menu_item_id, name FROM menu_items WHERE code = :code")
            result = db.execute(query, {"code": dinner_code}).fetchone()
            if result:
                return str(result[0]), result[1]
            return None, None
        except Exception as e:
            logger.error(f"menu_item_id 조회 오류: {e}")
            return None, None

    @staticmethod
    def _get_serving_style_id(db: Session, style_name: str) -> str | None:
        """스타일명으로 serving_style_id 조회 (UUID 반환)"""
        try:
            # style_name을 소문자로 변환 (Simple -> simple, SIMPLE -> simple)
            formatted_name = style_name.lower()
            query = text("SELECT serving_style_id FROM serving_styles WHERE name = :name")
            result = db.execute(query, {"name": formatted_name}).fetchone()
            return str(result[0]) if result else None
        except Exception as e:
            logger.error(f"serving_style_id 조회 오류: {e}")
            return None

    @staticmethod
    def _get_store_id(db: Session) -> str | None:
        """첫 번째 매장의 store_id 조회 (UUID 반환)"""
        try:
            query = text("SELECT store_id FROM stores LIMIT 1")
            result = db.execute(query).fetchone()
            return str(result[0]) if result else None
        except Exception as e:
            logger.error(f"store_id 조회 오류: {e}")
            return None

    @staticmethod
    def _create_order_internal(
        db: Session,
        dinner_id: str,  # UUID 문자열
        dinner_code: str,
        style: str,
        quantity: int = 1,
        customer_id: str | None = None,  # UUID 문자열 (users.user_id)
        delivery_address: str | None = None,
        order_type: str = "gui",
        special_requests: str | None = None,
        menu_name: str | None = None,  # 메뉴 이름 (에러 메시지용)
        scheduled_for: str | None = None,
        customizations: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """주문 생성"""
        try:
            # 1. 주문번호 생성
            order_number = OrderService._generate_order_number(db)

            # 2. store_id 조회 (단일 매장 시스템)
            store_id = OrderService._get_store_id(db)
            if not store_id:
                return {
                    "success": False,
                    "error": "매장 정보를 찾을 수 없습니다.",
                    "order": None
                }

            # 3. serving_style_id 조회
            serving_style_id = OrderService._get_serving_style_id(db, style)
            if not serving_style_id:
                return {
                    "success": False,
                    "error": f"스타일 '{style}'을 찾을 수 없습니다.",
                    "order": None
                }

            # 4. 메뉴 정보 조회 (menu_items + serving_styles + menu_serving_style_availability 조인)
            # menu_serving_style_availability를 통해 허용된 메뉴-스타일 조합만 검증
            menu_query = text("""
                SELECT
                    mi.menu_item_id,
                    mi.code,
                    mi.name,
                    mi.base_price,
                    ss.price_modifier
                FROM menu_items mi
                INNER JOIN menu_serving_style_availability mssa
                    ON mi.menu_item_id = mssa.menu_item_id
                INNER JOIN serving_styles ss
                    ON mssa.serving_style_id = ss.serving_style_id
                WHERE mi.menu_item_id = CAST(:menu_item_id AS uuid)
                  AND ss.serving_style_id = CAST(:serving_style_id AS uuid)
            """)

            menu_result = db.execute(menu_query, {
                "menu_item_id": dinner_id,
                "serving_style_id": serving_style_id
            }).fetchone()

            if not menu_result:
                # 메뉴-스타일 조합이 menu_serving_style_availability에 없는 경우
                menu_display_name = menu_name if menu_name else "선택한 메뉴"
                return {
                    "success": False,
                    "error": f"'{menu_display_name}'는 '{style}' 스타일로 제공되지 않습니다. 다른 스타일을 선택해주세요.",
                    "order": None
                }

            menu_item_id, code, name, base_price, price_modifier = menu_result

            # 5. 가격 계산 (기본 + 커스터마이징)
            base_amount = base_price if isinstance(base_price, Decimal) else Decimal(str(base_price))
            modifier_amount = price_modifier if isinstance(price_modifier, Decimal) else Decimal(str(price_modifier))
            unit_price_decimal = base_amount + modifier_amount

            base_total_decimal = unit_price_decimal * quantity
            customization_cost_decimal = OrderService._calculate_customization_cost(db, code, style, quantity, customizations)
            total_price_before_discount_decimal = base_total_decimal + customization_cost_decimal
            total_price_before_discount = int(total_price_before_discount_decimal)
            unit_price = int(unit_price_decimal)

            # 할인 기능 활성화 (discount_service.py 업데이트 완료)
            if customer_id:
                pricing_info = DiscountService.calculate_order_pricing(customer_id, total_price_before_discount, db)
            else:
                pricing_info = {
                    "original_price": total_price_before_discount,
                    "discount_rate": 0.0,
                    "discount_amount": 0,
                    "final_price": total_price_before_discount,
                    "customer_type": "비회원",
                    "discount_message": "",
                    "savings": 0
                }

            pricing_info["base_price_total"] = int(base_total_decimal)
            pricing_info["customization_cost"] = int(customization_cost_decimal)

            # TODO: 재료 재고 차감 임시 비활성화 (store_inventory 테이블 연동 필요)
            # inventory_result = OrderService._consume_ingredients(db, dinner_id, style, quantity)
            # if not inventory_result["success"]:
            #     return {
            #         "success": False,
            #         "error": f"재고 부족으로 주문 생성 실패: {inventory_result['error']}",
            #         "order": None
            #     }

            # 6. 시간 계산 (조리시간 + 배달시간)
            current_time = datetime.now()
            scheduled_for_dt = None

            if scheduled_for:
                try:
                    scheduled_for_dt = datetime.fromisoformat(scheduled_for)
                except ValueError:
                    logger.warning(f"잘못된 예약 배송 시간: {scheduled_for}")

            # operation_config.json에서 실제 조리시간 가져오기
            config_file = Path(__file__).parent.parent / "data" / "operation_config.json"

            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    operation_config = json.load(f)

                # dinner_code로 조리시간 가져오기
                cooking_times = operation_config.get("cooking_times", {})
                dinner_cooking = cooking_times.get(code, {})  # code는 menu_result에서 가져옴
                cooking_time_minutes = dinner_cooking.get(style, 35)  # 기본값 35분

                # 배달시간 설정
                delivery_config = operation_config.get("delivery_config", {})
                delivery_time_minutes = delivery_config.get("base_time", 20)

            except Exception as e:
                logger.warning(f"operation_config.json 로드 실패, 기본값 사용: {e}")
                # 기본값 사용
                cooking_time_minutes = 35
                delivery_time_minutes = 20

            # 예상 배달시간 계산 (예약 배송시간 우선)
            estimated_delivery_time = current_time + timedelta(minutes=cooking_time_minutes + delivery_time_minutes)
            if scheduled_for_dt and scheduled_for_dt > current_time:
                estimated_delivery_time = scheduled_for_dt

            # 7. orders 테이블에 주문 생성 (order_type, notes 필드 없음)
            insert_order_query = text("""
                INSERT INTO orders
                (order_number, customer_id, store_id, order_status, payment_status,
                 total_price, delivery_address, delivery_time_estimated, created_at)
                VALUES
                (:order_number, CAST(:customer_id AS uuid), CAST(:store_id AS uuid), :order_status, :payment_status,
                 :total_price, :delivery_address, :delivery_time_estimated, :created_at)
                RETURNING order_id, created_at, delivery_time_estimated
            """)

            order_result = db.execute(insert_order_query, {
                "order_number": order_number,
                "customer_id": customer_id if customer_id else None,
                "store_id": store_id,
                "order_status": "RECEIVED",  # ENUM 값
                "payment_status": "PENDING",  # ENUM 값
                "total_price": pricing_info["final_price"],
                "delivery_address": delivery_address,
                "delivery_time_estimated": estimated_delivery_time,
                "created_at": current_time
            }).fetchone()

            order_id = str(order_result[0])  # UUID를 문자열로 변환

            # 8. order_items 테이블에 주문 항목 생성
            insert_item_query = text("""
                INSERT INTO order_items
                (order_id, menu_item_id, serving_style_id, quantity, price_per_item)
                VALUES
                (CAST(:order_id AS uuid), CAST(:menu_item_id AS uuid), CAST(:serving_style_id AS uuid), :quantity, :price_per_item)
            """)

            db.execute(insert_item_query, {
                "order_id": order_id,
                "menu_item_id": dinner_id,
                "serving_style_id": serving_style_id,
                "quantity": quantity,
                "price_per_item": unit_price
            })

            # 고객 주문 횟수 증가 및 총 지출 업데이트 (discount_service.py 업데이트 완료)
            if customer_id:
                DiscountService.increment_user_orders(customer_id, db, pricing_info["final_price"])

            # 모든 작업이 성공했을 때만 commit
            db.commit()

            # WebSocket 브로드캐스트 (직원에게 새 주문 알림)
            import asyncio
            try:
                asyncio.create_task(ws_manager.broadcast_to_staff({
                    "type": "ORDER_CREATED",
                    "data": {
                        "id": order_id,
                        "order_number": order_number,
                        "status": "RECEIVED",
                        "menu_name": name,
                        "style": style,
                        "quantity": quantity,
                        "total_price": pricing_info["final_price"],
                        "delivery_address": delivery_address,
                        "created_at": order_result[1].isoformat() if order_result[1] else None
                    },
                    "message": f"새로운 주문이 접수되었습니다: {order_number}",
                    "timestamp": datetime.now().isoformat()
                }))
                logger.info(f"WebSocket 브로드캐스트 전송: ORDER_CREATED - {order_number}")
            except Exception as ws_error:
                logger.warning(f"WebSocket 브로드캐스트 실패 (주문 생성은 성공): {ws_error}")

            # 9. 주문 완성 정보 반환
            return {
                "success": True,
                "order": {
                    "id": order_id,
                    "order_number": order_number,
                    "status": "RECEIVED",
                    "menu_name": name,
                    "style": style,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "pricing": pricing_info,
                    "delivery_address": delivery_address,
                    "special_requests": special_requests,  # order_type 대신 special_requests 유지
                    "scheduled_for": estimated_delivery_time.isoformat() if scheduled_for_dt else None,
                    "created_at": order_result[1].isoformat() if order_result[1] else None,
                    "estimated_delivery_time": order_result[2].isoformat() if order_result[2] else None,
                    "cooking_time_minutes": cooking_time_minutes,
                    "delivery_time_minutes": delivery_time_minutes,
                    "total_time_minutes": cooking_time_minutes + delivery_time_minutes
                },
                "message": "주문이 성공적으로 생성되었습니다."
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"주문 생성 중 오류: {e}")
            return {
                "success": False,
                "error": f"주문 생성 중 오류가 발생했습니다: {str(e)}",
                "order": None
            }

    @staticmethod
    def _calculate_customization_cost(
        db: Session,
        dinner_code: str,
        style: str,
        quantity: int,
        customizations: dict[str, Any] | None
    ) -> Decimal:
        if not customizations or quantity <= 0:
            return Decimal("0")

        base_ingredients = OrderService.get_base_ingredients(db, dinner_code, style)
        ingredient_prices = OrderService._get_ingredient_unit_prices(db)

        additional_cost = Decimal("0")

        for ingredient, qty in customizations.items():
            try:
                qty_int = int(qty)
            except (TypeError, ValueError):
                continue

            base_qty = base_ingredients.get(ingredient, 0)
            diff = qty_int - base_qty

            if diff > 0:
                unit_price = ingredient_prices.get(ingredient)
                if unit_price is None:
                    unit_price = Decimal("0")
                additional_cost += unit_price * diff

        return additional_cost * quantity

    @staticmethod
    def get_base_ingredients(db: Session, dinner_code: str, style: str) -> dict[str, int]:
        style_key = style.lower()
        query = text(
            """
            SELECT ingredient_code, base_quantity
            FROM menu_base_ingredients
            WHERE menu_code = :menu_code AND style = :style
            """
        )

        rows = db.execute(query, {"menu_code": dinner_code, "style": style_key}).fetchall()

        if not rows:
            return MENU_BASE_INGREDIENTS.get(dinner_code, {}).get(style_key, {})

        return {row[0]: int(row[1]) for row in rows}

    @classmethod
    def _get_ingredient_unit_prices(cls, db: Session) -> dict[str, Decimal]:
        query = text(
            """
            SELECT ingredient_code, unit_price
            FROM ingredient_pricing
            """
        )

        rows = db.execute(query).fetchall()

        if not rows:
            return {key: Decimal(value) for key, value in INGREDIENT_UNIT_PRICES.items()}

        prices: dict[str, Decimal] = {}
        for code, price in rows:
            if price is None:
                continue
            prices[code] = price if isinstance(price, Decimal) else Decimal(str(price))

        return prices
    
    @staticmethod
    def _generate_order_number(db: Session) -> str:
        """주문번호 생성 (ORD-YYYY-XXX 형식)"""
        try:
            current_year = datetime.now().year

            count_query = text("""
                SELECT COUNT(*) FROM orders
                WHERE order_number LIKE :pattern
            """)

            pattern = f"ORD-{current_year}-%"
            result = db.execute(count_query, {"pattern": pattern}).fetchone()

            next_number = (result[0] if result else 0) + 1
            return f"ORD-{current_year}-{next_number:03d}"

        except Exception as e:
            logger.error(f"주문번호 생성 중 오류: {e}")
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            return f"ORD-{timestamp}"

    @staticmethod
    def get_user_orders(db: Session, user_id: str) -> dict[str, Any]:
        """특정 사용자의 주문 내역 조회 (UUID 기반, 커스터마이징 포함)"""
        try:
            # orders + order_items + menu_items + serving_styles 조인
            query = text("""
                SELECT
                    o.order_id,
                    o.order_number,
                    o.order_status,
                    o.total_price,
                    o.delivery_address,
                    o.created_at,
                    o.delivery_time_estimated,
                    mi.name AS menu_name,
                    mi.code AS menu_code,
                    ss.name AS style_name,
                    oi.quantity,
                    oi.price_per_item,
                    oi.order_item_id
                FROM orders o
                LEFT JOIN order_items oi ON o.order_id = oi.order_id
                LEFT JOIN menu_items mi ON oi.menu_item_id = mi.menu_item_id
                LEFT JOIN serving_styles ss ON oi.serving_style_id = ss.serving_style_id
                WHERE o.customer_id = CAST(:user_id AS uuid)
                ORDER BY o.created_at DESC
            """)

            results = db.execute(query, {"user_id": user_id}).fetchall()

            if not results:
                return {
                    "success": True,
                    "orders": [],
                    "message": "주문 내역이 없습니다."
                }

            # 주문 데이터 변환
            orders = []
            for result in results:
                order_id, order_number, order_status, total_price, delivery_address, created_at, delivery_time_estimated, menu_name, menu_code, style_name, quantity, price_per_item, order_item_id = result

                # 커스터마이징 정보 조회
                customizations = {}
                if order_item_id:
                    customization_query = text("""
                        SELECT item_name, quantity_change
                        FROM order_item_customizations
                        WHERE order_item_id = CAST(:order_item_id AS uuid)
                    """)
                    customization_results = db.execute(customization_query, {"order_item_id": str(order_item_id)}).fetchall()

                    for item_name, quantity_change in customization_results:
                        customizations[item_name] = quantity_change

                orders.append({
                    "id": str(order_id),  # UUID를 문자열로 변환
                    "order_number": order_number,
                    "status": order_status,  # ENUM 값 그대로 사용
                    "menu_name": menu_name or "알 수 없는 메뉴",
                    "menu_code": menu_code or "",
                    "style": style_name.lower() if style_name else "",  # Simple -> simple
                    "quantity": quantity or 1,
                    "unit_price": float(price_per_item) if price_per_item else 0,
                    "total_price": float(total_price),
                    "delivery_address": delivery_address,
                    "order_date": created_at.strftime("%Y-%m-%d %H:%M") if created_at else "",
                    "estimated_delivery_time": delivery_time_estimated.strftime("%Y-%m-%d %H:%M") if delivery_time_estimated else "",
                    "estimated_time_minutes": OrderService._calculate_estimated_time(order_status),
                    "customizations": customizations if customizations else None
                })

            logger.info(f"사용자 주문 조회 성공: user_id={user_id}, 주문 수={len(orders)}")
            if orders:
                logger.info(f"첫 번째 주문 정보: {orders[0]}")

            return {
                "success": True,
                "orders": orders,
                "total_count": len(orders)
            }

        except Exception as e:
            logger.error(f"사용자 주문 내역 조회 중 오류: {e}")
            logger.error(f"스택 트레이스: {traceback.format_exc()}")
            return {
                "success": False,
                "error": f"주문 내역 조회 중 오류가 발생했습니다: {str(e)}",
                "orders": []
            }
    
    @staticmethod
    def _calculate_estimated_time(status: str) -> int:
        """주문 상태에 따른 예상 시간 계산 (ENUM 기반)"""
        status_time_map = {
            "RECEIVED": 55,     # 주문접수 (조리 + 배달 전체)
            "PREPARING": 40,    # 조리중 (조리 남은 시간 + 배달)
            "DELIVERING": 20,   # 배달중 (배달만)
            "COMPLETED": 0,     # 배달완료
            "CANCELLED": 0,     # 취소
            # 하위 호환성 (소문자)
            "pending": 55,
            "cooking": 40,
            "delivering": 20,
            "completed": 0,
            "cancelled": 0
        }
        return status_time_map.get(status, 0)