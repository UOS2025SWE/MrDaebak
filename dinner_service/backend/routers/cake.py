"""Cake customization API endpoints"""

from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(tags=["cake"])

CAKE_UPLOAD_DIR = Path(__file__).parent.parent / "uploads" / "cakes"
CAKE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class UploadImageResponse(BaseModel):
    success: bool
    image_path: str
    filename: str


@router.post("/customizations/upload-image", response_model=UploadImageResponse)
async def upload_cake_image(file: UploadFile = File(...)) -> UploadImageResponse:
    """케이크 커스터마이징 이미지를 업로드하고 저장 경로를 반환"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드할 수 있습니다")

    extension = Path(file.filename or "").suffix or ".png"
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = CAKE_UPLOAD_DIR / filename

    try:
        contents = await file.read()
        destination.write_bytes(contents)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"이미지 저장에 실패했습니다: {exc}") from exc

    return UploadImageResponse(
        success=True,
        image_path=f"/api/cake/customizations/image/{filename}",
        filename=filename
    )


@router.get("/customizations/image/{filename}")
async def get_cake_image(filename: str) -> FileResponse:
    file_path = CAKE_UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다")

    return FileResponse(file_path)
