"""
메뉴 서비스 - 메뉴 조회 및 메뉴 관련 비즈니스 로직 (menu_items + serving_styles 테이블 기반)
Menu service for handling dinner menus and menu-related business logic
"""

import json
import logging
import traceback
from decimal import Decimal
from pathlib import Path
from typing import Any
from sqlalchemy import text
from sqlalchemy.orm import Session

# 로깅 설정
logger = logging.getLogger(__name__)

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

class MenuService:
    """메뉴 관련 비즈니스 로직 처리 (data/*.json 기반)"""

    _menu_data = None
    _operation_config = None

    @classmethod
    def _load_menu_data(cls) -> dict[str, Any]:
        """menu_info.json 로드 (캐싱)"""
        if cls._menu_data is None:
            try:
                data_dir = Path(__file__).parent.parent / "data"
                menu_file = data_dir / "menu_info.json"

                with open(menu_file, 'r', encoding='utf-8') as f:
                    cls._menu_data = json.load(f)
            except Exception as e:
                logger.error(f"메뉴 데이터 로드 실패: {e}")
                cls._menu_data = {}

        return cls._menu_data

    @classmethod
    def _load_operation_config(cls) -> dict[str, Any]:
        """operation_config.json 로드 (캐싱)"""
        if cls._operation_config is None:
            try:
                data_dir = Path(__file__).parent.parent / "data"
                config_file = data_dir / "operation_config.json"

                with open(config_file, 'r', encoding='utf-8') as f:
                    cls._operation_config = json.load(f)
            except Exception as e:
                logger.error(f"운영 설정 로드 실패: {e}")
                cls._operation_config = {
                    "cooking_times": {},
                    "style_pricing": {"simple": 0, "grand": 5000, "deluxe": 10000},
                    "delivery_config": {"base_time": 20}
                }

        return cls._operation_config

    @staticmethod
    def get_menu_data(db: Session) -> dict[str, Any]:
        """메뉴 데이터 조회 - menu_items + serving_styles 테이블 사용"""
        try:
            # 데이터베이스에서 메뉴 항목 + 서빙 스타일 정보 조회
            query = text("""
                SELECT
                    mi.menu_item_id,
                    mi.code,
                    mi.name,
                    mi.description,
                    mi.base_price,
                    mi.is_available
                FROM menu_items mi
                WHERE mi.is_available = true
                ORDER BY
                    CASE mi.code
                        WHEN 'valentine' THEN 1
                        WHEN 'french' THEN 2
                        WHEN 'english' THEN 3
                        WHEN 'champagne' THEN 4
                        ELSE 99
                    END
            """)

            results = db.execute(query).fetchall()
            menu_list = []

            # JSON 파일에서 한글 메뉴 정보 로드
            menu_data_json = MenuService._load_menu_data()

            for result in results:
                menu_item_id, code, name, description, base_price, is_available = result

                # JSON 파일에서 한글 이름과 설명 가져오기
                menu_info = menu_data_json.get(code, {})
                korean_name = menu_info.get("name", name)  # JSON에 없으면 DB 값 사용
                korean_description = menu_info.get("description", description or "")

                base_ingredient_map = MenuService._get_base_ingredients_for_menu(db, code)

                # 스타일별 정보 조회
                # menu_item_id는 UUID 객체이므로 그대로 전달
                styles = MenuService._get_styles_for_menu(db, menu_item_id, code, base_price, base_ingredient_map)

                # 재고 확인
                available = MenuService._check_menu_availability(db, str(menu_item_id))

                menu_list.append({
                    "id": str(menu_item_id),  # UUID를 문자열로 변환
                    "code": code,
                    "name": korean_name,  # 한글 이름 사용
                    "description": korean_description,  # 한글 설명 사용
                    "base_price": int(base_price) if base_price else 50000,
                    "styles": styles,
                    "available": available and is_available,
                    "image_url": f"/images/{code}-dinner.jpg"
                })

            return {
                "success": True,
                "data": menu_list,
                "count": len(menu_list)
            }

        except Exception as e:
            logger.error(f"메뉴 데이터 조회 오류: {e}")
            # 폴백: JSON 파일만 사용
            return MenuService._get_fallback_menu_data()


    @staticmethod
    def _get_styles_for_menu(
        db: Session,
        menu_item_id,
        menu_code: str,
        base_price: Decimal | float | int,
        base_ingredient_map: dict[str, dict[str, int]] | None = None
    ) -> list[dict[str, Any]]:
        """특정 메뉴 항목의 서빙 스타일 정보 조회 (menu_serving_style_availability 조인)"""
        try:
            # UUID를 문자열로 변환하여 PostgreSQL이 자동 캐스팅하도록 함
            menu_item_id_str = str(menu_item_id)

            query = text("""
                SELECT
                    ss.serving_style_id,
                    ss.name,
                    ss.description,
                    ss.price_modifier
                FROM serving_styles ss
                INNER JOIN menu_serving_style_availability mssa
                    ON ss.serving_style_id = mssa.serving_style_id
                WHERE mssa.menu_item_id = CAST(:menu_item_id AS uuid)
                ORDER BY ss.price_modifier ASC
            """)

            results = db.execute(query, {"menu_item_id": menu_item_id_str}).fetchall()

            styles = []
            if base_price is None:
                base_amount = Decimal("0")
            else:
                base_amount = base_price if isinstance(base_price, Decimal) else Decimal(str(base_price))

            for result in results:
                serving_style_id, name, description, price_modifier = result

                # 최종 가격 계산 (base_price + price_modifier)
                modifier_amount = Decimal("0")
                if price_modifier is not None:
                    modifier_amount = price_modifier if isinstance(price_modifier, Decimal) else Decimal(str(price_modifier))

                final_price_decimal = base_amount + modifier_amount
                final_price = int(final_price_decimal)

                # name을 소문자로 변환하여 code로 사용 (Simple -> simple)
                style_code = name.lower() if name else "simple"

                # 한글 이름으로 변환
                korean_name = MenuService._get_style_korean_name(name)
                # 한글 상세 설명 추가
                korean_description = MenuService._get_style_description(style_code)

                # 스타일별 조리시간 조회
                cooking_time = MenuService.get_cooking_time(menu_code, style_code)

                styles.append({
                    "id": str(serving_style_id),  # UUID를 문자열로 변환
                    "code": style_code,
                    "name": korean_name,  # 한글 이름 사용
                    "price": final_price,
                    "cooking_time": cooking_time,  # 스타일별 조리시간 사용
                    "description": korean_description or description or "",  # 한글 설명 우선 사용
                    "base_ingredients": base_ingredient_map.get(style_code, {}) if base_ingredient_map else {}
                })

            return styles

        except Exception as e:
            logger.error(f"스타일 정보 조회 오류 (menu_item_id: {menu_item_id}): {e}")
            logger.error(f"스택 트레이스: {traceback.format_exc()}")
            # 폴백: 기본 스타일만 반환
            fallback_cooking_time = MenuService.get_cooking_time(menu_code, "simple")
            return [{
                "id": "default",
                "code": "simple",
                "name": "Simple",
                "price": int(base_price),
                "cooking_time": fallback_cooking_time,
                "description": "Basic serving style"
            }]

    @staticmethod
    def _build_styles_info(dinner_code: str, base_price: float, available_styles: list[str]) -> list[dict[str, Any]]:
        """스타일별 정보 구성 (폴백용 - JSON 파일 기반)"""
        styles = []
        operation_config = MenuService._load_operation_config()

        # 스타일별 추가 가격 정책
        style_pricing = operation_config.get("style_pricing", {
            "simple": 0,
            "grand": 5000,
            "deluxe": 10000
        })

        for style in available_styles:
            # 가격 계산
            price_addition = style_pricing.get(style, 0)
            final_price = int(base_price + price_addition)

            # 조리시간 조회
            cooking_time = MenuService.get_cooking_time(dinner_code, style)

            styles.append({
                "name": MenuService._get_style_korean_name(style),
                "code": style,
                "price": final_price,
                "cooking_time": cooking_time,
                "description": MenuService._get_style_description(style)
            })

        return styles

    @staticmethod
    def _get_base_ingredients_for_menu(db: Session, menu_code: str) -> dict[str, dict[str, int]]:
        query = text(
            """
            SELECT style, ingredient_code, base_quantity
            FROM menu_base_ingredients
            WHERE menu_code = :menu_code
            """
        )

        rows = db.execute(query, {"menu_code": menu_code}).fetchall()

        if not rows:
            return MENU_BASE_INGREDIENTS.get(menu_code, {})

        style_map: dict[str, dict[str, int]] = {}
        for style, ingredient_code, base_quantity in rows:
            style_key = style.lower()
            if style_key not in style_map:
                style_map[style_key] = {}
            style_map[style_key][ingredient_code] = int(base_quantity)

        return style_map

    @staticmethod
    def get_base_ingredient_data(db: Session, menu_code: str | None = None) -> dict[str, Any]:
        query = text(
            """
            SELECT menu_code, style, ingredient_code, base_quantity
            FROM menu_base_ingredients
            WHERE (:menu_code IS NULL OR menu_code = :menu_code)
            ORDER BY menu_code, style, ingredient_code
            """
        )

        rows = db.execute(query, {"menu_code": menu_code}).fetchall()

        result: dict[str, dict[str, dict[str, int]]] = {}

        for code, style, ingredient_code, base_quantity in rows:
            style_key = style.lower()
            if code not in result:
                result[code] = {}
            if style_key not in result[code]:
                result[code][style_key] = {}
            result[code][style_key][ingredient_code] = int(base_quantity)

        if not result and menu_code:
            fallback = MENU_BASE_INGREDIENTS.get(menu_code, {})
            if fallback:
                result[menu_code] = fallback

        if not result and menu_code is None:
            result = MENU_BASE_INGREDIENTS.copy()

        return result

    @staticmethod
    def _get_style_korean_name(style: str) -> str:
        """스타일 영문명을 한글로 변환"""
        style_names = {
            "simple": "심플",
            "grand": "그랜드",
            "deluxe": "디럭스"
        }
        return style_names.get(style, style.title())

    @staticmethod
    def _get_style_english_name(korean_style: str) -> str:
        """스타일 한글명을 영문으로 변환"""
        korean_to_english = {
            "심플": "simple",
            "그랜드": "grand",
            "디럭스": "deluxe"
        }
        return korean_to_english.get(korean_style, korean_style.lower())

    @staticmethod
    def _get_style_description(style: str) -> str:
        """스타일별 상세 설명"""
        descriptions = {
            "simple": "플라스틱 접시와 플라스틱 컵, 종이 냅킨이 플라스틱 쟁반에 제공",
            "grand": "도자기 접시와 도자기 컵, 흰색 면 냅킨이 나무 쟁반에 제공",
            "deluxe": "꽃들이 있는 작은 꽃병, 도자기 접시와 도자기 컵, 린넨 냅킨이 나무 쟁반에 제공"
        }
        return descriptions.get(style, "")

    @staticmethod
    def _check_menu_availability(db: Session, item_id: str) -> bool:
        """메뉴 재고 가용성 체크 (store_inventory 연동 대기)"""
        try:
            # 간단한 재고 확인 (store_inventory 테이블 연동 예정)
            # 현재는 항상 true 반환, 추후 재고 시스템과 연동
            return True

        except Exception as e:
            logger.error(f"재고 확인 중 오류 (item_id: {item_id}): {e}")
            return False


    @staticmethod
    def get_cooking_time(dinner_code: str, style: str) -> int:
        """조리시간 조회 (분 단위)"""
        try:
            operation_config = MenuService._load_operation_config()
            cooking_times = operation_config.get("cooking_times", {})

            dinner_times = cooking_times.get(dinner_code, {})
            return dinner_times.get(style, 30)  # 기본값: 30분

        except Exception as e:
            logger.error(f"조리시간 조회 오류 ({dinner_code}-{style}): {e}")
            return 30


    @staticmethod
    def _get_fallback_menu_data() -> dict[str, Any]:
        """폴백 메뉴 데이터 (data/*.json 기반)"""
        try:
            menu_data = MenuService._load_menu_data()
            menu_list = []

            # 각 메뉴별 기본 가격
            base_prices = {
                "valentine": 30000,
                "french": 40000,
                "english": 45000,
                "champagne": 50000
            }

            for idx, (code, config) in enumerate(menu_data.items(), 1):
                base_price = base_prices.get(code, 50000)
                styles = MenuService._build_styles_info(
                    code,
                    base_price,
                    config.get("available_styles", ["simple"])
                )

                menu_list.append({
                    "id": idx,
                    "code": code,
                    "name": config.get("name", f"디너 {code}"),
                    "description": config.get("description", ""),
                    "base_price": base_price,
                    "styles": styles,
                    "available": True,
                    "image_url": config.get("image_url", f"/images/{code}-dinner.jpg")
                })

            return {
                "success": True,
                "data": menu_list,
                "count": len(menu_list),
                "fallback": True
            }

        except Exception as e:
            logger.error(f"폴백 메뉴 데이터 생성 오류: {e}")
            return {
                "success": False,
                "error": "메뉴 데이터를 불러올 수 없습니다.",
                "data": []
            }