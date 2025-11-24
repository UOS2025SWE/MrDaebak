"""
주문 처리 서비스 - 주문 생성, 상태 관리, 주문 내역 조회
Order processing service - order creation, status management, order history
"""

import json
import logging
import traceback
from typing import Any
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.orm import Session

from .discount_service import DiscountService
from .event_service import event_service
from .menu_service import MenuService
from .side_dish_service import side_dish_service
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
    "napkin": Decimal("500"),
    "plastic_plate": Decimal("500"),
    "plastic_cup": Decimal("300"),
    "paper_napkin": Decimal("100"),
    "plastic_tray": Decimal("800"),
    "ceramic_plate": Decimal("5000"),
    "ceramic_cup": Decimal("3000"),
    "cotton_napkin": Decimal("800"),
    "wooden_tray": Decimal("4000"),
    "plastic_wine_glass": Decimal("700"),
    "glass_wine_glass": Decimal("3500"),
    "linen_napkin": Decimal("1200"),
    "vase_with_flowers": Decimal("8000"),
    "cake_base": Decimal("12000"),
    "buttercream_frosting": Decimal("5000"),
    "fresh_berries": Decimal("4500"),
    "fondant": Decimal("6000"),
    "edible_gold_leaf": Decimal("9000"),
    "chocolate_ganache": Decimal("5500"),
    "cake_board": Decimal("1500"),
    "edible_flowers": Decimal("5000")
}


MENU_BASE_INGREDIENTS: dict[str, dict[str, dict[str, int]]] = {
    "valentine": {
        "simple": {
            "heart_plate": 1,
            "cupid_decoration": 1,
            "paper_napkin": 1,
            "plastic_tray": 1,
            "plastic_wine_glass": 1,
            "wine": 1,
            "premium_steak": 1
        },
        "grand": {
            "heart_plate": 1,
            "cupid_decoration": 2,
            "cotton_napkin": 1,
            "wooden_tray": 1,
            "plastic_wine_glass": 1,
            "wine": 1,
            "premium_steak": 1
        },
        "deluxe": {
            "heart_plate": 1,
            "cupid_decoration": 3,
            "linen_napkin": 2,
            "wooden_tray": 1,
            "vase_with_flowers": 1,
            "glass_wine_glass": 1,
            "wine": 1,
            "premium_steak": 1
        }
    },
    "french": {
        "simple": {
            "plastic_plate": 1,
            "plastic_cup": 1,
            "paper_napkin": 1,
            "plastic_tray": 1,
            "plastic_wine_glass": 1,
            "coffee": 1,
            "wine": 1,
            "fresh_salad": 1,
            "premium_steak": 1
        },
        "grand": {
            "ceramic_plate": 1,
            "ceramic_cup": 1,
            "cotton_napkin": 1,
            "wooden_tray": 1,
            "plastic_wine_glass": 1,
            "coffee": 1,
            "wine": 1,
            "fresh_salad": 1,
            "premium_steak": 1
        },
        "deluxe": {
            "ceramic_plate": 1,
            "ceramic_cup": 1,
            "linen_napkin": 1,
            "wooden_tray": 1,
            "vase_with_flowers": 1,
            "glass_wine_glass": 1,
            "coffee": 1,
            "wine": 1,
            "fresh_salad": 1,
            "premium_steak": 1
        }
    },
    "english": {
        "simple": {
            "plastic_plate": 1,
            "plastic_cup": 1,
            "paper_napkin": 1,
            "plastic_tray": 1,
            "scrambled_eggs": 1,
            "bacon": 2,
            "bread": 1,
            "premium_steak": 1
        },
        "grand": {
            "ceramic_plate": 1,
            "ceramic_cup": 1,
            "cotton_napkin": 1,
            "wooden_tray": 1,
            "scrambled_eggs": 2,
            "bacon": 3,
            "bread": 1,
            "premium_steak": 1
        },
        "deluxe": {
            "ceramic_plate": 1,
            "ceramic_cup": 1,
            "linen_napkin": 1,
            "wooden_tray": 1,
            "vase_with_flowers": 1,
            "scrambled_eggs": 2,
            "bacon": 4,
            "bread": 2,
            "premium_steak": 1
        }
    },
    "champagne": {
        "grand": {
            "ceramic_plate": 2,
            "ceramic_cup": 2,
            "cotton_napkin": 2,
            "wooden_tray": 1,
            "plastic_wine_glass": 2,
            "champagne_bottle": 1,
            "baguette": 4,
            "coffee_pot": 1,
            "wine": 1,
            "premium_steak": 2
        },
        "deluxe": {
            "ceramic_plate": 2,
            "ceramic_cup": 2,
            "linen_napkin": 2,
            "wooden_tray": 1,
            "vase_with_flowers": 1,
            "glass_wine_glass": 2,
            "champagne_bottle": 1,
            "baguette": 4,
            "coffee_pot": 1,
            "wine": 1,
            "premium_steak": 2
        }
    },
    "cake": {
        "simple": {
            "cake_base": 1,
            "buttercream_frosting": 1,
            "fresh_berries": 1,
            "cake_board": 1,
            "plastic_plate": 1,
            "plastic_tray": 1,
            "paper_napkin": 1
        },
        "grand": {
            "cake_base": 1,
            "buttercream_frosting": 1,
            "fondant": 1,
            "fresh_berries": 1,
            "cake_board": 1,
            "ceramic_plate": 1,
            "ceramic_cup": 1,
            "cotton_napkin": 1,
            "wooden_tray": 1
        },
        "deluxe": {
            "cake_base": 1,
            "buttercream_frosting": 1,
            "fondant": 1,
            "edible_gold_leaf": 1,
            "chocolate_ganache": 1,
            "edible_flowers": 1,
            "cake_board": 1,
            "ceramic_plate": 1,
            "ceramic_cup": 1,
            "linen_napkin": 1,
            "wooden_tray": 1,
            "vase_with_flowers": 1
        }
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
        side_dishes = order_data.get("side_dishes")
        cake_customization = order_data.get("cake_customization")

        return OrderService._create_order_internal(
            db, dinner_id, dinner_code, style, quantity, customer_id,
            delivery_address, order_type, special_requests, menu_name, scheduled_for, customizations,
            side_dishes=side_dishes,
            cake_customization=cake_customization
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
        customizations: dict[str, Any] | None = None,
        side_dishes: list[dict[str, Any]] | None = None,
        cake_customization: dict[str, Any] | None = None
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

            side_dish_summary = OrderService._prepare_side_dishes(
                db, side_dishes, cake_customization
            )
            if not side_dish_summary.get("success", False):
                return {
                    "success": False,
                    "error": side_dish_summary.get("error", "사이드 디시 구성이 올바르지 않습니다."),
                    "order": None
                }

            side_dish_total_decimal = side_dish_summary["total_price"]
            total_price_before_discount_decimal = base_total_decimal + customization_cost_decimal + side_dish_total_decimal
            unit_price = int(unit_price_decimal)

            event_discounts = event_service.get_active_menu_discounts(db, str(menu_item_id), target_type="MENU")
            menu_event_discounts = [discount for discount in event_discounts if (discount.get("target_type") or "MENU") == "MENU"]
            side_event_discount_cache: dict[str, list[dict[str, Any]]] = {}
            if side_dish_summary.get("items"):
                unique_side_ids: set[str] = set()
                for item in side_dish_summary["items"]:
                    side_id_value = str(item.get("side_dish_id") or "").strip()
                    if side_id_value:
                        unique_side_ids.add(side_id_value)
                for side_id in unique_side_ids:
                    side_event_discount_cache[side_id] = event_service.get_active_menu_discounts(
                        db,
                        side_id,
                        target_type="SIDE_DISH",
                    )

            menu_discount_total_decimal = Decimal("0")
            side_dish_discount_total_decimal = Decimal("0")
            event_discount_details: list[dict[str, Any]] = []

            if base_total_decimal > Decimal("0"):
                for discount in menu_event_discounts:
                    try:
                        discount_value = Decimal(str(discount.get("discount_value", 0)))
                    except (InvalidOperation, TypeError):
                        continue

                    discount_type = str(discount.get("discount_type", "PERCENT")).upper()
                    if discount_type not in {"PERCENT", "FIXED"}:
                        continue

                    if discount_type == "PERCENT":
                        calculated = (base_total_decimal * discount_value) / Decimal("100")
                    else:
                        calculated = discount_value * Decimal(quantity)

                    if calculated <= Decimal("0"):
                        continue

                    remaining_cap = max(Decimal("0"), base_total_decimal - menu_discount_total_decimal)
                    applied_amount = min(calculated, remaining_cap)
                    if applied_amount <= Decimal("0"):
                        continue

                    applied_amount = applied_amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                    menu_discount_total_decimal += applied_amount

                    event_discount_details.append(
                        {
                            "event_id": discount.get("event_id"),
                            "title": discount.get("title"),
                            "discount_label": discount.get("discount_label"),
                            "discount_type": discount_type,
                            "discount_value": float(discount_value),
                            "applied_amount": int(applied_amount),
                            "target_type": "MENU",
                            "target_id": discount.get("menu_item_id"),
                            "target_name": discount.get("menu_name"),
                        }
                    )

            if side_dish_summary.get("items"):
                side_item_tracker: dict[str, dict[str, Decimal]] = {}
                for item in side_dish_summary["items"]:
                    side_id = str(item.get("side_dish_id") or "").strip()
                    if not side_id:
                        continue
                    try:
                        total_price = Decimal(str(item.get("total_price", 0)))
                        quantity_decimal = Decimal(str(item.get("quantity", 0)))
                    except (InvalidOperation, TypeError):
                        continue
                    if total_price <= Decimal("0") or quantity_decimal <= Decimal("0"):
                        continue
                    side_item_tracker[side_id] = {
                        "remaining": total_price,
                        "quantity": quantity_decimal,
                    }

                for side_dish_id, tracker in side_item_tracker.items():
                    side_discounts = side_event_discount_cache.get(side_dish_id, [])
                    if not side_discounts:
                        continue

                    for discount in side_discounts:
                        remaining_total = tracker["remaining"]
                        if remaining_total <= Decimal("0"):
                            break

                        try:
                            discount_value = Decimal(str(discount.get("discount_value", 0)))
                        except (InvalidOperation, TypeError):
                            continue

                        discount_type = str(discount.get("discount_type", "PERCENT")).upper()
                        if discount_type not in {"PERCENT", "FIXED"}:
                            continue

                        if discount_type == "PERCENT":
                            calculated = (remaining_total * discount_value) / Decimal("100")
                        else:
                            calculated = discount_value * tracker["quantity"]

                        if calculated <= Decimal("0"):
                            continue

                        applied_amount = min(calculated, remaining_total)
                        if applied_amount <= Decimal("0"):
                            continue

                        applied_amount = applied_amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                        tracker["remaining"] = max(Decimal("0"), tracker["remaining"] - applied_amount)
                        side_dish_discount_total_decimal += applied_amount

                        event_discount_details.append(
                            {
                                "event_id": discount.get("event_id"),
                                "title": discount.get("title"),
                                "discount_label": discount.get("discount_label"),
                                "discount_type": discount_type,
                                "discount_value": float(discount_value),
                                "applied_amount": int(applied_amount),
                                "target_type": "SIDE_DISH",
                                "target_id": side_dish_id,
                                "target_name": discount.get("side_dish_name"),
                            }
                        )

            event_discount_total_decimal = menu_discount_total_decimal + side_dish_discount_total_decimal
            if event_discount_total_decimal > total_price_before_discount_decimal:
                event_discount_total_decimal = total_price_before_discount_decimal
            price_after_event_decimal = total_price_before_discount_decimal - event_discount_total_decimal
            if price_after_event_decimal < Decimal("0"):
                price_after_event_decimal = Decimal("0")

            price_after_event_int = int(price_after_event_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            total_price_before_discount_int = int(total_price_before_discount_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            event_discount_total_int = int(event_discount_total_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            event_menu_discount_total_int = int(menu_discount_total_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            event_side_dish_discount_total_int = int(side_dish_discount_total_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP))

            if customer_id:
                loyalty_pricing = DiscountService.calculate_order_pricing(
                    customer_id,
                    float(total_price_before_discount_decimal),
                    db,
                )
            else:
                loyalty_pricing = {
                    "original_price": total_price_before_discount_int,
                    "discount_rate": 0.0,
                    "discount_amount": 0,
                    "final_price": total_price_before_discount_int,
                    "customer_type": "비회원",
                    "discount_message": "",
                    "savings": 0,
                }

            loyalty_discount_amount_decimal = Decimal(str(loyalty_pricing.get("discount_amount", 0)))
            if loyalty_discount_amount_decimal < Decimal("0"):
                loyalty_discount_amount_decimal = Decimal("0")
            loyalty_discount_amount_decimal = loyalty_discount_amount_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            loyalty_discount_amount = int(loyalty_discount_amount_decimal)

            price_after_loyalty_decimal = total_price_before_discount_decimal - loyalty_discount_amount_decimal
            if price_after_loyalty_decimal < Decimal("0"):
                price_after_loyalty_decimal = Decimal("0")
            price_after_loyalty_int = int(price_after_loyalty_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP))

            final_price_decimal = price_after_loyalty_decimal - event_discount_total_decimal
            if final_price_decimal < Decimal("0"):
                final_price_decimal = Decimal("0")
            final_price_decimal = final_price_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            final_price = int(final_price_decimal)

            loyalty_savings = int(loyalty_pricing.get("savings", loyalty_discount_amount))

            total_savings_decimal = loyalty_discount_amount_decimal + event_discount_total_decimal
            total_savings_decimal = total_savings_decimal.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            total_savings_int = int(total_savings_decimal)

            pricing_info = {
                "original_price": total_price_before_discount_int,
                "base_price_total": int(base_total_decimal),
                "customization_cost": int(customization_cost_decimal),
                "side_dish_total": int(side_dish_total_decimal),
                "event_discount_total": event_discount_total_int,
                "event_discounts": event_discount_details,
                "event_menu_discount_total": event_menu_discount_total_int,
                "event_side_dish_discount_total": event_side_dish_discount_total_int,
                "price_after_event": price_after_event_int,
                "price_after_loyalty": price_after_loyalty_int,
                "discount_rate": loyalty_pricing.get("discount_rate", 0.0),
                "discount_amount": loyalty_discount_amount,
                "final_price": final_price,
                "customer_type": loyalty_pricing.get("customer_type", "비회원"),
                "discount_message": loyalty_pricing.get("discount_message", ""),
                "loyalty_discount_amount": loyalty_discount_amount,
                "loyalty_discount_rate": loyalty_pricing.get("discount_rate", 0.0),
                "loyalty_savings": loyalty_savings,
                "event_savings": event_discount_total_int,
                "savings": total_savings_int,
                "total_savings": total_savings_int,
            }

            # 재고 확인 및 차감
            inventory_result = OrderService._check_and_consume_ingredients(
                db,
                store_id,
                code,
                style,
                quantity,
                customizations,
                extra_ingredients=side_dish_summary["ingredients"],
                consume=False
            )
            if not inventory_result["success"]:
                return {
                    "success": False,
                    "error": f"재고 부족으로 주문 생성 실패: {inventory_result['error']}",
                    "order": None
                }

            # 6. 시간 계산 (조리시간 + 배달시간)
            current_time = datetime.now()
            scheduled_for_dt = None

            if scheduled_for:
                try:
                    scheduled_for_dt = datetime.fromisoformat(scheduled_for)
                    
                    # 현재 날짜/시간 기준으로 검증 (과거 날짜는 허용하지 않음)
                    if scheduled_for_dt < current_time:
                        logger.warning(f"과거 날짜로 주문 시도: scheduled_for={scheduled_for}, current_time={current_time.isoformat()}")
                        return {
                            "success": False,
                            "error": f"과거 날짜는 선택할 수 없습니다. 현재 날짜/시간: {current_time.strftime('%Y-%m-%d %H:%M')}, 선택한 날짜/시간: {scheduled_for_dt.strftime('%Y-%m-%d %H:%M')}",
                            "order": None
                        }
                except ValueError:
                    logger.warning(f"잘못된 예약 배송 시간: {scheduled_for}")
                    return {
                        "success": False,
                        "error": "잘못된 배송 일정 형식입니다. 날짜는 YYYY-MM-DD, 시간은 HH:MM 형식이어야 합니다.",
                        "order": None
                    }

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

            # customer_id 검증 (users 테이블에 존재하는지 확인)
            validated_customer_id = None
            if customer_id:
                user_check_query = text("""
                    SELECT user_id FROM users WHERE user_id = CAST(:customer_id AS uuid)
                """)
                user_check_result = db.execute(user_check_query, {"customer_id": customer_id}).fetchone()
                if user_check_result:
                    validated_customer_id = customer_id
                else:
                    logger.warning(f"customer_id가 users 테이블에 존재하지 않음: {customer_id}, 비회원으로 처리")
                    validated_customer_id = None

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
                "customer_id": validated_customer_id,
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
                RETURNING order_item_id::text
            """)

            order_item_result = db.execute(insert_item_query, {
                "order_id": order_id,
                "menu_item_id": dinner_id,
                "serving_style_id": serving_style_id,
                "quantity": quantity,
                "price_per_item": unit_price
            }).fetchone()

            order_item_id = order_item_result[0]

            if side_dish_summary["items"]:
                insert_side_query = text("""
                    INSERT INTO order_side_dishes
                    (order_id, side_dish_id, quantity, price_per_unit, total_price)
                    VALUES (
                        CAST(:order_id AS uuid),
                        CAST(:side_dish_id AS uuid),
                        :quantity,
                        :price_per_unit,
                        :total_price
                    )
                """)

                for side_item in side_dish_summary["items"]:
                    price_per_unit_decimal = Decimal(str(side_item["price_per_unit"]))
                    total_price_decimal = Decimal(str(side_item["total_price"]))
                    db.execute(insert_side_query, {
                        "order_id": order_id,
                        "side_dish_id": side_item["side_dish_id"],
                        "quantity": side_item["quantity"],
                        "price_per_unit": price_per_unit_decimal,
                        "total_price": total_price_decimal
                    })

            if cake_customization:
                OrderService._store_cake_customization(
                    db,
                    order_item_id=order_item_id,
                    customer_id=validated_customer_id,
                    customization=cake_customization
                )

            OrderService._store_inventory_reservations(
                db,
                order_id=order_id,
                consumption_map=inventory_result.get("consumed", {})
            )

            # 주의: 고객 주문 횟수는 조리 시작 시점(PREPARING 상태 변경)에 업데이트됩니다.
            # order_service.py의 update_order_status에서 처리합니다.

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
                    "total_time_minutes": cooking_time_minutes + delivery_time_minutes,
                    "side_dishes": side_dish_summary["items"],
                    "cake_customization": cake_customization if cake_customization else None
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
        safe_quantity = max(1, quantity)
        quantity_decimal = Decimal(str(safe_quantity))

        additional_cost = Decimal("0")

        for ingredient, qty in customizations.items():
            try:
                qty_decimal = Decimal(str(qty))
            except (InvalidOperation, ValueError, TypeError):
                continue

            base_qty = base_ingredients.get(ingredient, 0)
            base_total = Decimal(str(base_qty)) * quantity_decimal
            diff = qty_decimal - base_total

            if diff > 0:
                unit_price = ingredient_prices.get(ingredient, Decimal("0"))
                additional_cost += unit_price * diff

        return additional_cost

    @staticmethod
    def _prepare_side_dishes(
        db: Session,
        side_dishes_payload: list[dict[str, Any]] | None,
        custom_cake_customization: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if not side_dishes_payload:
            return {
                "success": True,
                "total_price": Decimal("0"),
                "ingredients": {},
                "items": []
            }

        aggregated_ingredients: dict[str, Decimal] = {}
        prepared_items: list[dict[str, Any]] = []
        total_price = Decimal("0")

        for payload in side_dishes_payload:
            if not isinstance(payload, dict):
                return {"success": False, "error": "잘못된 사이드 디시 데이터 형식"}

            code = (payload.get("code") or payload.get("side_dish_code") or "").strip().lower()
            if not code:
                return {"success": False, "error": "사이드 디시 코드가 필요합니다"}

            try:
                quantity = int(payload.get("quantity", 1))
            except (TypeError, ValueError):
                return {"success": False, "error": f"잘못된 사이드 디시 수량: {code}"}

            if quantity <= 0:
                return {"success": False, "error": f"사이드 디시 수량은 1 이상이어야 합니다: {code}"}

            side_dish = side_dish_service.get_side_dish_by_code(db, code)
            if not side_dish:
                return {"success": False, "error": f"사이드 디시를 찾을 수 없습니다: {code}"}
            if not side_dish.get("is_available"):
                return {"success": False, "error": f"사이드 디시가 현재 비활성화되었습니다: {code}"}

            price_per_unit = side_dish.get("base_price", Decimal("0"))
            if not isinstance(price_per_unit, Decimal):
                price_per_unit = Decimal(str(price_per_unit))

            line_total = price_per_unit * quantity
            total_price += line_total

            ingredient_list = side_dish.get("ingredients", [])
            flavor_code = (payload.get("flavor") or "").strip()
            size_code = (payload.get("size") or "").strip()
            if code == side_dish_service.CUSTOM_CAKE_CODE:
                if not flavor_code and custom_cake_customization:
                    flavor_code = (custom_cake_customization.get("flavor") or "").strip()
                if not size_code and custom_cake_customization:
                    size_code = (custom_cake_customization.get("size") or "").strip()

                variant_ingredients = side_dish_service.get_custom_cake_recipe_variant(
                    db, flavor_code, size_code
                )
                if variant_ingredients:
                    ingredient_list = [
                        {
                            "ingredient_code": item["ingredient_code"],
                            "quantity": item["quantity"],
                        }
                        for item in variant_ingredients
                    ]

            normalized_ingredients: list[dict[str, Any]] = []
            for ingredient in ingredient_list:
                ingredient_code = ingredient.get("ingredient_code")
                ingredient_qty = ingredient.get("quantity", 0)
                if not ingredient_code:
                    continue
                ingredient_qty_decimal = Decimal(str(ingredient_qty)) * quantity
                aggregated_ingredients[ingredient_code] = aggregated_ingredients.get(ingredient_code, Decimal("0")) + ingredient_qty_decimal
                normalized_ingredients.append({
                    "ingredient_code": ingredient_code,
                    "quantity": float(ingredient_qty_decimal)
                })

            item_payload: dict[str, Any] = {
                "side_dish_id": side_dish["side_dish_id"],
                "code": code,
                "name": side_dish.get("name"),
                "quantity": quantity,
                "price_per_unit": float(price_per_unit),
                "total_price": float(line_total),
                "ingredients": normalized_ingredients
            }
            if code == side_dish_service.CUSTOM_CAKE_CODE:
                item_payload["metadata"] = {
                    "flavor": flavor_code or None,
                    "size": size_code or None,
                }

            prepared_items.append(item_payload)

        return {
            "success": True,
            "total_price": total_price,
            "ingredients": aggregated_ingredients,
            "items": prepared_items
        }

    @staticmethod
    def _check_and_consume_ingredients(
        db: Session,
        store_id: str,
        dinner_code: str,
        style: str,
        quantity: int,
        customizations: dict[str, Any] | None = None,
        extra_ingredients: dict[str, Decimal] | None = None,
        consume: bool = True
    ) -> dict[str, Any]:
        """재고 확인 및 차감"""
        try:
            safe_quantity = max(1, quantity)
            quantity_decimal = Decimal(str(safe_quantity))
            custom_map = customizations or {}
            handled_custom_keys: set[str] = set()
            # 기본 재료 조회
            base_ingredients = OrderService.get_base_ingredients(db, dinner_code, style)
            
            # 커스터마이징으로 인한 재료 변경 계산
            needed_ingredients: dict[str, Decimal] = {}
            
            for ingredient_code, base_qty in base_ingredients.items():
                needed_qty = Decimal(str(base_qty)) * quantity_decimal
                
                if ingredient_code in custom_map:
                    handled_custom_keys.add(ingredient_code)
                    try:
                        desired_total = Decimal(str(custom_map[ingredient_code]))
                    except (InvalidOperation, ValueError, TypeError):
                        desired_total = needed_qty
                    if desired_total < 0:
                        desired_total = Decimal("0")
                    needed_qty = desired_total
                
                if needed_qty > 0:
                    needed_ingredients[ingredient_code] = needed_qty

            for ingredient_code, value in custom_map.items():
                if ingredient_code in handled_custom_keys:
                    continue
                try:
                    desired_total = Decimal(str(value))
                except (InvalidOperation, ValueError, TypeError):
                    continue
                if desired_total <= 0:
                    continue
                needed_ingredients[ingredient_code] = desired_total

            if extra_ingredients:
                for ingredient_code, additional_qty in extra_ingredients.items():
                    additional_decimal = Decimal(str(additional_qty))
                    if additional_decimal <= 0:
                        continue
                    if ingredient_code in needed_ingredients:
                        needed_ingredients[ingredient_code] += additional_decimal
                    else:
                        needed_ingredients[ingredient_code] = additional_decimal
            
            if not needed_ingredients:
                return {"success": True, "consumed": {}}
            
            # 재고 확인
            insufficient = []
            ingredient_cache: dict[str, str] = {}
            stock_cache: dict[str, float] = {}
            
            for ingredient_code, needed_qty in needed_ingredients.items():
                ingredient_id_query = text("""
                    SELECT ingredient_id
                    FROM ingredients
                    WHERE name = :name
                """)
                ingredient_result = db.execute(ingredient_id_query, {"name": ingredient_code}).fetchone()
                
                if not ingredient_result:
                    insufficient.append(f"{ingredient_code} (재료 정보 없음)")
                    continue
                
                ingredient_id = ingredient_result[0]
                ingredient_cache[ingredient_code] = ingredient_id
                
                stock_query = text("""
                    SELECT quantity_on_hand
                    FROM store_inventory
                    WHERE store_id = CAST(:store_id AS uuid)
                      AND ingredient_id = CAST(:ingredient_id AS uuid)
                """)
                stock_result = db.execute(stock_query, {
                    "store_id": store_id,
                    "ingredient_id": ingredient_id
                }).fetchone()
                
                current_stock = Decimal(str(stock_result[0])) if stock_result and stock_result[0] is not None else Decimal("0")
                stock_cache[ingredient_code] = float(current_stock)
                
                if current_stock < needed_qty:
                    insufficient.append(f"{ingredient_code} (필요: {float(needed_qty)}, 현재: {float(current_stock)})")
            
            if insufficient:
                return {
                    "success": False,
                    "error": f"재고 부족: {', '.join(insufficient)}",
                    "insufficient": insufficient
                }
            
            # consumed dict should return floats for readability
            consumed_map = {code: float(quantity) for code, quantity in needed_ingredients.items()}

            if consume:
                for ingredient_code, needed_qty in needed_ingredients.items():
                    ingredient_id = ingredient_cache.get(ingredient_code)
                    if not ingredient_id:
                        continue
                    
                    update_query = text("""
                        INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
                        VALUES (CAST(:store_id AS uuid), CAST(:ingredient_id AS uuid), -:quantity)
                        ON CONFLICT (store_id, ingredient_id)
                        DO UPDATE SET quantity_on_hand = store_inventory.quantity_on_hand - :quantity
                    """)
                    db.execute(update_query, {
                        "store_id": store_id,
                        "ingredient_id": ingredient_id,
                        "quantity": needed_qty
                    })
             
            return {
                "success": True,
                "consumed": consumed_map
            }
            
        except Exception as e:
            logger.error(f"재고 확인/차감 중 오류: {e}")
            return {
                "success": False,
                "error": f"재고 처리 중 오류가 발생했습니다: {str(e)}"
            }

    @staticmethod
    def _store_inventory_reservations(
        db: Session,
        order_id: str,
        consumption_map: dict[str, Any]
    ) -> None:
        """주문별 재고 소모 예정량을 저장"""
        if not consumption_map:
            return

        insert_query = text(
            """
            INSERT INTO order_inventory_reservations (order_id, ingredient_code, quantity, consumed, created_at)
            VALUES (CAST(:order_id AS uuid), :ingredient_code, :quantity, FALSE, NOW())
            ON CONFLICT (order_id, ingredient_code)
            DO UPDATE SET
                quantity = EXCLUDED.quantity,
                consumed = FALSE,
                consumed_at = NULL,
                created_at = NOW()
            """
        )

        for ingredient_code, quantity in consumption_map.items():
            try:
                quantity_decimal = Decimal(str(quantity))
            except (InvalidOperation, ValueError):
                continue

            if quantity_decimal <= 0:
                continue

            db.execute(insert_query, {
                "order_id": order_id,
                "ingredient_code": ingredient_code,
                "quantity": quantity_decimal
            })

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

                # 재료 커스터마이징 정보 조회
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
                    "customizations": customizations if customizations else None,
                    "cake_customization": cake_customization
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

    @staticmethod
    def _store_cake_customization(
        db: Session,
        order_item_id: str,
        customer_id: str | None,
        customization: dict[str, Any]
    ) -> None:
        image_path = customization.get("image_path")
        message = customization.get("message")
        flavor = customization.get("flavor")
        size = customization.get("size")
        status = customization.get("status", "PENDING")

        insert_query = text("""
            INSERT INTO cake_customizations
            (order_item_id, customer_id, image_path, message, flavor, size, status)
            VALUES
            (CAST(:order_item_id AS uuid), CAST(:customer_id AS uuid), :image_path, :message, :flavor, :size, :status)
        """)

        db.execute(insert_query, {
            "order_item_id": order_item_id,
            "customer_id": customer_id if customer_id else None,
            "image_path": image_path,
            "message": message,
            "flavor": flavor,
            "size": size,
            "status": status
        })

    @staticmethod
    def consume_order_inventory(
        db: Session,
        order_id: str
    ) -> dict[str, Any]:
        """저장된 예약 정보를 바탕으로 실제 재고를 차감"""
        try:
            order_meta_query = text(
                """
                SELECT store_id::text, COALESCE(inventory_consumed, FALSE) AS inventory_consumed
                FROM orders
                WHERE order_id = CAST(:order_id AS uuid)
                """
            )

            order_meta = db.execute(order_meta_query, {"order_id": order_id}).fetchone()
            if not order_meta:
                return {"success": False, "error": "주문을 찾을 수 없습니다"}

            if order_meta.inventory_consumed:
                return {"success": True, "consumed": {}, "skipped": True}

            store_id = order_meta.store_id
            if not store_id:
                store_id = OrderService._get_main_store_id(db)

            if not store_id:
                return {"success": False, "error": "스토어 정보를 찾을 수 없습니다"}

            reservations_query = text(
                """
                SELECT ingredient_code, quantity
                FROM order_inventory_reservations
                WHERE order_id = CAST(:order_id AS uuid)
                  AND consumed = FALSE
                """
            )

            reservations = db.execute(reservations_query, {"order_id": order_id}).fetchall()

            if not reservations:
                update_flag = text(
                    """
                    UPDATE orders
                    SET inventory_consumed = TRUE
                    WHERE order_id = CAST(:order_id AS uuid)
                    """
                )
                db.execute(update_flag, {"order_id": order_id})
                return {"success": True, "consumed": {}, "skipped": True}

            needed_ingredients: dict[str, Decimal] = {}
            for ingredient_code, quantity in reservations:
                try:
                    qty_decimal = Decimal(str(quantity))
                except (InvalidOperation, ValueError):
                    return {"success": False, "error": f"재고 수량 변환에 실패했습니다: {ingredient_code}"}

                if qty_decimal <= 0:
                    continue
                needed_ingredients[ingredient_code] = qty_decimal

            ingredient_cache: dict[str, str] = {}
            insufficient: list[str] = []

            for ingredient_code, needed_qty in needed_ingredients.items():
                ingredient_row = db.execute(
                    text("""
                        SELECT ingredient_id
                        FROM ingredients
                        WHERE name = :name
                    """),
                    {"name": ingredient_code}
                ).fetchone()

                if not ingredient_row:
                    insufficient.append(f"{ingredient_code} (재료 정보 없음)")
                    continue

                ingredient_id = ingredient_row[0]
                ingredient_cache[ingredient_code] = ingredient_id

                stock_row = db.execute(
                    text("""
                        SELECT quantity_on_hand
                        FROM store_inventory
                        WHERE store_id = CAST(:store_id AS uuid)
                          AND ingredient_id = CAST(:ingredient_id AS uuid)
                    """),
                    {"store_id": store_id, "ingredient_id": ingredient_id}
                ).fetchone()

                current_stock = Decimal(str(stock_row[0])) if stock_row and stock_row[0] is not None else Decimal("0")

                if current_stock < needed_qty:
                    insufficient.append(
                        f"{ingredient_code} (필요: {float(needed_qty)}, 현재: {float(current_stock)})"
                    )

            if insufficient:
                return {
                    "success": False,
                    "error": f"재고 부족: {', '.join(insufficient)}",
                    "insufficient": insufficient
                }

            for ingredient_code, needed_qty in needed_ingredients.items():
                ingredient_id = ingredient_cache.get(ingredient_code)
                if not ingredient_id:
                    continue

                db.execute(
                    text("""
                        INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
                        VALUES (CAST(:store_id AS uuid), CAST(:ingredient_id AS uuid), -:quantity)
                        ON CONFLICT (store_id, ingredient_id)
                        DO UPDATE SET quantity_on_hand = store_inventory.quantity_on_hand - :quantity
                    """),
                    {
                        "store_id": store_id,
                        "ingredient_id": ingredient_id,
                        "quantity": needed_qty
                    }
                )

            db.execute(
                text("""
                    UPDATE order_inventory_reservations
                    SET consumed = TRUE,
                        consumed_at = NOW()
                    WHERE order_id = CAST(:order_id AS uuid)
                """),
                {"order_id": order_id}
            )

            db.execute(
                text("""
                    UPDATE orders
                    SET inventory_consumed = TRUE
                    WHERE order_id = CAST(:order_id AS uuid)
                """),
                {"order_id": order_id}
            )

            return {
                "success": True,
                "consumed": {code: float(qty) for code, qty in needed_ingredients.items()}
            }

        except Exception as exc:
            logger.error(f"주문 재고 차감 실패: {exc}")
            return {"success": False, "error": f"재고 차감 실패: {exc}"}

    @classmethod
    def _get_main_store_id(cls, db: Session) -> str | None:
        """메인 스토어 ID 조회"""
        try:
            store_query = text(
                """
                SELECT store_id::text
                FROM stores
                ORDER BY created_at ASC
                LIMIT 1
                """
            )
            row = db.execute(store_query).fetchone()
            return row[0] if row else None
        except Exception as exc:
            logger.error(f"스토어 ID 조회 실패: {exc}")
            return None