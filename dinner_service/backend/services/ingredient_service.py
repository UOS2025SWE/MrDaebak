"""
실제 데이터베이스 기반 재료 관리 서비스 - Raw SQL 버전
PostgreSQL ingredients + store_inventory 테이블 연동 (UUID 기반)
한국어 번역 및 카테고리 분류 지원
"""

import json
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Iterable
from sqlalchemy import text
from sqlalchemy.orm import Session

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

    @staticmethod
    def _to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
        """입력값을 소수점 두 자리로 반올림한 Decimal로 변환"""
        if value is None:
            return default

        if isinstance(value, Decimal):
            return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        try:
            return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except (InvalidOperation, ValueError, TypeError):
            return default

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

    def update_ingredient_price(
        self,
        db,
        ingredient_code: str,
        unit_price: Decimal
    ) -> dict[str, Any]:
        """재료 단가 업데이트 (매니저 전용)"""
        try:
            normalized_code = (ingredient_code or "").strip()
            if not normalized_code:
                return {
                    "success": False,
                    "error": "재료 코드를 확인해주세요"
                }

            price_value = Decimal(str(unit_price)).quantize(Decimal("0.01"))
            if price_value < 0:
                return {
                    "success": False,
                    "error": "단가는 0 이상이어야 합니다"
                }

            # 재료 존재 여부 확인
            ingredient_query = text("""
                SELECT ingredient_id
                FROM ingredients
                WHERE name = :name
            """)
            ingredient_row = db.execute(ingredient_query, {"name": normalized_code}).fetchone()
            if not ingredient_row:
                return {
                    "success": False,
                    "error": "존재하지 않는 재료입니다"
                }

            upsert_query = text("""
                INSERT INTO ingredient_pricing (ingredient_code, unit_price)
                VALUES (:ingredient_code, :unit_price)
                ON CONFLICT (ingredient_code)
                DO UPDATE SET unit_price = EXCLUDED.unit_price
            """)
            db.execute(upsert_query, {
                "ingredient_code": normalized_code,
                "unit_price": price_value
            })

            db.commit()
            return {
                "success": True,
                "ingredient_code": normalized_code,
                "unit_price": float(price_value)
            }

        except Exception as e:
            db.rollback()
            logger.error(f"재료 단가 업데이트 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"재료 단가 업데이트 실패: {str(e)}"
            }

    def bulk_restock_by_category(self, category_key: str, restock_amount: int | None = None) -> dict[str, Any]:
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

                # 카테고리에 속한 재료들의 재고 추가
                amount = restock_amount if restock_amount and restock_amount > 0 else 50
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
                        "quantity": amount
                    })
                    updated_count += 1

                db.commit()

                return {
                    "success": True,
                    "message": f"{category_info['name']} 카테고리 재료 {updated_count}개 재입고 완료 (각 {amount}개씩 추가)",
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

    def restock_selected_items(self, db: Session, items: Iterable[dict[str, Any]]) -> dict[str, Any]:
        """선택한 재료들을 지정된 수량만큼 재입고"""
        try:
            store_id = self._get_main_store_id(db)
            if not store_id:
                return {"success": False, "error": "스토어를 찾을 수 없습니다"}

            processed: list[dict[str, Any]] = []
            skipped: list[dict[str, Any]] = []

            upsert_query = text(
                """
                INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
                VALUES (CAST(:store_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                ON CONFLICT (store_id, ingredient_id)
                DO UPDATE SET quantity_on_hand = store_inventory.quantity_on_hand + :quantity
                """
            )
            ingredient_lookup = text(
                """
                SELECT ingredient_id::text
                FROM ingredients
                WHERE name = :name
                """
            )

            for raw_item in items:
                ingredient_code = (raw_item.get("ingredient_code") or "").strip()
                quantity_value = raw_item.get("quantity")

                if not ingredient_code:
                    skipped.append({"ingredient_code": ingredient_code, "reason": "재료 코드가 누락되었습니다"})
                    continue

                try:
                    quantity_int = int(quantity_value)
                except (TypeError, ValueError):
                    skipped.append({"ingredient_code": ingredient_code, "reason": "재입고 수량이 올바르지 않습니다"})
                    continue

                if quantity_int <= 0:
                    skipped.append({"ingredient_code": ingredient_code, "reason": "재입고 수량은 1 이상이어야 합니다"})
                    continue

                ingredient_row = db.execute(ingredient_lookup, {"name": ingredient_code}).fetchone()
                if not ingredient_row:
                    skipped.append({"ingredient_code": ingredient_code, "reason": "재료를 찾을 수 없습니다"})
                    continue

                db.execute(
                    upsert_query,
                    {
                        "store_id": store_id,
                        "ingredient_id": ingredient_row[0],
                        "quantity": quantity_int,
                    },
                )

                processed.append({"ingredient_code": ingredient_code, "quantity": quantity_int})

            if not processed:
                db.rollback()
                return {
                    "success": False,
                    "error": "유효한 재입고 항목이 없습니다",
                    "skipped": skipped,
                }

            db.commit()

            message = f"선택한 재료 {len(processed)}개 재입고 완료"
            if skipped:
                message += f" (미처리 {len(skipped)}개 항목)"

            return {"success": True, "message": message, "processed": processed, "skipped": skipped}

        except Exception as exc:
            db.rollback()
            logger.error("선택 재료 재입고 실패: %s", exc)
            return {"success": False, "error": f"선택 재료 재입고 실패: {exc}"}

    def create_intake_batch(
        self,
        db,
        manager_id: str,
        intake_items: Iterable[dict[str, Any]],
        note: str | None = None
    ) -> dict[str, Any]:
        """매니저가 재료 입고 배치를 생성"""
        try:
            store_id = self._get_main_store_id(db)
            if not store_id:
                return {
                    "success": False,
                    "error": "스토어를 찾을 수 없습니다",
                    "processed": []
                }

            if not manager_id:
                return {
                    "success": False,
                    "error": "매니저 정보를 확인할 수 없습니다",
                    "processed": []
                }

            items = [item for item in intake_items if item]
            if not items:
                return {
                    "success": False,
                    "error": "입고 항목이 비어 있습니다",
                    "processed": []
                }

            batch_insert = text("""
                INSERT INTO ingredient_intake_batches (
                    store_id,
                    manager_id,
                    status,
                    note,
                    total_expected_cost,
                    total_actual_cost
                )
                VALUES (
                    CAST(:store_id AS uuid),
                    CAST(:manager_id AS uuid),
                    'AWAITING_COOK',
                    :note,
                    0,
                    0
                )
                RETURNING batch_id::text, created_at
            """)

            batch_row = db.execute(batch_insert, {
                "store_id": store_id,
                "manager_id": manager_id,
                "note": note
            }).fetchone()

            if not batch_row:
                db.rollback()
                return {
                    "success": False,
                    "error": "입고 배치를 생성하지 못했습니다",
                    "processed": []
                }

            batch_id, created_at = batch_row

            processed: list[dict[str, Any]] = []
            missing: list[str] = []
            duplicate_codes: set[str] = set()
            seen_codes: set[str] = set()
            total_expected = Decimal("0.00")
            total_actual = Decimal("0.00")

            for item in items:
                ingredient_code = (item.get("ingredient_code") or "").strip()
                if not ingredient_code:
                    continue

                if ingredient_code in seen_codes:
                    duplicate_codes.add(ingredient_code)
                    continue

                expected_quantity = self._to_decimal(
                    item.get("expected_quantity", item.get("quantity")),
                    Decimal("0.00")
                )
                if expected_quantity <= 0:
                    continue

                unit_price = self._to_decimal(item.get("unit_price"), Decimal("0.00"))
                remarks = item.get("remarks")

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

                actual_quantity = expected_quantity
                expected_total = (expected_quantity * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                actual_total = expected_total

                insert_item_query = text("""
                    INSERT INTO ingredient_intake_items (
                        batch_id,
                        ingredient_id,
                        expected_quantity,
                        actual_quantity,
                        unit_price,
                        expected_total_cost,
                        actual_total_cost,
                        remarks
                    )
                    VALUES (
                        CAST(:batch_id AS uuid),
                        CAST(:ingredient_id AS uuid),
                        :expected_quantity,
                        :actual_quantity,
                        :unit_price,
                        :expected_total_cost,
                        :actual_total_cost,
                        :remarks
                    )
                    RETURNING intake_item_id::text
                """)

                item_row = db.execute(insert_item_query, {
                    "batch_id": batch_id,
                    "ingredient_id": ingredient_id,
                    "expected_quantity": expected_quantity,
                    "actual_quantity": actual_quantity,
                    "unit_price": unit_price,
                    "expected_total_cost": expected_total,
                    "actual_total_cost": actual_total,
                    "remarks": remarks
                }).fetchone()

                if not item_row:
                    missing.append(ingredient_code)
                    continue

                intake_item_id = item_row[0]

                pricing_upsert = text("""
                    INSERT INTO ingredient_pricing (ingredient_code, unit_price)
                    VALUES (:ingredient_code, :unit_price)
                    ON CONFLICT (ingredient_code)
                    DO UPDATE SET unit_price = EXCLUDED.unit_price
                """)
                db.execute(pricing_upsert, {
                    "ingredient_code": ingredient_code,
                    "unit_price": unit_price
                })

                processed.append({
                    "intake_item_id": intake_item_id,
                    "ingredient_code": ingredient_code,
                    "expected_quantity": float(expected_quantity),
                    "actual_quantity": float(actual_quantity),
                    "unit": unit,
                    "unit_price": float(unit_price),
                    "expected_total_cost": float(expected_total),
                    "actual_total_cost": float(actual_total),
                    "remarks": remarks
                })

                seen_codes.add(ingredient_code)
                total_expected += expected_total
                total_actual += actual_total

            if missing or not processed:
                db.rollback()
                error_message = "유효한 입고 항목이 없습니다" if not processed else \
                    f"다음 재료를 찾을 수 없습니다: {', '.join(missing)}"
                return {
                    "success": False,
                    "error": error_message,
                    "processed": [],
                    "missing": missing
                }

            totals_update = text("""
                UPDATE ingredient_intake_batches
                SET total_expected_cost = :total_expected,
                    total_actual_cost = :total_actual
                WHERE batch_id = CAST(:batch_id AS uuid)
            """)
            db.execute(totals_update, {
                "total_expected": total_expected,
                "total_actual": total_actual,
                "batch_id": batch_id
            })

            db.commit()

            return {
                "success": True,
                "batch_id": batch_id,
                "status": "AWAITING_COOK",
                "note": note,
                "processed": processed,
                "missing": missing,
                "duplicates": list(duplicate_codes),
                "total_expected_cost": float(total_expected),
                "total_actual_cost": float(total_actual),
                "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else None
            }

        except Exception as e:
            db.rollback()
            logger.error(f"입고 배치 생성 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"입고 배치 생성 실패: {str(e)}",
                "processed": []
            }

    def confirm_intake_batch(
        self,
        db,
        batch_id: str,
        cook_id: str,
        adjustments: Iterable[dict[str, Any]] | None = None,
        cook_note: str | None = None
    ) -> dict[str, Any]:
        """요리사가 입고 배치를 검수 및 확정"""
        try:
            store_id = self._get_main_store_id(db)
            if not store_id:
                return {
                    "success": False,
                    "error": "스토어를 찾을 수 없습니다"
                }

            batch_query = text("""
                SELECT batch_id::text, status, note
                FROM ingredient_intake_batches
                WHERE batch_id = CAST(:batch_id AS uuid)
            """)
            batch = db.execute(batch_query, {"batch_id": batch_id}).fetchone()

            if not batch:
                return {
                    "success": False,
                    "error": "입고 배치를 찾을 수 없습니다"
                }

            _, status, existing_note = batch
            if status != "AWAITING_COOK":
                return {
                    "success": False,
                    "error": "이미 처리된 입고 배치입니다"
                }

            item_query = text("""
                SELECT
                    i.intake_item_id::text,
                    i.ingredient_id::text,
                    ing.name,
                    i.expected_quantity,
                    i.actual_quantity,
                    i.unit_price,
                    i.remarks
                FROM ingredient_intake_items i
                JOIN ingredients ing ON ing.ingredient_id = i.ingredient_id
                WHERE i.batch_id = CAST(:batch_id AS uuid)
            """)
            rows = db.execute(item_query, {"batch_id": batch_id}).fetchall()

            if not rows:
                return {
                    "success": False,
                    "error": "입고 항목이 존재하지 않습니다"
                }

            item_map: dict[str, dict[str, Any]] = {}
            for row in rows:
                intake_item_id, ingredient_id, ingredient_code, expected_quantity, actual_quantity, unit_price, remarks = row
                item_map[intake_item_id] = {
                    "ingredient_id": ingredient_id,
                    "ingredient_code": ingredient_code,
                    "expected_quantity": self._to_decimal(expected_quantity),
                    "actual_quantity": self._to_decimal(actual_quantity),
                    "unit_price": self._to_decimal(unit_price),
                    "remarks": remarks
                }

            adjustments = list(adjustments or [])
            updated_items: list[dict[str, Any]] = []
            invalid_items: list[str] = []

            for adjustment in adjustments:
                intake_item_id = (adjustment.get("intake_item_id") or "").strip()
                if not intake_item_id or intake_item_id not in item_map:
                    invalid_items.append(intake_item_id or "UNKNOWN")
                    continue

                item_info = item_map[intake_item_id]
                actual_quantity = self._to_decimal(
                    adjustment.get("actual_quantity"),
                    item_info["actual_quantity"]
                )
                if actual_quantity < 0:
                    actual_quantity = Decimal("0.00")

                unit_price = adjustment.get("unit_price")
                if unit_price is not None:
                    item_info["unit_price"] = self._to_decimal(unit_price, item_info["unit_price"])

                if "remarks" in adjustment and adjustment.get("remarks") is not None:
                    item_info["remarks"] = adjustment.get("remarks")

                actual_total = (actual_quantity * item_info["unit_price"]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                update_item = text("""
                    UPDATE ingredient_intake_items
                    SET actual_quantity = :actual_quantity,
                        unit_price = :unit_price,
                        actual_total_cost = :actual_total_cost,
                        remarks = :remarks,
                        updated_at = NOW()
                    WHERE intake_item_id = CAST(:intake_item_id AS uuid)
                    RETURNING expected_total_cost, actual_total_cost
                """)
                db.execute(update_item, {
                    "actual_quantity": actual_quantity,
                    "unit_price": item_info["unit_price"],
                    "actual_total_cost": actual_total,
                    "remarks": item_info.get("remarks"),
                    "intake_item_id": intake_item_id
                })

                pricing_upsert = text("""
                    INSERT INTO ingredient_pricing (ingredient_code, unit_price)
                    VALUES (:ingredient_code, :unit_price)
                    ON CONFLICT (ingredient_code)
                    DO UPDATE SET unit_price = EXCLUDED.unit_price
                """)
                db.execute(pricing_upsert, {
                    "ingredient_code": item_info["ingredient_code"],
                    "unit_price": item_info["unit_price"]
                })

                item_map[intake_item_id]["actual_quantity"] = actual_quantity

                updated_items.append({
                    "intake_item_id": intake_item_id,
                    "ingredient_code": item_info["ingredient_code"],
                    "actual_quantity": float(actual_quantity),
                    "unit_price": float(item_info["unit_price"]),
                    "actual_total_cost": float(actual_total),
                    "remarks": item_info.get("remarks")
                })

            totals_query = text("""
                SELECT
                    COALESCE(SUM(expected_total_cost), 0) AS total_expected,
                    COALESCE(SUM(actual_total_cost), 0) AS total_actual
                FROM ingredient_intake_items
                WHERE batch_id = CAST(:batch_id AS uuid)
            """)
            totals = db.execute(totals_query, {"batch_id": batch_id}).fetchone()
            total_expected_cost = self._to_decimal(totals[0], Decimal("0.00"))
            total_actual_cost = self._to_decimal(totals[1], Decimal("0.00"))

            updated_note = existing_note
            if cook_note:
                appended = f"[COOK] {cook_note.strip()}"
                if existing_note:
                    updated_note = f"{existing_note.strip()}\n{appended}"
                else:
                    updated_note = appended

            batch_update = text("""
                UPDATE ingredient_intake_batches
                SET cook_id = CAST(:cook_id AS uuid),
                    status = 'COMPLETED',
                    reviewed_at = NOW(),
                    total_expected_cost = :total_expected_cost,
                    total_actual_cost = :total_actual_cost,
                    note = :note
                WHERE batch_id = CAST(:batch_id AS uuid)
            """)
            db.execute(batch_update, {
                "cook_id": cook_id,
                "total_expected_cost": total_expected_cost,
                "total_actual_cost": total_actual_cost,
                "note": updated_note,
                "batch_id": batch_id
            })

            inventory_update = text("""
                    INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
                    VALUES (CAST(:store_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                    ON CONFLICT (store_id, ingredient_id)
                    DO UPDATE SET quantity_on_hand = store_inventory.quantity_on_hand + :quantity
                    RETURNING quantity_on_hand
                """)

            inventory_results: list[dict[str, Any]] = []
            for intake_item_id, info in item_map.items():
                actual_quantity = info["actual_quantity"]
                ingredient_id = info["ingredient_id"]
                result = db.execute(inventory_update, {
                    "store_id": store_id,
                    "ingredient_id": ingredient_id,
                    "quantity": actual_quantity
                }).fetchone()

                inventory_results.append({
                    "intake_item_id": intake_item_id,
                    "ingredient_code": info["ingredient_code"],
                    "actual_quantity": float(actual_quantity),
                    "new_stock": float(result[0]) if result and result[0] is not None else None
                })

                db.commit()

            return {
                "success": True,
                "batch_id": batch_id,
                "updated_items": updated_items,
                "inventory": inventory_results,
                "invalid_items": invalid_items,
                "total_expected_cost": float(total_expected_cost),
                "total_actual_cost": float(total_actual_cost)
            }

        except Exception as e:
            db.rollback()
            logger.error(f"입고 배치 확정 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"입고 배치 확정 실패: {str(e)}"
            }

    def create_ingredient(
        self,
        db,
        name: str,
        unit: str,
        unit_price: float | Decimal,
        initial_stock: float | Decimal | None = None
    ) -> dict[str, Any]:
        """새로운 재료 등록 및 단가 설정"""
        try:
            name = name.strip()
            if not name:
                return {"success": False, "error": "재료 이름은 필수입니다"}

            unit = (unit or "piece").strip()
            unit_price_decimal = self._to_decimal(unit_price, Decimal("0"))
            if unit_price_decimal < 0:
                return {"success": False, "error": "단가는 0 이상이어야 합니다"}

            insert_query = text("""
                INSERT INTO ingredients (name, unit)
                VALUES (:name, :unit)
                ON CONFLICT (name) DO NOTHING
                RETURNING ingredient_id::text
            """)

            result = db.execute(insert_query, {"name": name, "unit": unit}).fetchone()

            if result:
                ingredient_id = result[0]
                created = True
            else:
                fetch_query = text("SELECT ingredient_id::text FROM ingredients WHERE name = :name")
                fetch_result = db.execute(fetch_query, {"name": name}).fetchone()
                if not fetch_result:

                    db.rollback()
                    return {"success": False, "error": "재료 정보를 확인할 수 없습니다"}
                ingredient_id = fetch_result[0]
                created = False

            pricing_upsert = text("""
                INSERT INTO ingredient_pricing (ingredient_code, unit_price)
                VALUES (:name, :unit_price)
                ON CONFLICT (ingredient_code)
                DO UPDATE SET unit_price = EXCLUDED.unit_price
            """)
            db.execute(pricing_upsert, {"name": name, "unit_price": unit_price_decimal})

            added_stock = None
            if initial_stock is not None:
                initial_stock_decimal = self._to_decimal(initial_stock, Decimal("0"))
                if initial_stock_decimal > 0:
                    store_id = self._get_main_store_id(db)
                    if store_id:
                        stock_query = text("""
                            INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
                            VALUES (CAST(:store_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                            ON CONFLICT (store_id, ingredient_id)
                            DO UPDATE SET quantity_on_hand = store_inventory.quantity_on_hand + :quantity
                            RETURNING quantity_on_hand
                        """)
                        stock_result = db.execute(stock_query, {
                            "store_id": store_id,
                            "ingredient_id": ingredient_id,
                            "quantity": initial_stock_decimal
                        }).fetchone()
                        added_stock = float(stock_result[0]) if stock_result and stock_result[0] is not None else None

            db.commit()

            return {
                "success": True,
                "ingredient_id": ingredient_id,
                "created": created,
                "name": name,
                "unit": unit,
                "unit_price": float(unit_price_decimal),
                "current_stock": added_stock
            }

        except Exception as e:
            db.rollback()
            logger.error(f"재료 생성 중 오류 발생: {e}")
            return {
                "success": False,
                "error": f"재료 생성 실패: {str(e)}"
            }

    def delete_ingredient(self, db: Session, ingredient_code: str) -> dict[str, Any]:
        """재료 삭제 (단가/재고 포함)"""
        try:
            normalized_code = (ingredient_code or "").strip()
            if not normalized_code:
                return {"success": False, "error": "재료 코드를 확인해주세요"}

            ingredient_query = text("""
                SELECT ingredient_id::text
                FROM ingredients
                WHERE name = :name
            """)
            ingredient_row = db.execute(ingredient_query, {"name": normalized_code}).fetchone()
            if not ingredient_row:
                return {"success": False, "error": "존재하지 않는 재료입니다"}

            ingredient_id = ingredient_row[0]

            pricing_delete = text("""
                DELETE FROM ingredient_pricing
                WHERE ingredient_code = :ingredient_code
            """)
            db.execute(pricing_delete, {"ingredient_code": normalized_code})

            inventory_delete = text("""
                DELETE FROM store_inventory
                WHERE ingredient_id = CAST(:ingredient_id AS uuid)
            """)
            db.execute(inventory_delete, {"ingredient_id": ingredient_id})

            delete_query = text("""
                DELETE FROM ingredients
                WHERE ingredient_id = CAST(:ingredient_id AS uuid)
            """)
            result = db.execute(delete_query, {"ingredient_id": ingredient_id})

            if result.rowcount == 0:
                db.rollback()
                return {"success": False, "error": "재료 삭제에 실패했습니다"}

            db.commit()
            return {"success": True, "ingredient_code": normalized_code}

        except Exception as exc:
            db.rollback()
            logger.error("재료 삭제 실패: %s", exc)
            return {"success": False, "error": f"재료 삭제 실패: {exc}"}

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
