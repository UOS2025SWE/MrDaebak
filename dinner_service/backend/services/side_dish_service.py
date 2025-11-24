"""Side dish management service"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Iterable, Dict

from sqlalchemy import text
from sqlalchemy.orm import Session

# Removed: from .menu_service import MENU_BASE_INGREDIENTS (as per DB grounding plan)
# Replaced with DB-based lookups via MenuService or direct query if needed

logger = logging.getLogger(__name__)


class SideDishService:
    """Side dish operations including creation, lookup, and ingredient mapping"""

    CUSTOM_CAKE_CODE = "custom_cake"
    CUSTOM_CAKE_NAME = "커스터마이징 케이크"
    CUSTOM_CAKE_DESCRIPTION = "맞춤 메시지와 이미지를 지원하는 케이크 옵션"
    DEFAULT_CAKE_STYLE = "simple"

    # Removed hardcoded dictionaries as they are now in the DB (custom_cake_recipes table)
    # CUSTOM_CAKE_FLAVORS, CUSTOM_CAKE_SIZES, DEFAULT_CUSTOM_CAKE_RECIPES removed.

    def get_valid_flavors(self, db: Session) -> list[dict[str, str]]:
        """DB에서 유효한 케이크 맛 목록 조회"""
        # Since we don't have a separate flavors table, we can extract distinct flavors from recipes
        # Or simply return a standard list if we want to enforce specific options, but ideally this should be DB driven.
        # For now, let's query distinct flavors from custom_cake_recipes
        query = text(
            "SELECT DISTINCT flavor FROM custom_cake_recipes ORDER BY flavor")
        rows = db.execute(query).fetchall()

        # Mapping for display names (could also be in DB, but simple map here is safer than hardcoding entire recipes)
        # Ideally flavor metadata table would be better, but extracting from recipes is a good start for grounding.
        flavor_names = {
            "vanilla": "바닐라",
            "chocolate": "초콜릿",
            "red_velvet": "레드벨벳",
            "green_tea": "녹차"
        }

        return [{"code": row[0], "name": flavor_names.get(row[0], row[0])} for row in rows]

    def get_valid_sizes(self, db: Session) -> list[dict[str, str]]:
        """DB에서 유효한 케이크 사이즈 목록 조회"""
        query = text(
            "SELECT DISTINCT size FROM custom_cake_recipes ORDER BY size")
        rows = db.execute(query).fetchall()

        size_names = {
            "size_1": "1호 (2~3인)",
            "size_2": "2호 (3~4인)",
            "size_3": "3호 (4~6인)"
        }

        return [{"code": row[0], "name": size_names.get(row[0], row[0])} for row in rows]

    def ensure_custom_cake_side_dish(self, db: Session) -> None:
        """Ensure the custom cake side dish exists so it can be selected like other side dishes."""
        self._ensure_side_dish_schema(db)
        self._ensure_custom_cake_recipe_schema(db)
        # self._ensure_default_custom_cake_recipes(db) # Removed as seeding is now in init.sql

        try:
            check_query = text(
                """
                SELECT side_dish_id::text
                FROM side_dishes
                WHERE code = :code
                """
            )
            existing = db.execute(
                check_query, {"code": self.CUSTOM_CAKE_CODE}).fetchone()
            side_dish_id = existing[0] if existing else None
            created_new = False

            if not side_dish_id:
                base_price_decimal = Decimal("42000.00")
                insert_side_dish = text(
                    """
                    INSERT INTO side_dishes (code, name, description, base_price, is_available)
                    VALUES (:code, :name, :description, :base_price, TRUE)
                    ON CONFLICT (code) DO NOTHING
                    RETURNING side_dish_id::text
                    """
                )
                inserted = db.execute(
                    insert_side_dish,
                    {
                        "code": self.CUSTOM_CAKE_CODE,
                        "name": self.CUSTOM_CAKE_NAME,
                        "description": self.CUSTOM_CAKE_DESCRIPTION,
                        "base_price": base_price_decimal,
                    },
                ).fetchone()

                if inserted:
                    side_dish_id = inserted[0]
                    created_new = True
                else:
                    existing = db.execute(
                        check_query, {"code": self.CUSTOM_CAKE_CODE}).fetchone()
                    if not existing:
                        db.rollback()
                        logger.error(
                            "Failed to insert or locate custom cake side dish record")
                        return
                    side_dish_id = existing[0]

            variant_price = self._calculate_custom_cake_variant_price(
                db, "vanilla", "size_1")
            update_price_query = text(
                """
                UPDATE side_dishes
                SET base_price = :base_price
                WHERE side_dish_id = CAST(:side_dish_id AS uuid)
                """
            )
            db.execute(update_price_query, {
                       "base_price": variant_price, "side_dish_id": side_dish_id})

            if created_new:
                recipe_query = text(
                    """
                    SELECT ingredient_code, quantity
                    FROM custom_cake_recipes
                    WHERE flavor = 'vanilla' AND size = 'size_1'
                    """
                )
                ingredient_rows = db.execute(recipe_query).fetchall()

                insert_ingredient = text(
                    """
                    INSERT INTO side_dish_ingredients (side_dish_id, ingredient_id, quantity)
                    VALUES (CAST(:side_dish_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                    ON CONFLICT (side_dish_id, ingredient_id)
                    DO UPDATE SET quantity = EXCLUDED.quantity
                    """
                )
                ingredient_lookup = text(
                    """
                    SELECT ingredient_id::text
                    FROM ingredients
                    WHERE name = :name
                    """
                )

                for ingredient_code, quantity in ingredient_rows:
                    ingredient_row = db.execute(
                        ingredient_lookup, {"name": ingredient_code}
                    ).fetchone()
                    if not ingredient_row:
                        logger.warning(
                            "Custom cake setup skipped missing ingredient: %s", ingredient_code
                        )
                        continue

                    db.execute(
                        insert_ingredient,
                        {
                            "side_dish_id": side_dish_id,
                            "ingredient_id": ingredient_row[0],
                            "quantity": Decimal(str(quantity)),
                        },
                    )

            db.commit()
            logger.info("Custom cake side dish ensured with code '%s'",
                        self.CUSTOM_CAKE_CODE)

        except Exception as exc:
            db.rollback()
            logger.error("Failed to ensure custom cake side dish: %s", exc)

    def list_side_dishes(self, db: Session, include_inactive: bool = False) -> dict[str, Any]:
        try:
            # Make sure the custom cake side dish is always available
            self.ensure_custom_cake_side_dish(db)

            query = text(
                """
                SELECT
                    sd.side_dish_id::text,
                    sd.code,
                    sd.name,
                    sd.description,
                    sd.base_price,
                    sd.is_available,
                    sd.created_at,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'ingredient_id', i.ingredient_id::text,
                                'ingredient_code', i.name,
                                'quantity', sdi.quantity
                            )
                            ORDER BY i.name
                        ) FILTER (WHERE sdi.ingredient_id IS NOT NULL),
                        '[]'::json
                    ) AS ingredients
                FROM side_dishes sd
                LEFT JOIN side_dish_ingredients sdi ON sdi.side_dish_id = sd.side_dish_id
                LEFT JOIN ingredients i ON i.ingredient_id = sdi.ingredient_id
                WHERE (:include_inactive = TRUE OR sd.is_available = TRUE)
                GROUP BY sd.side_dish_id
                ORDER BY sd.created_at DESC
                """
            )

            rows = db.execute(
                query, {"include_inactive": include_inactive}).fetchall()

            data: list[dict[str, Any]] = []
            for row in rows:
                ingredients = row[7]
                if isinstance(ingredients, str):
                    import json

                    try:
                        ingredients = json.loads(ingredients)
                    except json.JSONDecodeError:
                        ingredients = []

                data.append({
                    "side_dish_id": row[0],
                    "code": row[1],
                    "name": row[2],
                    "description": row[3],
                    "base_price": float(row[4]) if row[4] is not None else 0.0,
                    "is_available": row[5],
                    "created_at": row[6].isoformat() if row[6] else None,
                    "ingredients": ingredients or []
                })

            return {"success": True, "data": data, "count": len(data)}

        except Exception as exc:
            logger.error("사이드 디시 목록 조회 실패: %s", exc)
            return {"success": False, "error": str(exc), "data": [], "count": 0}

    def create_side_dish(
        self,
        db: Session,
        manager_id: str | None,
        code: str,
        name: str,
        description: str | None,
        base_price: Decimal | float,
        ingredients: Iterable[dict[str, Any]]
    ) -> dict[str, Any]:
        self._ensure_side_dish_schema(db)
        try:
            normalized_code = code.strip().lower()
            if not normalized_code:
                return {"success": False, "error": "코드는 필수입니다"}

            cleaned_name = name.strip()
            if not cleaned_name:
                return {"success": False, "error": "이름은 필수입니다"}

            ingredient_items = [item for item in ingredients if item]
            if not ingredient_items:
                return {"success": False, "error": "사이드 디시에 최소 한 개의 재료가 필요합니다"}

            base_price_decimal = Decimal(
                str(base_price)).quantize(Decimal("0.01"))

            insert_side_dish = text(
                """
                INSERT INTO side_dishes (code, name, description, base_price, created_by)
                VALUES (:code, :name, :description, :base_price, CAST(:manager_id AS uuid))
                RETURNING side_dish_id::text
                """
            )

            result = db.execute(insert_side_dish, {
                "code": normalized_code,
                "name": cleaned_name,
                "description": description,
                "base_price": base_price_decimal,
                "manager_id": manager_id
            }).fetchone()

            if not result:
                db.rollback()
                return {"success": False, "error": "사이드 디시 생성에 실패했습니다"}

            side_dish_id = result[0]
            ingredient_records: list[dict[str, Any]] = []

            for item in ingredient_items:
                ingredient_code = (item.get("ingredient_code") or "").strip()
                quantity = item.get("quantity")

                if not ingredient_code:
                    db.rollback()
                    return {"success": False, "error": "재료 코드가 누락되었습니다"}

                quantity_decimal = Decimal(
                    str(quantity)).quantize(Decimal("0.01"))
                if quantity_decimal <= 0:
                    db.rollback()
                    return {"success": False, "error": f"재료 수량이 0 이하입니다: {ingredient_code}"}

                ingredient_lookup = text(
                    """
                    SELECT ingredient_id::text
                    FROM ingredients
                    WHERE name = :name
                    """
                )
                ingredient_row = db.execute(
                    ingredient_lookup, {"name": ingredient_code}).fetchone()
                if not ingredient_row:
                    db.rollback()
                    return {"success": False, "error": f"재료를 찾을 수 없습니다: {ingredient_code}"}

                ingredient_id = ingredient_row[0]

                insert_ingredient = text(
                    """
                    INSERT INTO side_dish_ingredients (side_dish_id, ingredient_id, quantity)
                    VALUES (CAST(:side_dish_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                    ON CONFLICT (side_dish_id, ingredient_id)
                    DO UPDATE SET quantity = EXCLUDED.quantity
                    RETURNING quantity
                    """
                )
                db.execute(insert_ingredient, {
                    "side_dish_id": side_dish_id,
                    "ingredient_id": ingredient_id,
                    "quantity": quantity_decimal
                })

                ingredient_records.append({
                    "ingredient_id": ingredient_id,
                    "ingredient_code": ingredient_code,
                    "quantity": float(quantity_decimal)
                })

            db.commit()

            return {
                "success": True,
                "side_dish_id": side_dish_id,
                "code": normalized_code,
                "name": cleaned_name,
                "description": description,
                "base_price": float(base_price_decimal),
                "ingredients": ingredient_records
            }

        except Exception as exc:
            db.rollback()
            logger.error("사이드 디시 생성 실패: %s", exc)
            return {"success": False, "error": f"사이드 디시 생성 실패: {exc}"}

    def set_availability(self, db: Session, side_dish_id: str, is_available: bool) -> dict[str, Any]:
        try:
            update_query = text(
                """
                UPDATE side_dishes
                SET is_available = :is_available,
                    updated_at = NOW()
                WHERE side_dish_id = CAST(:side_dish_id AS uuid)
                RETURNING side_dish_id::text
                """
            )

            result = db.execute(update_query, {
                "is_available": is_available,
                "side_dish_id": side_dish_id
            }).fetchone()

            if not result:
                db.rollback()
                return {"success": False, "error": "사이드 디시를 찾을 수 없습니다"}

            db.commit()
            return {"success": True, "side_dish_id": result[0], "is_available": is_available}

        except Exception as exc:
            db.rollback()
            logger.error("사이드 디시 상태 변경 실패: %s", exc)
            return {"success": False, "error": f"상태 변경 실패: {exc}"}

    def get_side_dish_by_code(self, db: Session, code: str) -> dict[str, Any] | None:
        if code == self.CUSTOM_CAKE_CODE:
            self.ensure_custom_cake_side_dish(db)
        query = text(
            """
            SELECT
                sd.side_dish_id::text,
                sd.code,
                sd.name,
                sd.base_price,
                sd.is_available,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'ingredient_code', ing.name,
                            'ingredient_id', ing.ingredient_id::text,
                            'quantity', sdi.quantity
                        )
                        ORDER BY ing.name
                    ) FILTER (WHERE sdi.ingredient_id IS NOT NULL),
                    '[]'::json
                ) AS ingredients
            FROM side_dishes sd
            LEFT JOIN side_dish_ingredients sdi ON sdi.side_dish_id = sd.side_dish_id
            LEFT JOIN ingredients ing ON ing.ingredient_id = sdi.ingredient_id
            WHERE sd.code = :code
            GROUP BY sd.side_dish_id
            """
        )

        row = db.execute(query, {"code": code}).fetchone()
        if not row:
            return None

        import json

        ingredients = row[5]
        if isinstance(ingredients, str):
            try:
                ingredients = json.loads(ingredients)
            except json.JSONDecodeError:
                ingredients = []

        return {
            "side_dish_id": row[0],
            "code": row[1],
            "name": row[2],
            "base_price": Decimal(str(row[3])) if row[3] is not None else Decimal("0"),
            "is_available": bool(row[4]),
            "ingredients": ingredients or []
        }

    def upsert_side_dish_ingredient(
        self,
        db: Session,
        side_dish_id: str,
        ingredient_code: str,
        quantity: Decimal | float
    ) -> dict[str, Any]:
        self._ensure_side_dish_schema(db)
        try:
            normalized_id = (side_dish_id or "").strip()
            if not normalized_id:
                return {"success": False, "error": "사이드 메뉴를 찾을 수 없습니다"}

            normalized_ingredient_code = ingredient_code.strip()
            if not normalized_ingredient_code:
                return {"success": False, "error": "재료 코드를 확인해주세요"}

            try:
                quantity_decimal = Decimal(
                    str(quantity)).quantize(Decimal("0.01"))
            except Exception:
                return {"success": False, "error": "수량 형식이 올바르지 않습니다"}

            if quantity_decimal <= 0:
                return {"success": False, "error": "수량은 0보다 커야 합니다"}

            side_dish_check = text(
                """
                SELECT side_dish_id
                FROM side_dishes
                WHERE side_dish_id = CAST(:side_dish_id AS uuid)
                """
            )
            exists = db.execute(
                side_dish_check, {"side_dish_id": normalized_id}).fetchone()
            if not exists:
                return {"success": False, "error": "사이드 메뉴를 찾을 수 없습니다"}

            ingredient_lookup = text(
                """
                SELECT ingredient_id::text
                FROM ingredients
                WHERE name = :name
                """
            )
            ingredient_row = db.execute(
                ingredient_lookup, {"name": normalized_ingredient_code}).fetchone()
            if not ingredient_row:
                return {"success": False, "error": "존재하지 않는 재료입니다"}

            ingredient_id = ingredient_row[0]

            upsert_query = text(
                """
                INSERT INTO side_dish_ingredients (side_dish_id, ingredient_id, quantity)
                VALUES (CAST(:side_dish_id AS uuid), CAST(:ingredient_id AS uuid), :quantity)
                ON CONFLICT (side_dish_id, ingredient_id)
                DO UPDATE SET quantity = EXCLUDED.quantity
                """
            )
            db.execute(upsert_query, {
                "side_dish_id": normalized_id,
                "ingredient_id": ingredient_id,
                "quantity": quantity_decimal
            })

            db.commit()
            return {
                "success": True,
                "side_dish_id": normalized_id,
                "ingredient_code": normalized_ingredient_code,
                "quantity": float(quantity_decimal)
            }

        except Exception as exc:
            db.rollback()
            logger.error("사이드 디시 재료 업데이트 실패: %s", exc)
            return {"success": False, "error": f"재료 업데이트 실패: {exc}"}

    def remove_side_dish_ingredient(
        self,
        db: Session,
        side_dish_id: str,
        ingredient_code: str
    ) -> dict[str, Any]:
        self._ensure_side_dish_schema(db)
        try:
            normalized_id = (side_dish_id or "").strip()
            normalized_ingredient_code = ingredient_code.strip()
            if not normalized_id or not normalized_ingredient_code:
                return {"success": False, "error": "삭제할 대상 정보를 확인해주세요"}

            delete_query = text(
                """
                DELETE FROM side_dish_ingredients
                WHERE side_dish_id = CAST(:side_dish_id AS uuid)
                  AND ingredient_id = (
                    SELECT ingredient_id
                    FROM ingredients
                    WHERE name = :ingredient_code
                  )
                """
            )
            result = db.execute(delete_query, {
                "side_dish_id": normalized_id,
                "ingredient_code": normalized_ingredient_code
            })

            if result.rowcount == 0:
                db.rollback()
                return {"success": False, "error": "구성에서 해당 재료를 찾을 수 없습니다"}

            db.commit()
            return {
                "success": True,
                "side_dish_id": normalized_id,
                "ingredient_code": normalized_ingredient_code
            }

        except Exception as exc:
            db.rollback()
            logger.error("사이드 디시 재료 삭제 실패: %s", exc)
            return {"success": False, "error": f"재료 삭제 실패: {exc}"}

    def delete_side_dish(self, db: Session, side_dish_id: str) -> dict[str, Any]:
        try:
            normalized_id = (side_dish_id or "").strip()
            if not normalized_id:
                return {"success": False, "error": "사이드 디시 ID를 확인해주세요"}

            self._ensure_side_dish_schema(db)

            check_query = text(
                """
                SELECT code FROM side_dishes
                WHERE side_dish_id = CAST(:side_dish_id AS uuid)
                """
            )
            row = db.execute(
                check_query, {"side_dish_id": normalized_id}).fetchone()
            if not row:
                return {"success": False, "error": "사이드 디시를 찾을 수 없습니다"}

            if row[0] == self.CUSTOM_CAKE_CODE:
                return {"success": False, "error": "커스터마이징 케이크는 삭제할 수 없습니다"}

            delete_query = text(
                """
                DELETE FROM side_dishes
                WHERE side_dish_id = CAST(:side_dish_id AS uuid)
                """
            )
            db.execute(delete_query, {"side_dish_id": normalized_id})
            db.commit()
            return {"success": True}
        except Exception as exc:
            db.rollback()
            logger.error("사이드 디시 삭제 실패: %s", exc)
            return {"success": False, "error": f"사이드 디시 삭제 실패: {exc}"}

    def _ensure_side_dish_schema(self, db: Session) -> None:
        """Ensure the side_dish_ingredients relation exists."""
        ddl_statements = [
            """
            CREATE TABLE IF NOT EXISTS side_dish_ingredients (
                side_dish_id UUID NOT NULL REFERENCES side_dishes(side_dish_id) ON DELETE CASCADE,
                ingredient_id UUID NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
                quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (side_dish_id, ingredient_id)
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_side_dish_ingredients_side
                ON side_dish_ingredients(side_dish_id)
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_side_dish_ingredients_ingredient
                ON side_dish_ingredients(ingredient_id)
            """
        ]

        for statement in ddl_statements:
            db.execute(text(statement))
        db.commit()

    def get_custom_cake_recipes(self, db: Session) -> dict[str, Any]:
        self._ensure_custom_cake_recipe_schema(db)
        # Default recipe seeding is handled by init.sql now

        query = text(
            """
            SELECT
                ccr.flavor,
                ccr.size,
                ccr.ingredient_code,
                ccr.quantity,
                COALESCE(ip.unit_price, 0) AS unit_price
            FROM custom_cake_recipes ccr
            LEFT JOIN ingredient_pricing ip ON ip.ingredient_code = ccr.ingredient_code
            ORDER BY ccr.flavor, ccr.size, ccr.ingredient_code
            """
        )
        rows = db.execute(query).fetchall()
        recipe_map: dict[str, dict[str, dict[str, Any]]] = {}
        for flavor, size, ingredient_code, quantity, unit_price in rows:
            flavor_key = (flavor or "").strip()
            size_key = (size or "").strip()
            if not flavor_key or not size_key:
                continue
            if flavor_key not in recipe_map:
                recipe_map[flavor_key] = {}
            if size_key not in recipe_map[flavor_key]:
                recipe_map[flavor_key][size_key] = {
                    "ingredients": [],
                    "price": Decimal("0.00")
                }

            variant_entry = recipe_map[flavor_key][size_key]
            ingredient_quantity = Decimal(str(quantity or 0))
            ingredient_unit_price = Decimal(str(unit_price or 0))
            variant_entry["ingredients"].append({
                "ingredient_code": ingredient_code,
                "quantity": float(quantity)
            })
            variant_entry["price"] += ingredient_quantity * \
                ingredient_unit_price

        for flavor_dict in recipe_map.values():
            for variant_entry in flavor_dict.values():
                price_decimal = variant_entry.get("price", Decimal("0.00"))
                variant_entry["price"] = float(
                    price_decimal.quantize(Decimal("0.01")))

        return {
            "success": True,
            "data": recipe_map
        }

    def upsert_custom_cake_recipe(
        self,
        db: Session,
        flavor: str,
        size: str,
        ingredient_code: str,
        quantity: Decimal | float | int
    ) -> dict[str, Any]:
        self._ensure_custom_cake_recipe_schema(db)
        try:
            normalized_flavor = (flavor or "").strip()
            normalized_size = (size or "").strip()
            normalized_ingredient = (ingredient_code or "").strip()
            if not normalized_flavor or not normalized_size or not normalized_ingredient:
                return {"success": False, "error": "맛, 사이즈, 재료 정보를 확인해주세요"}

            quantity_decimal = Decimal(str(quantity))
            if quantity_decimal <= 0:
                return {"success": False, "error": "수량은 0보다 커야 합니다"}

            ingredient_lookup = text(
                """
                SELECT ingredient_id::text
                FROM ingredients
                WHERE name = :name
                """
            )
            ingredient_row = db.execute(
                ingredient_lookup, {"name": normalized_ingredient}).fetchone()
            if not ingredient_row:
                return {"success": False, "error": "존재하지 않는 재료입니다"}

            upsert_query = text(
                """
                INSERT INTO custom_cake_recipes (flavor, size, ingredient_code, quantity)
                VALUES (:flavor, :size, :ingredient_code, :quantity)
                ON CONFLICT (flavor, size, ingredient_code)
                DO UPDATE SET quantity = EXCLUDED.quantity
                """
            )
            db.execute(
                upsert_query,
                {
                    "flavor": normalized_flavor,
                    "size": normalized_size,
                    "ingredient_code": normalized_ingredient,
                    "quantity": quantity_decimal,
                },
            )
            db.commit()
            return {
                "success": True,
                "flavor": normalized_flavor,
                "size": normalized_size,
                "ingredient_code": normalized_ingredient,
                "quantity": float(quantity_decimal),
            }
        except Exception as exc:
            db.rollback()
            logger.error("커스텀 케이크 레시피 저장 실패: %s", exc)
            return {"success": False, "error": f"레시피 저장 실패: {exc}"}

    def remove_custom_cake_recipe(
        self,
        db: Session,
        flavor: str,
        size: str,
        ingredient_code: str
    ) -> dict[str, Any]:
        self._ensure_custom_cake_recipe_schema(db)
        try:
            normalized_flavor = (flavor or "").strip()
            normalized_size = (size or "").strip()
            normalized_ingredient = (ingredient_code or "").strip()
            if not normalized_flavor or not normalized_size or not normalized_ingredient:
                return {"success": False, "error": "맛, 사이즈, 재료 정보를 확인해주세요"}

            delete_query = text(
                """
                DELETE FROM custom_cake_recipes
                WHERE flavor = :flavor
                  AND size = :size
                  AND ingredient_code = :ingredient_code
                RETURNING flavor
                """
            )
            result = db.execute(
                delete_query,
                {
                    "flavor": normalized_flavor,
                    "size": normalized_size,
                    "ingredient_code": normalized_ingredient,
                },
            ).fetchone()
            if not result:
                db.rollback()
                return {"success": False, "error": "해당 레시피 구성을 찾을 수 없습니다"}

            db.commit()
            return {"success": True}
        except Exception as exc:
            db.rollback()
            logger.error("커스텀 케이크 레시피 삭제 실패: %s", exc)
            return {"success": False, "error": f"레시피 삭제 실패: {exc}"}

    def get_custom_cake_recipe_variant(
        self,
        db: Session,
        flavor: str | None,
        size: str | None
    ) -> list[dict[str, Any]]:
        self._ensure_custom_cake_recipe_schema(db)
        if not flavor or not size:
            return []
        query = text(
            """
            SELECT ingredient_code, quantity
            FROM custom_cake_recipes
            WHERE flavor = :flavor AND size = :size
            ORDER BY ingredient_code
            """
        )
        rows = db.execute(query, {"flavor": flavor, "size": size}).fetchall()

        # Fallback is removed as recipes are DB-grounded
        return [
            {
                "ingredient_code": row[0],
                "quantity": float(row[1]),
            }
            for row in rows
        ]

    def _ensure_custom_cake_recipe_schema(self, db: Session) -> None:
        ddl_statements = [
            """
            CREATE TABLE IF NOT EXISTS custom_cake_recipes (
                recipe_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                flavor TEXT NOT NULL,
                size TEXT NOT NULL,
                ingredient_code TEXT NOT NULL REFERENCES ingredients(name) ON DELETE CASCADE,
                quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
                UNIQUE (flavor, size, ingredient_code)
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_custom_cake_recipes_flavor_size
                ON custom_cake_recipes(flavor, size)
            """
        ]

        for statement in ddl_statements:
            db.execute(text(statement))
        db.commit()

    def _calculate_custom_cake_variant_price(
        self,
        db: Session,
        flavor: str,
        size: str
    ) -> Decimal:
        view_query = text(
            """
            SELECT COALESCE(total_price, 0)
            FROM custom_cake_variant_prices
            WHERE flavor = :flavor AND size = :size
            """
        )
        row = db.execute(
            view_query, {"flavor": flavor, "size": size}).fetchone()
        if row and row[0] is not None:
            return Decimal(str(row[0])).quantize(Decimal("0.01"))

        query = text(
            """
            SELECT COALESCE(SUM(ccr.quantity * COALESCE(ip.unit_price, 0)), 0)
            FROM custom_cake_recipes ccr
            LEFT JOIN ingredient_pricing ip ON ip.ingredient_code = ccr.ingredient_code
            WHERE flavor = :flavor AND size = :size
            """
        )
        row = db.execute(query, {"flavor": flavor, "size": size}).fetchone()
        if not row:
            return Decimal("0.00")
        return Decimal(str(row[0] or 0)).quantize(Decimal("0.01"))


side_dish_service = SideDishService()
