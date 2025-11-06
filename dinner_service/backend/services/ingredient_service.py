"""
실제 데이터베이스 기반 재료 관리 서비스 - Raw SQL 버전
PostgreSQL ingredients + store_inventory 테이블 연동 (UUID 기반)
한국어 번역 및 카테고리 분류 지원
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from sqlalchemy import text

from ..services.database import get_db

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class IngredientService:
    """실제 데이터베이스 기반 재료 관리 서비스 - Raw SQL 버전"""

    _korean_translations = None
    _main_store_id = None

    @classmethod
    def _load_korean_translations(cls) -> dict[str, Any]:
        """한국어 번역 데이터 로드 (캐싱)"""
        if cls._korean_translations is None:
            try:
                data_dir = Path(__file__).parent.parent / "data"
                korean_file = data_dir / "ingredients_ko.json"

                with open(korean_file, 'r', encoding='utf-8') as f:
                    cls._korean_translations = json.load(f)

            except Exception as e:
                logger.error(f"한국어 번역 데이터 로드 실패: {e}")
                cls._korean_translations = {
                    "translations": {},
                    "categories": {},
                    "units": {}
                }

        return cls._korean_translations

    @classmethod
    def _get_main_store_id(cls, db) -> str:
        """메인 스토어 ID 조회 (캐싱)"""
        if cls._main_store_id is None:
            try:
                query = text("SELECT store_id::text FROM stores LIMIT 1")
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

    def _get_ingredient_category(self, ingredient_name: str) -> dict[str, str] | None:
        """재료 이름으로 카테고리 찾기"""
        ko_data = self._load_korean_translations()
        categories = ko_data.get('categories', {})

        for cat_key, cat_info in categories.items():
            if ingredient_name in cat_info.get('items', []):
                return {
                    'key': cat_key,
                    'name': cat_info['name'],
                    'description': cat_info.get('description', ''),
                    'restock_frequency': cat_info.get('restock_frequency', 'as_needed')
                }
        return None

    def get_all_ingredients(self) -> dict[str, Any]:
        """전체 재료 목록 조회 (ingredients + store_inventory JOIN)"""
        try:
            db_gen = get_db()
            db = next(db_gen)

            try:
                store_id = self._get_main_store_id(db)
                if not store_id:
                    return {
                        "success": False,
                        "error": "스토어를 찾을 수 없습니다",
                        "data": [],
                        "count": 0
                    }

                ko_data = self._load_korean_translations()
                translations = ko_data.get('translations', {})
                units = ko_data.get('units', {})

                query = text("""
                    SELECT
                        i.ingredient_id::text,
                        i.name,
                        i.unit,
                        COALESCE(si.quantity_on_hand, 0) as quantity
                    FROM ingredients i
                    LEFT JOIN store_inventory si ON i.ingredient_id = si.ingredient_id AND si.store_id = CAST(:store_id AS uuid)
                    ORDER BY i.name
                """)

                result = db.execute(query, {"store_id": store_id})
                rows = result.fetchall()

                ingredient_data = []

                for row in rows:
                    ingredient_id = row[0]
                    ingredient_name = row[1]
                    unit = row[2]
                    quantity = float(row[3]) if row[3] else 0

                    # 한국어 번역
                    korean_name = translations.get(ingredient_name, ingredient_name)
                    korean_unit = units.get(unit, unit)

                    # 카테고리 정보
                    category = self._get_ingredient_category(ingredient_name)

                    ingredient_dict = {
                        'id': ingredient_id,
                        'name': ingredient_name,
                        'korean_name': korean_name,
                        'currentStock': quantity,
                        'unit': unit,
                        'korean_unit': korean_unit,
                        'minimumStock': 10,  # 기본값
                        'restockAmount': 50,  # 기본값
                        'category': category
                    }
                    ingredient_data.append(ingredient_dict)

                return {
                    "success": True,
                    "data": ingredient_data,
                    "count": len(ingredient_data)
                }

            finally:
                db.close()

        except Exception as e:
            logger.error(f"재료 목록 조회 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"재료 목록 조회 실패: {str(e)}",
                "data": [],
                "count": 0
            }

    def get_categorized_ingredients(self) -> dict[str, Any]:
        """카테고리별 재료 목록 조회"""
        try:
            # 모든 재료 조회
            all_ingredients = self.get_all_ingredients()
            if not all_ingredients['success']:
                return all_ingredients

            ko_data = self._load_korean_translations()
            categories_info = ko_data.get('categories', {})

            # 카테고리별로 그룹화
            categorized = {}

            for cat_key, cat_info in categories_info.items():
                categorized[cat_key] = {
                    'name': cat_info['name'],
                    'description': cat_info.get('description', ''),
                    'restock_frequency': cat_info.get('restock_frequency', 'as_needed'),
                    'items': []
                }

            # 재료를 카테고리에 할당
            for ingredient in all_ingredients['data']:
                category = ingredient.get('category')
                if category:
                    cat_key = category['key']
                    if cat_key in categorized:
                        categorized[cat_key]['items'].append(ingredient)

            return {
                "success": True,
                "data": categorized,
                "count": len(categorized)
            }

        except Exception as e:
            logger.error(f"카테고리별 재료 조회 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"카테고리별 재료 조회 실패: {str(e)}",
                "data": {},
                "count": 0
            }

    def get_ingredient_pricing(self) -> dict[str, Any]:
        """재료별 단가 조회"""
        try:
            db_gen = get_db()
            db = next(db_gen)

            try:
                query = text("""
                    SELECT ingredient_code, unit_price
                    FROM ingredient_pricing
                    ORDER BY ingredient_code
                """)

                rows = db.execute(query).fetchall()

                pricing_list = []
                pricing_map: dict[str, float] = {}

                ko_data = self._load_korean_translations()
                translations = ko_data.get('translations', {})

                for row in rows:
                    code = row[0]
                    price = float(row[1]) if row[1] is not None else 0.0
                    pricing_map[code] = price
                    pricing_list.append({
                        "ingredient_code": code,
                        "unit_price": price,
                        "korean_name": translations.get(code, code)
                    })

                return {
                    "success": True,
                    "data": pricing_list,
                    "pricing": pricing_map,
                    "count": len(pricing_list)
                }

            finally:
                db.close()

        except Exception as e:
            logger.error(f"재료 단가 조회 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"재료 단가 조회 실패: {str(e)}",
                "data": [],
                "pricing": {},
                "count": 0
            }

    def bulk_restock_by_category(self, category_key: str) -> dict[str, Any]:
        """특정 카테고리의 모든 재료 일괄 재입고"""
        try:
            db_gen = get_db()
            db = next(db_gen)

            try:
                store_id = self._get_main_store_id(db)
                if not store_id:
                    return {
                        "success": False,
                        "error": "스토어를 찾을 수 없습니다"
                    }

                ko_data = self._load_korean_translations()
                categories = ko_data.get('categories', {})

                if category_key not in categories:
                    return {
                        "success": False,
                        "error": f"유효하지 않은 카테고리: {category_key}"
                    }

                category_info = categories[category_key]
                ingredient_names = category_info.get('items', [])

                if not ingredient_names:
                    return {
                        "success": False,
                        "error": f"{category_info['name']} 카테고리에 재료가 없습니다"
                    }

                # 카테고리에 속한 재료들의 재고 50개씩 추가
                restock_amount = 50
                updated_count = 0

                for ingredient_name in ingredient_names:
                    # 재료 ID 조회
                    query = text("""
                        SELECT ingredient_id::text FROM ingredients WHERE name = :name
                    """)
                    result = db.execute(query, {"name": ingredient_name}).fetchone()

                    if not result:
                        logger.warning(f"재료를 찾을 수 없음: {ingredient_name}")
                        continue

                    ingredient_id = result[0]

                    # 재고 업데이트 (UPSERT)
                    update_query = text("""
                        INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
                        VALUES (CAST(:store_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                        ON CONFLICT (store_id, ingredient_id)
                        DO UPDATE SET quantity_on_hand = store_inventory.quantity_on_hand + :quantity
                    """)

                    db.execute(update_query, {
                        "store_id": store_id,
                        "ingredient_id": ingredient_id,
                        "quantity": restock_amount
                    })
                    updated_count += 1

                db.commit()

                return {
                    "success": True,
                    "message": f"{category_info['name']} 카테고리 재료 {updated_count}개 재입고 완료 (각 {restock_amount}개씩 추가)",
                    "updated_count": updated_count
                }

            finally:
                db.close()

        except Exception as e:
            logger.error(f"카테고리별 일괄 재입고 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"일괄 재입고 실패: {str(e)}"
            }

    def record_intake(
        self,
        db,
        intake_items: Iterable[dict[str, Any]],
        staff_id: str | None = None,
        note: str | None = None
    ) -> dict[str, Any]:
        """재료 입고 기록 (다중 항목)"""
        try:
            store_id = self._get_main_store_id(db)
            if not store_id:
                return {
                    "success": False,
                    "error": "스토어를 찾을 수 없습니다",
                    "processed": []
                }

            processed: list[dict[str, Any]] = []
            missing: list[str] = []

            for item in intake_items:
                if not item:
                    continue

                ingredient_code = (item.get("ingredient_code") or "").strip()
                quantity_val = item.get("quantity")

                if not ingredient_code:
                    continue

                try:
                    quantity = int(quantity_val)
                except (TypeError, ValueError):
                    continue

                if quantity <= 0:
                    continue

                ingredient_query = text("""
                    SELECT ingredient_id::text, unit
                    FROM ingredients
                    WHERE name = :name
                """)

                ingredient_result = db.execute(ingredient_query, {"name": ingredient_code}).fetchone()

                if not ingredient_result:
                    missing.append(ingredient_code)
                    continue

                ingredient_id, unit = ingredient_result

                update_query = text("""
                    INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
                    VALUES (CAST(:store_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                    ON CONFLICT (store_id, ingredient_id)
                    DO UPDATE SET quantity_on_hand = store_inventory.quantity_on_hand + :quantity
                    RETURNING quantity_on_hand
                """)

                update_result = db.execute(update_query, {
                    "store_id": store_id,
                    "ingredient_id": ingredient_id,
                    "quantity": quantity
                }).fetchone()

                new_stock = float(update_result[0]) if update_result else None

                processed.append({
                    "ingredient_code": ingredient_code,
                    "quantity_added": quantity,
                    "new_stock": new_stock,
                    "unit": unit
                })

            if processed:
                db.commit()
            else:
                db.rollback()

            return {
                "success": True,
                "processed": processed,
                "missing": missing,
                "note": note,
                "staff_id": staff_id,
                "recorded_at": datetime.now().isoformat()
            }

        except Exception as e:
            db.rollback()
            logger.error(f"재료 입고 처리 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"재료 입고 처리 실패: {str(e)}",
                "processed": []
            }

    def add_stock(self, ingredient_id: str, quantity: int) -> dict[str, Any]:
        """재료 재고 추가"""
        try:
            db_gen = get_db()
            db = next(db_gen)

            try:
                store_id = self._get_main_store_id(db)
                if not store_id:
                    return {
                        "success": False,
                        "error": "스토어를 찾을 수 없습니다"
                    }

                # 재고 업데이트 (UPSERT)
                update_query = text("""
                    INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
                    VALUES (CAST(:store_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                    ON CONFLICT (store_id, ingredient_id)
                    DO UPDATE SET quantity_on_hand = store_inventory.quantity_on_hand + :quantity
                """)

                db.execute(update_query, {
                    "store_id": store_id,
                    "ingredient_id": ingredient_id,
                    "quantity": quantity
                })
                db.commit()

                return {
                    "success": True,
                    "message": f"재고 {quantity}개 추가 완료"
                }

            finally:
                db.close()

        except Exception as e:
            logger.error(f"재고 추가 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"재고 추가 실패: {str(e)}"
            }

    def bulk_restock_low_items(self) -> dict[str, Any]:
        """재고 부족 항목 일괄 재입고"""
        try:
            db_gen = get_db()
            db = next(db_gen)

            try:
                store_id = self._get_main_store_id(db)
                if not store_id:
                    return {
                        "success": False,
                        "error": "스토어를 찾을 수 없습니다"
                    }

                # 재고가 10개 미만인 재료 조회
                query = text("""
                    SELECT i.ingredient_id::text
                    FROM ingredients i
                    LEFT JOIN store_inventory si ON i.ingredient_id = si.ingredient_id AND si.store_id = CAST(:store_id AS uuid)
                    WHERE COALESCE(si.quantity_on_hand, 0) < 10
                """)

                result = db.execute(query, {"store_id": store_id})
                low_stock_items = result.fetchall()

                if not low_stock_items:
                    return {
                        "success": True,
                        "message": "재고 부족 항목이 없습니다",
                        "updated_count": 0
                    }

                # 각 항목에 50개씩 추가
                restock_amount = 50
                updated_count = 0

                for row in low_stock_items:
                    ingredient_id = row[0]

                    update_query = text("""
                        INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
                        VALUES (CAST(:store_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                        ON CONFLICT (store_id, ingredient_id)
                        DO UPDATE SET quantity_on_hand = store_inventory.quantity_on_hand + :quantity
                    """)

                    db.execute(update_query, {
                        "store_id": store_id,
                        "ingredient_id": ingredient_id,
                        "quantity": restock_amount
                    })
                    updated_count += 1

                db.commit()

                return {
                    "success": True,
                    "message": f"재고 부족 항목 {updated_count}개 재입고 완료 (각 {restock_amount}개씩 추가)",
                    "updated_count": updated_count
                }

            finally:
                db.close()

        except Exception as e:
            logger.error(f"일괄 재입고 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"일괄 재입고 실패: {str(e)}"
            }

    def seed_initial_data(self) -> dict[str, Any]:
        """초기 재료 데이터 삽입"""
        try:
            db_gen = get_db()
            db = next(db_gen)

            try:
                ko_data = self._load_korean_translations()
                translations = ko_data.get('translations', {})

                # 재료가 이미 있는지 확인
                check_query = text("SELECT COUNT(*) FROM ingredients")
                count = db.execute(check_query).scalar()

                if count > 0:
                    return {
                        "success": False,
                        "error": "재료 데이터가 이미 존재합니다"
                    }

                # 모든 재료 삽입
                inserted = 0
                for eng_name in translations.keys():
                    # 기본 단위 설정 (샘플)
                    unit = "piece"
                    if "wine" in eng_name or "champagne" in eng_name:
                        unit = "bottle"
                    elif "coffee" in eng_name:
                        unit = "pot"

                    insert_query = text("""
                        INSERT INTO ingredients (name, unit)
                        VALUES (:name, :unit)
                        ON CONFLICT DO NOTHING
                    """)

                    db.execute(insert_query, {"name": eng_name, "unit": unit})
                    inserted += 1

                db.commit()

                return {
                    "success": True,
                    "message": f"{inserted}개의 재료 데이터 삽입 완료",
                    "inserted_count": inserted
                }

            finally:
                db.close()

        except Exception as e:
            logger.error(f"초기 데이터 삽입 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"초기 데이터 삽입 실패: {str(e)}"
            }

# 전역 서비스 인스턴스
ingredient_service = IngredientService()
