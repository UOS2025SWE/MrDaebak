"""프로모션 이벤트 라우터"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from enum import Enum

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, root_validator, validator
from sqlalchemy.orm import Session

from ..services.database import get_db
from ..services.event_service import EVENT_UPLOAD_DIR, EventPayload, event_service
from ..services.login_service import get_current_user

router = APIRouter(tags=["events"])


class EventMenuDiscountItem(BaseModel):
    target_type: Literal["MENU", "SIDE_DISH"] = "MENU"
    target_id: str | None = Field(None, description="할인 대상 ID (UUID)")
    menu_item_id: str | None = Field(None, description="할인 대상 메뉴 ID (UUID)")
    side_dish_id: str | None = Field(None, description="할인 대상 사이드 메뉴 ID (UUID)")
    discount_type: Literal["PERCENT", "FIXED"] = "PERCENT"
    discount_value: float = Field(..., gt=0)

    @root_validator(pre=True)
    def populate_target_id(cls, values: dict[str, Any]) -> dict[str, Any]:
        raw_target_type = values.get("target_type") or values.get("targetType") or "MENU"
        target_type = str(raw_target_type).upper()
        if target_type not in {"MENU", "SIDE_DISH"}:
            raise ValueError("할인 대상 유형은 MENU 또는 SIDE_DISH 여야 합니다")
        values["target_type"] = target_type

        target_id = (
            values.get("target_id")
            or values.get("targetId")
            or (values.get("menu_item_id") or values.get("menuItemId") if target_type == "MENU" else None)
            or (values.get("side_dish_id") or values.get("sideDishId") if target_type == "SIDE_DISH" else None)
        )
        if not target_id:
            raise ValueError("할인 대상 ID가 필요합니다")
        values["target_id"] = str(target_id).strip()
        return values

    @validator("discount_value")
    def validate_discount_value(cls, value: float, values: dict[str, Any]) -> float:
        discount_type = values.get("discount_type", "PERCENT")
        if discount_type == "PERCENT" and value > 100:
            raise ValueError("퍼센트 할인은 100을 초과할 수 없습니다")
        return value

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "target_type": self.target_type,
            "discount_type": self.discount_type,
            "discount_value": self.discount_value,
        }
        if self.target_type == "SIDE_DISH":
            payload["side_dish_id"] = self.target_id
        else:
            payload["menu_item_id"] = self.target_id
        return payload


class EventCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    discount_label: str | None = Field(None, max_length=120)
    start_date: str | None = Field(None, description="YYYY-MM-DD")
    end_date: str | None = Field(None, description="YYYY-MM-DD")
    tags: list[str] | None = Field(default_factory=list)
    is_published: bool = True
    menu_discounts: list[EventMenuDiscountItem] = Field(default_factory=list)


class EventUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, min_length=1)
    discount_label: str | None = Field(None, max_length=120)
    start_date: str | None = Field(None)
    end_date: str | None = Field(None)
    tags: list[str] | None = None
    is_published: bool | None = None
    menu_discounts: list[EventMenuDiscountItem] | None = None


def parse_date_or_none(value: str | None):
    if value is None:
        return None
    try:
        from datetime import datetime

        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식이 잘못되었습니다. YYYY-MM-DD 형식을 사용하세요")


@router.get("/events")
async def list_published_events(db: Annotated[Session, Depends(get_db)]) -> dict[str, Any]:
    events = event_service.list_events(db, include_unpublished=False)
    return {"success": True, "events": events}


@router.get("/events/manage")
async def list_all_events(
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다")

    events = event_service.list_events(db, include_unpublished=True)
    return {"success": True, "events": events}


@router.post("/events")
async def create_event(
    request: EventCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="관리자만 이벤트를 생성할 수 있습니다")

    payload = EventPayload(
        title=request.title,
        description=request.description,
        discount_label=request.discount_label,
        start_date=parse_date_or_none(request.start_date),
        end_date=parse_date_or_none(request.end_date),
        tags=request.tags or [],
        is_published=request.is_published,
        menu_discounts=[item.to_payload() for item in request.menu_discounts] if request.menu_discounts else [],
    )

    created = event_service.create_event(db, payload, current_user.get("id"))
    return {"success": True, "event": created}


@router.patch("/events/{event_id}")
async def update_event(
    event_id: str,
    request: EventUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="관리자만 이벤트를 수정할 수 있습니다")

    updates: dict[str, Any] = {}
    if request.title is not None:
        updates["title"] = request.title
    if request.description is not None:
        updates["description"] = request.description
    if request.discount_label is not None:
        updates["discount_label"] = request.discount_label
    if request.start_date is not None:
        updates["start_date"] = parse_date_or_none(request.start_date)
    if request.end_date is not None:
        updates["end_date"] = parse_date_or_none(request.end_date)
    if request.tags is not None:
        updates["tags"] = request.tags
    if request.is_published is not None:
        updates["is_published"] = request.is_published

    menu_discounts_payload = None
    if request.menu_discounts is not None:
        menu_discounts_payload = [item.to_payload() for item in request.menu_discounts]

    result = event_service.update_event(db, event_id, updates, menu_discounts=menu_discounts_payload)
    return {"success": True, **result}


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="관리자만 이벤트를 삭제할 수 있습니다")

    event_service.delete_event(db, event_id)
    return {"success": True}


@router.post("/events/{event_id}/image")
async def upload_event_image(
    event_id: str,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.get("user_type") != "MANAGER":
        raise HTTPException(status_code=403, detail="관리자만 이미지를 업로드할 수 있습니다")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="이미지 크기가 너무 큽니다 (최대 5MB)")

    stored_filename = event_service.store_upload(contents, file.filename)
    image_url = event_service.attach_image(db, event_id, stored_filename)
    return {"success": True, "image_url": image_url}


@router.get("/events/images/{filename}")
async def serve_event_image(filename: str):
    target = EVENT_UPLOAD_DIR / filename
    if not target.exists():
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다")
    return FileResponse(target)


class EventDiscountTarget(str, Enum):
    MENU = "MENU"
    SIDE_DISH = "SIDE_DISH"


@router.get("/events/menu-discounts/{target_id}")
async def get_menu_discounts(
    target_id: str,
    db: Annotated[Session, Depends(get_db)],
    target_type: EventDiscountTarget = Query(EventDiscountTarget.MENU, description="할인 대상 유형 (MENU 또는 SIDE_DISH)"),
) -> dict[str, Any]:
    discounts = event_service.get_active_menu_discounts(db, target_id, target_type=target_type.value)
    return {
        "success": True,
        "discounts": discounts,
    }
