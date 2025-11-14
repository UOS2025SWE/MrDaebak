"""이벤트(프로모션) 관리 서비스"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


EVENT_UPLOAD_DIR = Path(__file__).parent.parent / "static" / "events"
EVENT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class EventPayload:
    title: str
    description: str
    discount_label: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    tags: list[str] | None = None
    is_published: bool = True
    menu_discounts: list[dict[str, Any]] | None = None


class EventService:
    """프로모션 이벤트 관리를 위한 서비스 레이어"""

    _initialized: bool = False

    def _ensure_tables(self, db: Session) -> None:
        if EventService._initialized:
            return

        ddl_statements = [
            text(
                """
                CREATE TABLE IF NOT EXISTS event_promotions (
                    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    image_path TEXT,
                    discount_label TEXT,
                    start_date DATE,
                    end_date DATE,
                    tags JSONB DEFAULT '[]'::jsonb,
                    is_published BOOLEAN DEFAULT TRUE,
                    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
                """
            ),
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_event_promotions_published
                ON event_promotions(is_published)
                """
            ),
            text(
                """
                CREATE TABLE IF NOT EXISTS event_menu_discounts (
                    event_id UUID NOT NULL REFERENCES event_promotions(event_id) ON DELETE CASCADE,
                    menu_item_id UUID NOT NULL REFERENCES menu_items(menu_item_id) ON DELETE CASCADE,
                    discount_type VARCHAR(16) NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
                    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value >= 0),
                    created_at TIMESTAMP DEFAULT NOW(),
                    PRIMARY KEY (event_id, menu_item_id)
                )
                """
            ),
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_event_menu_discounts_menu
                ON event_menu_discounts(menu_item_id)
                """
            ),
            text(
                """
                CREATE TABLE IF NOT EXISTS event_side_dish_discounts (
                    event_id UUID NOT NULL REFERENCES event_promotions(event_id) ON DELETE CASCADE,
                    side_dish_id UUID NOT NULL REFERENCES side_dishes(side_dish_id) ON DELETE CASCADE,
                    discount_type VARCHAR(16) NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
                    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value >= 0),
                    created_at TIMESTAMP DEFAULT NOW(),
                    PRIMARY KEY (event_id, side_dish_id)
                )
                """
            ),
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_event_side_dish_discounts_dish
                ON event_side_dish_discounts(side_dish_id)
                """
            ),
        ]

        for statement in ddl_statements:
            db.execute(statement)
        db.commit()
        EventService._initialized = True

    def list_events(self, db: Session, *, include_unpublished: bool = False) -> list[dict[str, Any]]:
        self._ensure_tables(db)
        query = text(
            """
            SELECT
                event_id::text,
                title,
                description,
                image_path,
                discount_label,
                start_date,
                end_date,
                COALESCE(tags, '[]'::jsonb) AS tags,
                is_published,
                created_at,
                updated_at
            FROM event_promotions
            WHERE (:include_all OR is_published = TRUE)
            ORDER BY COALESCE(start_date, created_at) ASC, created_at DESC
            """
        )

        rows = db.execute(query, {"include_all": include_unpublished}).mappings().all()
        events: list[dict[str, Any]] = []
        for row in rows:
            event = dict(row)
            tags_value = event.get("tags")
            if isinstance(tags_value, str):
                try:
                    event["tags"] = json.loads(tags_value)
                except json.JSONDecodeError:
                    event["tags"] = []
            elif tags_value is None:
                event["tags"] = []
            events.append(event)

        event_ids = [event.get("event_id") for event in events if event.get("event_id")]
        discount_map: dict[str, list[dict[str, Any]]] = {}
        if event_ids:
            discount_map = self._fetch_event_discounts(db, event_ids)

        for event in events:
            event_id = event.get("event_id")
            event["menu_discounts"] = discount_map.get(event_id, [])

        return events

    def _fetch_event_discounts(self, db: Session, event_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        if not event_ids:
            return {}

        discount_map: dict[str, list[dict[str, Any]]] = {event_id: [] for event_id in event_ids}
        expanding_ids = tuple(event_ids)

        menu_query = text(
            """
            SELECT
                emd.event_id::text AS event_id,
                mi.menu_item_id::text AS menu_item_id,
                mi.code AS menu_code,
                mi.name AS menu_name,
                emd.discount_type,
                emd.discount_value
            FROM event_menu_discounts emd
            JOIN menu_items mi ON mi.menu_item_id = emd.menu_item_id
            WHERE emd.event_id IN :event_ids
            ORDER BY mi.name
            """
        ).bindparams(bindparam("event_ids", expanding=True))

        menu_rows = db.execute(menu_query, {"event_ids": expanding_ids}).mappings().all()
        for row in menu_rows:
            discount_map.setdefault(row["event_id"], []).append(
                {
                    "target_type": "MENU",
                    "menu_item_id": row["menu_item_id"],
                    "menu_code": row["menu_code"],
                    "menu_name": row["menu_name"],
                    "discount_type": row["discount_type"],
                    "discount_value": float(row["discount_value"]),
                }
            )

        side_query = text(
            """
            SELECT
                esd.event_id::text AS event_id,
                sd.side_dish_id::text AS side_dish_id,
                sd.code AS side_dish_code,
                sd.name AS side_dish_name,
                esd.discount_type,
                esd.discount_value
            FROM event_side_dish_discounts esd
            JOIN side_dishes sd ON sd.side_dish_id = esd.side_dish_id
            WHERE esd.event_id IN :event_ids
            ORDER BY sd.name
            """
        ).bindparams(bindparam("event_ids", expanding=True))

        side_rows = db.execute(side_query, {"event_ids": expanding_ids}).mappings().all()
        for row in side_rows:
            discount_map.setdefault(row["event_id"], []).append(
                {
                    "target_type": "SIDE_DISH",
                    "side_dish_id": row["side_dish_id"],
                    "side_dish_code": row["side_dish_code"],
                    "side_dish_name": row["side_dish_name"],
                    "discount_type": row["discount_type"],
                    "discount_value": float(row["discount_value"]),
                }
            )

        return {event_id: discounts for event_id, discounts in discount_map.items() if discounts}

    @staticmethod
    def _normalize_menu_discounts(discounts: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        if not discounts:
            return []

        normalized: list[dict[str, Any]] = []
        valid_types = {"PERCENT", "FIXED"}
        valid_targets = {"MENU", "SIDE_DISH"}
        seen_targets: dict[str, set[str]] = {target: set() for target in valid_targets}

        for entry in discounts:
            if not isinstance(entry, dict):
                continue

            target_type = str(entry.get("target_type") or entry.get("targetType") or "MENU").upper()
            if target_type not in valid_targets:
                raise HTTPException(status_code=400, detail="할인 대상 유형은 MENU 또는 SIDE_DISH 여야 합니다")

            if target_type == "MENU":
                target_id = str(
                    entry.get("target_id")
                    or entry.get("targetId")
                    or entry.get("menu_item_id")
                    or entry.get("menuItemId")
                    or ""
                ).strip()
                if not target_id:
                    raise HTTPException(status_code=400, detail="메뉴 할인 항목에 menu_item_id가 필요합니다")
            else:
                target_id = str(
                    entry.get("target_id")
                    or entry.get("targetId")
                    or entry.get("side_dish_id")
                    or entry.get("sideDishId")
                    or ""
                ).strip()
                if not target_id:
                    raise HTTPException(status_code=400, detail="사이드 메뉴 할인 항목에 side_dish_id가 필요합니다")

            if target_id in seen_targets[target_type]:
                raise HTTPException(status_code=400, detail="동일한 할인 대상에 대한 항목이 중복되었습니다")
            seen_targets[target_type].add(target_id)

            discount_type = str(entry.get("discount_type") or entry.get("discountType") or "").upper()
            if discount_type not in valid_types:
                raise HTTPException(status_code=400, detail="지원하지 않는 할인 유형입니다 (PERCENT, FIXED)")

            try:
                discount_value = float(entry.get("discount_value"))
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="할인 금액은 숫자여야 합니다")

            if discount_value <= 0:
                raise HTTPException(status_code=400, detail="할인 금액은 0보다 커야 합니다")
            if discount_type == "PERCENT" and discount_value > 100:
                raise HTTPException(status_code=400, detail="퍼센트 할인은 100을 초과할 수 없습니다")

            normalized_entry: dict[str, Any] = {
                "target_type": target_type,
                "discount_type": discount_type,
                "discount_value": discount_value,
            }

            if target_type == "MENU":
                normalized_entry["menu_item_id"] = target_id
            else:
                normalized_entry["side_dish_id"] = target_id

            normalized.append(normalized_entry)

        return normalized

    def _replace_menu_discounts(self, db: Session, event_id: str, discounts: list[dict[str, Any]] | None) -> None:
        normalized = self._normalize_menu_discounts(discounts)

        db.execute(
            text("DELETE FROM event_menu_discounts WHERE event_id = CAST(:event_id AS uuid)"),
            {"event_id": event_id},
        )
        db.execute(
            text("DELETE FROM event_side_dish_discounts WHERE event_id = CAST(:event_id AS uuid)"),
            {"event_id": event_id},
        )

        if not normalized:
            return

        insert_menu_query = text(
            """
            INSERT INTO event_menu_discounts (event_id, menu_item_id, discount_type, discount_value)
            VALUES (CAST(:event_id AS uuid), CAST(:menu_item_id AS uuid), :discount_type, :discount_value)
            """
        )

        insert_side_query = text(
            """
            INSERT INTO event_side_dish_discounts (event_id, side_dish_id, discount_type, discount_value)
            VALUES (CAST(:event_id AS uuid), CAST(:side_dish_id AS uuid), :discount_type, :discount_value)
            """
        )

        for entry in normalized:
            if entry.get("target_type") == "SIDE_DISH":
                db.execute(
                    insert_side_query,
                    {
                        "event_id": event_id,
                        "side_dish_id": entry["side_dish_id"],
                        "discount_type": entry["discount_type"],
                        "discount_value": entry["discount_value"],
                    },
                )
            else:
                db.execute(
                    insert_menu_query,
                    {
                        "event_id": event_id,
                        "menu_item_id": entry["menu_item_id"],
                        "discount_type": entry["discount_type"],
                        "discount_value": entry["discount_value"],
                    },
                )

    def create_event(self, db: Session, payload: EventPayload, created_by: str | None) -> dict[str, Any]:
        self._ensure_tables(db)
        query = text(
            """
            INSERT INTO event_promotions (
                title,
                description,
                discount_label,
                start_date,
                end_date,
                tags,
                is_published,
                created_by
            )
            VALUES (
                :title,
                :description,
                :discount_label,
                :start_date,
                :end_date,
                CAST(:tags AS jsonb),
                :is_published,
                CAST(:created_by AS uuid)
            )
            RETURNING event_id::text, created_at
            """
        )

        tags_json = json.dumps(payload.tags or [])
        try:
            result = db.execute(
                query,
                {
                    "title": payload.title,
                    "description": payload.description,
                    "discount_label": payload.discount_label,
                    "start_date": payload.start_date,
                    "end_date": payload.end_date,
                    "tags": tags_json,
                    "is_published": payload.is_published,
                    "created_by": created_by,
                },
            ).mappings().first()

            if not result:
                raise HTTPException(status_code=500, detail="이벤트 생성에 실패했습니다")

            event_id = result.get("event_id")
            if not event_id:
                raise HTTPException(status_code=500, detail="생성된 이벤트 ID를 확인할 수 없습니다")

            if payload.menu_discounts is not None:
                self._replace_menu_discounts(db, event_id, payload.menu_discounts)

            db.commit()

            return {
                "event_id": event_id,
                "created_at": result.get("created_at"),
                "message": "이벤트가 생성되었습니다."
            }
        except Exception:
            db.rollback()
            raise

    def update_event(
        self,
        db: Session,
        event_id: str,
        updates: dict[str, Any],
        menu_discounts: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        self._ensure_tables(db)

        allowed_fields = {"title", "description", "discount_label", "start_date", "end_date", "tags", "is_published"}
        set_clauses: list[str] = []
        params: dict[str, Any] = {"event_id": event_id}

        for key, value in updates.items():
            if key not in allowed_fields:
                continue
            if key == "tags":
                params["tags"] = json.dumps(value or [])
                set_clauses.append("tags = CAST(:tags AS jsonb)")
            else:
                params[key] = value
                set_clauses.append(f"{key} = :{key}")

        did_update = False

        try:
            if set_clauses:
                set_clauses.append("updated_at = NOW()")
                query = text(
                    "UPDATE event_promotions SET "
                    + ", ".join(set_clauses)
                    + " WHERE event_id = CAST(:event_id AS uuid) RETURNING event_id::text"
                )

                result = db.execute(query, params).fetchone()
                if not result:
                    raise HTTPException(status_code=404, detail="이벤트를 찾을 수 없습니다")
                did_update = True

            if menu_discounts is not None:
                self._replace_menu_discounts(db, event_id, menu_discounts)
                did_update = True

            if not did_update:
                return {"success": True}

            db.commit()
            return {"success": True}
        except Exception:
            db.rollback()
            raise

    def delete_event(self, db: Session, event_id: str) -> bool:
        self._ensure_tables(db)
        existing = db.execute(
            text(
                """
                SELECT image_path
                FROM event_promotions
                WHERE event_id = CAST(:event_id AS uuid)
                """
            ),
            {"event_id": event_id},
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="이벤트를 찾을 수 없습니다")

        db.execute(
            text("DELETE FROM event_promotions WHERE event_id = CAST(:event_id AS uuid)"),
            {"event_id": event_id},
        )
        db.commit()

        image_path = existing[0]
        if image_path and image_path.startswith("/api/events/images/"):
            filename = image_path.split("/api/events/images/")[-1]
            self._remove_image_file(filename)

        return True

    def attach_image(self, db: Session, event_id: str, filename: str) -> str:
        self._ensure_tables(db)
        existing = db.execute(
            text(
                """
                SELECT image_path
                FROM event_promotions
                WHERE event_id = CAST(:event_id AS uuid)
                """
            ),
            {"event_id": event_id},
        ).fetchone()

        if not existing:
            self._remove_image_file(filename)
            raise HTTPException(status_code=404, detail="이벤트를 찾을 수 없습니다")

        previous_path = existing[0]

        db.execute(
            text(
                """
                UPDATE event_promotions
                SET image_path = :image_path, updated_at = NOW()
                WHERE event_id = CAST(:event_id AS uuid)
                """
            ),
            {"event_id": event_id, "image_path": f"/api/events/images/{filename}"},
        )
        db.commit()

        if previous_path and previous_path.startswith("/api/events/images/"):
            old_filename = previous_path.split("/api/events/images/")[-1]
            if old_filename != filename:
                self._remove_image_file(old_filename)

        return f"/api/events/images/{filename}"

    def _remove_image_file(self, filename: str) -> None:
        try:
            target = EVENT_UPLOAD_DIR / filename
            if target.exists():
                target.unlink()
        except Exception as exc:
            logger.warning("이벤트 이미지 파일 삭제 실패 (%s): %s", filename, exc)

    def get_active_menu_discounts(
        self,
        db: Session,
        target_id: str,
        target_type: Literal["MENU", "SIDE_DISH"] = "MENU",
        *,
        on_date: date | None = None,
    ) -> list[dict[str, Any]]:
        """
        특정 메뉴 또는 사이드 메뉴에 대해 현재 적용 가능한 이벤트 할인 목록 조회.
        """
        self._ensure_tables(db)
        target_date = on_date or date.today()

        if target_type == "SIDE_DISH":
            side_query = text(
                """
                SELECT
                    esd.event_id::text AS event_id,
                    ep.title,
                    ep.discount_label,
                    ep.start_date,
                    ep.end_date,
                    esd.discount_type,
                    esd.discount_value,
                    sd.side_dish_id::text AS side_dish_id,
                    sd.code AS side_dish_code,
                    sd.name AS side_dish_name
                FROM event_side_dish_discounts esd
                INNER JOIN event_promotions ep ON ep.event_id = esd.event_id
                INNER JOIN side_dishes sd ON sd.side_dish_id = esd.side_dish_id
                WHERE esd.side_dish_id = CAST(:side_dish_id AS uuid)
                  AND ep.is_published = TRUE
                  AND (ep.start_date IS NULL OR ep.start_date <= :target_date)
                  AND (ep.end_date IS NULL OR ep.end_date >= :target_date)
                ORDER BY COALESCE(ep.start_date, ep.created_at) ASC
                """
            )

            side_rows = db.execute(
                side_query,
                {
                    "side_dish_id": target_id,
                    "target_date": target_date,
                },
            ).mappings().all()

            discounts: list[dict[str, Any]] = []
            for row in side_rows:
                record = dict(row)
                discount_value = record.get("discount_value")
                if discount_value is not None:
                    record["discount_value"] = float(discount_value)
                record["target_type"] = "SIDE_DISH"
                record["target_id"] = record.get("side_dish_id")
                record["target_name"] = record.get("side_dish_name")
                discounts.append(record)

            return discounts

        menu_query = text(
            """
            SELECT
                emd.event_id::text AS event_id,
                ep.title,
                ep.discount_label,
                ep.start_date,
                ep.end_date,
                emd.discount_type,
                emd.discount_value,
                mi.menu_item_id::text AS menu_item_id,
                mi.code AS menu_code,
                mi.name AS menu_name
            FROM event_menu_discounts emd
            INNER JOIN event_promotions ep ON ep.event_id = emd.event_id
            INNER JOIN menu_items mi ON mi.menu_item_id = emd.menu_item_id
            WHERE emd.menu_item_id = CAST(:menu_item_id AS uuid)
              AND ep.is_published = TRUE
              AND (ep.start_date IS NULL OR ep.start_date <= :target_date)
              AND (ep.end_date IS NULL OR ep.end_date >= :target_date)
            ORDER BY COALESCE(ep.start_date, ep.created_at) ASC
            """
        )

        menu_rows = db.execute(
            menu_query,
            {
                "menu_item_id": target_id,
                "target_date": target_date,
            },
        ).mappings().all()

        if not menu_rows:
            return []

        discounts: list[dict[str, Any]] = []
        active_event_ids: list[str] = []

        for row in menu_rows:
            record = dict(row)
            discount_value = record.get("discount_value")
            if discount_value is not None:
                record["discount_value"] = float(discount_value)
            record["target_type"] = "MENU"
            record["target_id"] = record.get("menu_item_id")
            record["target_name"] = record.get("menu_name")
            discounts.append(record)
            active_event_ids.append(record["event_id"])

        unique_event_ids = tuple(set(active_event_ids))
        if not unique_event_ids:
            return discounts

        side_query = text(
            """
            SELECT
                esd.event_id::text AS event_id,
                ep.title,
                ep.discount_label,
                ep.start_date,
                ep.end_date,
                esd.discount_type,
                esd.discount_value,
                sd.side_dish_id::text AS side_dish_id,
                sd.code AS side_dish_code,
                sd.name AS side_dish_name
            FROM event_side_dish_discounts esd
            INNER JOIN event_promotions ep ON ep.event_id = esd.event_id
            INNER JOIN side_dishes sd ON sd.side_dish_id = esd.side_dish_id
            WHERE esd.event_id IN :event_ids
            ORDER BY sd.name
            """
        ).bindparams(bindparam("event_ids", expanding=True))

        side_rows = db.execute(
            side_query,
            {"event_ids": unique_event_ids},
        ).mappings().all()

        for row in side_rows:
            record = dict(row)
            discount_value = record.get("discount_value")
            if discount_value is not None:
                record["discount_value"] = float(discount_value)
            record["target_type"] = "SIDE_DISH"
            record["target_id"] = record.get("side_dish_id")
            record["target_name"] = record.get("side_dish_name")
            discounts.append(record)

        return discounts

    def store_upload(self, upload_bytes: bytes, original_name: str) -> str:
        suffix = Path(original_name).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise HTTPException(status_code=400, detail="지원하지 않는 이미지 형식입니다. (jpg, png, webp)")

        filename = f"{uuid.uuid4().hex}{suffix}"
        target_path = EVENT_UPLOAD_DIR / filename
        target_path.write_bytes(upload_bytes)
        return filename


event_service = EventService()
