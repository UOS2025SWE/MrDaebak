"""고객 문의 라우터"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.inquiry_service import InquiryPayload, inquiry_service
from ..services.login_service import get_current_user

router = APIRouter(tags=["inquiries"])


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    topic: str = Field(..., min_length=1, max_length=120)
    message: str = Field(..., min_length=1, max_length=2000)


class InquiryUpdateRequest(BaseModel):
    status: str | None = Field(None, description="NEW, IN_PROGRESS, RESOLVED, ARCHIVED")
    manager_note: str | None = Field(None, max_length=2000)


@router.post("/contact", status_code=status.HTTP_201_CREATED)
async def create_contact(
    request: ContactRequest,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    payload = InquiryPayload(
        name=request.name,
        email=request.email,
        topic=request.topic,
        message=request.message,
    )
    created = inquiry_service.create_inquiry(db, payload)
    return {
        "success": True,
        "inquiry": {
            "id": created.get("inquiry_id"),
            "created_at": created.get("created_at"),
            "status": "NEW",
        },
        "message": "문의가 접수되었습니다."
    }


@router.get("/inquiries")
async def list_inquiries(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    status: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다")

    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    offset = (page - 1) * page_size

    result = inquiry_service.list_inquiries(db, status=status, limit=page_size, offset=offset)
    return {
        "success": True,
        "items": result["items"],
        "total": result["total"],
        "page": page,
        "page_size": page_size,
    }


@router.patch("/inquiries/{inquiry_id}")
async def update_inquiry(
    inquiry_id: str,
    request: InquiryUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="관리자만 수정할 수 있습니다")

    result = inquiry_service.update_inquiry(
        db,
        inquiry_id,
        status=request.status,
        manager_note=request.manager_note,
    )
    return {"success": True, **result}
