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

class MenuService:
    """메뉴 관련 비즈니스 로직 처리 (DB 기반)"""

    # 메인 디너 메뉴 코드 목록 (사이드 디시 제외)
    MAIN_DINNER_MENU_CODES = ["valentine", "french", "english", "champagne"]

    _menu_data = None
    _operation_config = None
    _main_store_id: str | None = None

    @classmethod
    def _get_main_store_id(cls, db: Session) -> str | None:
        """메인 스토어 ID 조회 (캐싱)"""
        if cls._main_store_id is None:
            try:
                query = text("SELECT store_id::text FROM stores ORDER BY created_at ASC LIMIT 1")
                result = db.execute(query).fetchone()
                if result:
                    cls._main_store_id = result[0]
                else:
                    logger.error("스토어가 존재하지 않습니다")
                    return None
            except Exception as e:
                logger.error(f"스토어 ID 조회 실패: {e}")
                return None

        return cls._main_store_id

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
                cls._operation_config = {}

        return cls._operation_config

    @classmethod
    def _calculate_style_availability(
        cls,
        db: Session,
        menu_code: str,
        base_ingredient_map: dict[str, dict[str, int]] | None
    ) -> dict[str, bool]:
        """스타일별 재료 가용성 계산"""
        if not base_ingredient_map:
            return {}

        store_id = cls._get_main_store_id(db)
        if not store_id:
            return {style: True for style in base_ingredient_map.keys()}

        ingredient_codes: set[str] = set()
        for ingredients in base_ingredient_map.values():
            ingredient_codes.update(ingredients.keys())

        if not ingredient_codes:
            return {style: True for style in base_ingredient_map.keys()}

        placeholders = ", ".join(f":code_{idx}" for idx, _ in enumerate(ingredient_codes))
        query = text(
            f"""
            SELECT i.name, COALESCE(si.quantity_on_hand, 0) AS quantity_on_hand
            FROM ingredients i
            LEFT JOIN store_inventory si
                ON si.ingredient_id = i.ingredient_id
               AND si.store_id = CAST(:store_id AS uuid)
            WHERE i.name IN ({placeholders})
            """
        )

        params: dict[str, Any] = {"store_id": store_id}
        for idx, code in enumerate(ingredient_codes):
            params[f"code_{idx}"] = code

        rows = db.execute(query, params).fetchall()
        inventory_map = {
            row[0]: float(row[1]) if row[1] is not None else 0.0
            for row in rows
        }

        availability: dict[str, bool] = {}
        for style, ingredients in base_ingredient_map.items():
            style_available = True
            for ingredient_code, required_qty in ingredients.items():
                available_qty = inventory_map.get(ingredient_code, 0.0)
                if available_qty < required_qty:
                    style_available = False
                    break
            availability[style] = style_available

        return availability

    @staticmethod
    def get_menu_data(db: Session) -> dict[str, Any]:
        """메뉴 데이터 조회 - menu_items + serving_styles 테이블 사용"""
        try:
            # 데이터베이스에서 메인 디너 메뉴 항목만 조회 (사이드 디시 제외)
            # 메인 디너 메뉴 코드 목록을 사용하여 명시적으로 필터링
            # SQL 인젝션 방지를 위해 파라미터 바인딩 사용
            placeholders = ', '.join([f':code_{i}' for i in range(len(MenuService.MAIN_DINNER_MENU_CODES))])
            params = {f'code_{i}': code for i, code in enumerate(MenuService.MAIN_DINNER_MENU_CODES)}
            
            query = text(f"""
                SELECT
                    mi.menu_item_id,
                    mi.code,
                    mi.name,
                    mi.description,
                    mi.base_price,
                    mi.is_available
                FROM menu_items mi
                WHERE mi.is_available = true
                  AND mi.code IN ({placeholders})
                ORDER BY
                    CASE mi.code
                        WHEN 'valentine' THEN 1
                        WHEN 'french' THEN 2
                        WHEN 'english' THEN 3
                        WHEN 'champagne' THEN 4
                        ELSE 99
                    END
            """)

            results = db.execute(query, params).fetchall()
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
                style_availability = MenuService._calculate_style_availability(db, code, base_ingredient_map)

                # 스타일별 정보 조회
                styles = MenuService._get_styles_for_menu(
                    db,
                    menu_item_id,
                    code,
                    base_price,
                    base_ingredient_map,
                    style_availability
                )

                has_available_style = any(style.get("available", True) for style in styles)

                menu_list.append({
                    "id": str(menu_item_id),  # UUID를 문자열로 변환
                    "code": code,
                    "name": korean_name,  # 한글 이름 사용
                    "description": korean_description,  # 한글 설명 사용
                    "base_price": int(base_price) if base_price else 50000,
                    "styles": styles,
                    "available": bool(is_available and has_available_style),
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
        base_ingredient_map: dict[str, dict[str, int]] | None = None,
        style_availability: dict[str, bool] | None = None
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
                    ss.price_modifier,
                    ss.display_name
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

            availability_map = style_availability or {}

            for result in results:
                serving_style_id, name, description, price_modifier, display_name = result

                # 최종 가격 계산 (base_price + price_modifier)
                modifier_amount = Decimal("0")
                if price_modifier is not None:
                    modifier_amount = price_modifier if isinstance(price_modifier, Decimal) else Decimal(str(price_modifier))

                final_price_decimal = base_amount + modifier_amount
                final_price = int(final_price_decimal)

                # name을 소문자로 변환하여 code로 사용 (Simple -> simple)
                style_code = name.lower() if name else "simple"

                # 한글 이름으로 변환 (DB의 display_name 우선 사용)
                korean_name = display_name if display_name else MenuService._get_style_korean_name(name)
                
                # 한글 상세 설명 추가
                korean_description = description or MenuService._get_style_description(style_code)

                # 스타일별 조리시간 조회
                cooking_time = MenuService.get_cooking_time(menu_code, style_code)

                styles.append({
                    "id": str(serving_style_id),  # UUID를 문자열로 변환
                    "code": style_code,
                    "name": korean_name,  # 한글 이름 사용
                    "price": final_price,
                    "cooking_time": cooking_time,  # 스타일별 조리시간 사용
                    "description": korean_description,  # 한글 설명 우선 사용
                    "base_ingredients": base_ingredient_map.get(style_code, {}) if base_ingredient_map else {},
                    "available": availability_map.get(style_code, True)
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

        # Note: Removed fallback to MENU_BASE_INGREDIENTS as per refactoring plan

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

        return result

    @staticmethod
    def upsert_base_ingredient(
        db: Session,
        menu_code: str,
        style: str,
        ingredient_code: str,
        base_quantity: int
    ) -> dict[str, Any]:
        try:
            style_key = style.lower().strip()
            ingredient_key = (ingredient_code or "").strip()
            if not menu_code or not style_key or not ingredient_key:
                return {"success": False, "error": "메뉴, 스타일, 재료 정보를 확인해주세요"}

            quantity = int(base_quantity)
            if quantity < 0:
                return {"success": False, "error": "수량은 0 이상이어야 합니다"}

            ingredient_check = text("""
                SELECT ingredient_id
                FROM ingredients
                WHERE name = :name
            """)
            ingredient_row = db.execute(ingredient_check, {"name": ingredient_key}).fetchone()
            if not ingredient_row:
                return {"success": False, "error": "존재하지 않는 재료입니다"}

            upsert_query = text("""
                INSERT INTO menu_base_ingredients (menu_code, style, ingredient_code, base_quantity)
                VALUES (:menu_code, :style, :ingredient_code, :base_quantity)
                ON CONFLICT (menu_code, style, ingredient_code)
                DO UPDATE SET base_quantity = EXCLUDED.base_quantity
            """)
            db.execute(upsert_query, {
                "menu_code": menu_code,
                "style": style_key,
                "ingredient_code": ingredient_key,
                "base_quantity": quantity
            })

            db.commit()
            return {
                "success": True,
                "menu_code": menu_code,
                "style": style_key,
                "ingredient_code": ingredient_key,
                "base_quantity": quantity
            }
        except Exception as e:
            db.rollback()
            logger.error(f"기본 재료 업데이트 실패: {e}")
            return {"success": False, "error": f"기본 재료 업데이트 실패: {str(e)}"}

    @staticmethod
    def remove_base_ingredient(
        db: Session,
        menu_code: str,
        style: str,
        ingredient_code: str
    ) -> dict[str, Any]:
        try:
            style_key = style.lower().strip()
            ingredient_key = (ingredient_code or "").strip()
            if not menu_code or not style_key or not ingredient_key:
                return {"success": False, "error": "메뉴, 스타일, 재료 정보를 확인해주세요"}

            delete_query = text("""
                DELETE FROM menu_base_ingredients
                WHERE menu_code = :menu_code
                  AND style = :style
                  AND ingredient_code = :ingredient_code
            """)
            result = db.execute(delete_query, {
                "menu_code": menu_code,
                "style": style_key,
                "ingredient_code": ingredient_key
            })

            if result.rowcount == 0:
                db.rollback()
                return {"success": False, "error": "해당 재료 구성을 찾을 수 없습니다"}

            db.commit()
            return {
                "success": True,
                "menu_code": menu_code,
                "style": style_key,
                "ingredient_code": ingredient_key
            }
        except Exception as e:
            db.rollback()
            logger.error(f"기본 재료 삭제 실패: {e}")
            return {"success": False, "error": f"기본 재료 삭제 실패: {str(e)}"}

    @staticmethod
    def _get_style_korean_name(style: str) -> str:
        """스타일 영문명을 한글로 변환 (폴백용)"""
        style_names = {
            "simple": "심플",
            "grand": "그랜드",
            "deluxe": "디럭스"
        }
        return style_names.get(style, style.title())

    @staticmethod
    def _get_style_english_name(korean_style: str) -> str:
        """스타일 한글명을 영문으로 변환 (폴백용)"""
        korean_to_english = {
            "심플": "simple",
            "그랜드": "grand",
            "디럭스": "deluxe"
        }
        return korean_to_english.get(korean_style, korean_style.lower())

    @staticmethod
    def _get_style_description(style: str) -> str:
        """스타일별 상세 설명 (폴백용)"""
        descriptions = {
            "simple": "플라스틱 접시와 플라스틱 컵, 종이 냅킨이 플라스틱 쟁반에 제공",
            "grand": "도자기 접시와 도자기 컵, 흰색 면 냅킨이 나무 쟁반에 제공",
            "deluxe": "꽃들이 있는 작은 꽃병, 도자기 접시와 도자기 컵, 린넨 냅킨이 나무 쟁반에 제공"
        }
        return descriptions.get(style, "")

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
                # 메인 디너 메뉴만 포함 (사이드 디시 제외)
                if code not in MenuService.MAIN_DINNER_MENU_CODES:
                    continue
                    
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
    
    @staticmethod
    def get_all_ingredients(db: Session) -> list[dict[str, Any]]:
        """모든 재료 정보 조회 (화면 표시용)"""
        query = text("SELECT name, display_name, category FROM ingredients ORDER BY category, name")
        rows = db.execute(query).fetchall()
        return [{"code": row[0], "display_name": row[1] or row[0], "category": row[2]} for row in rows]

    @staticmethod
    def get_serving_styles(db: Session) -> list[dict[str, Any]]:
        """모든 서빙 스타일 정보 조회 (화면 표시용)"""
        query = text("SELECT name, display_name, description FROM serving_styles ORDER BY name")
        rows = db.execute(query).fetchall()
        return [{"code": row[0], "display_name": row[1] or row[0], "description": row[2]} for row in rows]
