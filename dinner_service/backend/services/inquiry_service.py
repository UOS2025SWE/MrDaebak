"""고객 문의 서비스"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


@dataclass
class InquiryPayload:
    name: str
    email: str
    topic: str
    message: str


class InquiryService:
    """고객 문의 데이터를 다루는 서비스 레이어"""

    _initialized: bool = False

    def _ensure_table(self, db: Session) -> None:
        if InquiryService._initialized:
            return

        ddl_statements = [
            text(
                """
                CREATE TABLE IF NOT EXISTS customer_inquiries (
                    inquiry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    message TEXT NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'NEW',
                    manager_note TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
                """
            ),
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_customer_inquiries_status
                ON customer_inquiries(status)
                """
            ),
        ]

        for statement in ddl_statements:
            db.execute(statement)
        db.commit()
        InquiryService._initialized = True

    def create_inquiry(self, db: Session, payload: InquiryPayload) -> dict[str, Any]:
        self._ensure_table(db)
        query = text(
            """
            INSERT INTO customer_inquiries (name, email, topic, message)
            VALUES (:name, :email, :topic, :message)
            RETURNING inquiry_id::text, created_at
            """
        )

        result = db.execute(
            query,
            {
                "name": payload.name,
                "email": payload.email,
                "topic": payload.topic,
                "message": payload.message,
            },
        ).mappings().first()
        db.commit()

        if not result:
            raise HTTPException(status_code=500, detail="문의 저장에 실패했습니다")

        return {
            "inquiry_id": result.get("inquiry_id"),
            "created_at": result.get("created_at"),
            "status": "NEW",
            "message": "고객 문의가 접수되었습니다."
        }

    def list_inquiries(self, db: Session, *, status: str | None = None, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        self._ensure_table(db)
        filters = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if status and status.upper() != "ALL":
            filters.append("status = :status")
            params["status"] = status.upper()

        where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

        query = text(
            f"""
            SELECT
                inquiry_id::text,
                name,
                email,
                topic,
                message,
                status,
                manager_note,
                created_at,
                updated_at
            FROM customer_inquiries
            {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """
        )

        rows = db.execute(query, params).mappings().all()

        count_query = text(
            f"SELECT COUNT(*) FROM customer_inquiries {where_clause}"
        )
        total = db.execute(count_query, params).scalar_one()

        return {
            "items": [dict(row) for row in rows],
            "total": total,
        }

    def update_inquiry(self, db: Session, inquiry_id: str, *, status: str | None = None, manager_note: str | None = None) -> dict[str, Any]:
        self._ensure_table(db)
        if status is None and manager_note is None:
            return {"success": True}

        updates = []
        params: dict[str, Any] = {"inquiry_id": inquiry_id}

        if status is not None:
            allowed_status = {"NEW", "IN_PROGRESS", "RESOLVED", "ARCHIVED"}
            normalized = status.upper()
            if normalized not in allowed_status:
                raise HTTPException(status_code=400, detail="지원하지 않는 상태 값입니다")
            params["status"] = normalized
            updates.append("status = :status")

        if manager_note is not None:
            params["manager_note"] = manager_note
            updates.append("manager_note = :manager_note")

        updates.append("updated_at = NOW()")

        set_clause = ", ".join(updates)
        query = text(
            f"""
            UPDATE customer_inquiries
            SET {set_clause}
            WHERE inquiry_id = CAST(:inquiry_id AS uuid)
            RETURNING inquiry_id::text
            """
        )

        result = db.execute(query, params).fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="문의 내역을 찾을 수 없습니다")
        db.commit()
        return {"success": True}


inquiry_service = InquiryService()
