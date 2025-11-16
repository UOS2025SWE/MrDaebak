"""Cake customization API endpoints"""

from pathlib import Path
import mimetypes
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, field_validator

from ..services.gemini_image_service import (
    ALLOWED_ASPECT_RATIOS,
    GeminiImageService,
    get_gemini_image_service,
    guess_extension,
)

router = APIRouter(tags=["cake"])

CAKE_UPLOAD_DIR = Path(__file__).parent.parent / "uploads" / "cakes"
CAKE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class UploadImageResponse(BaseModel):
    success: bool
    image_path: str
    filename: str


class GenerateCakeImageRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "1:1"

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("프롬프트를 입력해주세요.")
        return cleaned

    @field_validator("aspect_ratio")
    @classmethod
    def validate_aspect_ratio(cls, value: str) -> str:
        normalized = value.strip()
        if normalized not in ALLOWED_ASPECT_RATIOS:
            raise ValueError(f"지원하지 않는 비율입니다: {normalized}")
        return normalized


def _store_image_bytes(image_bytes: bytes, mime_type: str | None = None) -> UploadImageResponse:
    if not image_bytes:
        raise HTTPException(status_code=500, detail="이미지 데이터가 비었습니다.")

    extension = guess_extension(mime_type)
    filename = f"{uuid.uuid4().hex}{extension}"
    destination = CAKE_UPLOAD_DIR / filename

    try:
        destination.write_bytes(image_bytes)
    except Exception as exc:  # pragma: no cover - 파일 시스템 오류
        raise HTTPException(status_code=500, detail=f"이미지 저장에 실패했습니다: {exc}") from exc

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
        raise HTTPException(status_code=500, detail=f"기존 이미지를 읽을 수 없습니다: {exc}") from exc

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
        raise HTTPException(status_code=500, detail=f"이미지를 읽을 수 없습니다: {exc}") from exc

    return _store_image_bytes(contents, file.content_type)


@router.post("/customizations/generate-ai-image", response_model=UploadImageResponse)
async def generate_cake_image(request: GenerateCakeImageRequest) -> UploadImageResponse:
    """Gemini를 사용해 케이크 이미지를 생성"""
    service: GeminiImageService = get_gemini_image_service()
    try:
        image_bytes, mime_type = service.generate_image(
            prompt=request.prompt,
            aspect_ratio=request.aspect_ratio,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - 외부 API 오류
        raise HTTPException(status_code=500, detail=f"AI 이미지 생성에 실패했습니다: {exc}") from exc

    return _store_image_bytes(image_bytes, mime_type)


@router.post("/customizations/edit-ai-image", response_model=UploadImageResponse)
async def edit_cake_image(
    prompt: str = Form(...),
    aspect_ratio: str = Form("1:1"),
    file: UploadFile | None = File(None),
    existing_image_path: str | None = Form(None),
) -> UploadImageResponse:
    """기존 이미지를 Gemini로 수정"""
    service: GeminiImageService = get_gemini_image_service()

    try:
        validated = GenerateCakeImageRequest(aspect_ratio=aspect_ratio, prompt=prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    normalized_ratio = validated.aspect_ratio
    prompt_text = validated.prompt

    base_bytes: bytes | None = None
    base_mime: str | None = None

    if file is not None:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="이미지 파일만 업로드할 수 있습니다")
        try:
            base_bytes = await file.read()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"이미지를 읽을 수 없습니다: {exc}") from exc
        base_mime = file.content_type
    elif existing_image_path:
        base_bytes, base_mime = _load_existing_image(existing_image_path)
    else:
        raise HTTPException(status_code=400, detail="기존 이미지를 선택하거나 새 이미지를 업로드해주세요.")

    try:
        image_bytes, mime_type = service.edit_image(
            base_image_bytes=base_bytes,
            base_mime_type=base_mime or "image/png",
            prompt=prompt_text,
            aspect_ratio=normalized_ratio,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - 외부 API 오류
        raise HTTPException(status_code=500, detail=f"AI 이미지 수정에 실패했습니다: {exc}") from exc

    return _store_image_bytes(image_bytes, mime_type)


@router.get("/customizations/image/{filename}")
async def get_cake_image(filename: str) -> FileResponse:
    file_path = CAKE_UPLOAD_DIR / Path(filename).name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다")

    return FileResponse(file_path)
