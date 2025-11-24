"""Cake customization API endpoints"""

from pathlib import Path
import mimetypes
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator

from ..services.image_generation_service import (
    ImageGenerationService,
    get_image_generation_service,
)

router = APIRouter(tags=["cake"])

CAKE_UPLOAD_DIR = Path(__file__).parent.parent / "uploads" / "cakes"
CAKE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_ASPECT_RATIOS: tuple[str, ...] = (
    "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
)


def guess_extension(mime_type: str | None) -> str:
    if not mime_type:
        return ".png"
    guessed = mimetypes.guess_extension(mime_type)
    if not guessed:
        return ".png"
    return guessed


class UploadImageResponse(BaseModel):
    success: bool
    image_path: str
    filename: str


class GenerateCakeImageRequest(BaseModel):
    prompt: str

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("프롬프트를 입력해주세요.")
        return cleaned

    # aspect_ratio는 더 이상 클라이언트에서 변경 불가 (고정 1:1)


def _store_image_bytes(image_bytes: bytes, mime_type: str | None = None) -> UploadImageResponse:
    if not image_bytes:
        raise HTTPException(status_code=500, detail="이미지 데이터가 비었습니다.")

    extension = guess_extension(mime_type)
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = CAKE_UPLOAD_DIR / filename

    try:
        destination.write_bytes(image_bytes)
    except Exception as exc:  # pragma: no cover - 파일 시스템 오류
        raise HTTPException(
            status_code=500, detail=f"이미지 저장에 실패했습니다: {exc}") from exc

    return UploadImageResponse(
        success=True,
        image_path=f"/api/cake/customizations/image/{filename}",
        filename=filename,
    )


def _load_existing_image(existing_path: str) -> tuple[bytes, str]:
    filename = Path(existing_path).name
    file_path = CAKE_UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="기존 이미지를 찾을 수 없습니다.")

    try:
        data = file_path.read_bytes()
    except Exception as exc:  # pragma: no cover - 파일 시스템 오류
        raise HTTPException(
            status_code=500, detail=f"기존 이미지를 읽을 수 없습니다: {exc}") from exc

    mime_type = mimetypes.guess_type(file_path.name)[0] or "image/png"
    return data, mime_type


@router.post("/customizations/upload-image", response_model=UploadImageResponse)
async def upload_cake_image(file: UploadFile = File(...)) -> UploadImageResponse:
    """케이크 커스터마이징 이미지를 업로드하고 저장 경로를 반환"""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드할 수 있습니다")

    try:
        contents = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"이미지를 읽을 수 없습니다: {exc}") from exc

    return _store_image_bytes(contents, file.content_type)


@router.post("/customizations/generate-ai-image", response_model=UploadImageResponse)
async def generate_cake_image(request: GenerateCakeImageRequest) -> UploadImageResponse:
    """AI 서버를 사용해 케이크 이미지를 생성"""
    service: ImageGenerationService = get_image_generation_service()
    try:
        image_bytes, mime_type = await service.generate_image(
            prompt=request.prompt,
            aspect_ratio="1:1",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - 외부 API 오류
        raise HTTPException(
            status_code=500, detail=f"AI 이미지 생성에 실패했습니다: {exc}") from exc

    return _store_image_bytes(image_bytes, mime_type)


@router.get("/customizations/image/{filename}")
async def get_cake_image(filename: str) -> FileResponse:
    file_path = CAKE_UPLOAD_DIR / Path(filename).name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다")

    return FileResponse(file_path)
