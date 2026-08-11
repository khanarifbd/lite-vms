import secrets
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.core.config import settings
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.model import User
from app.modules.uploads.schema import DocumentUploadRead

router = APIRouter(prefix="/uploads", tags=["Document Uploads"])


def upload_root() -> Path:
    root = Path(settings.upload_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def safe_extension(file_name: str) -> str:
    suffix = Path(file_name).suffix.lower()
    return suffix if suffix in {".pdf", ".jpg", ".jpeg", ".png", ".webp"} else ""


@router.post(
    "/documents",
    response_model=DocumentUploadRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    actor: Annotated[User, Depends(get_current_active_user)],
    file: UploadFile = File(...),
) -> DocumentUploadRead:
    del actor
    content_type = (file.content_type or "application/octet-stream").lower()
    if content_type not in settings.upload_allowed_content_types:
        raise HTTPException(status_code=415, detail="Unsupported document content type")

    original_name = Path(file.filename or "document").name
    storage_key = f"documents/{secrets.token_hex(16)}{safe_extension(original_name)}"
    destination = upload_root() / storage_key
    destination.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.upload_max_bytes:
                    raise HTTPException(status_code=413, detail="Document exceeds upload size limit")
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return DocumentUploadRead(
        storage_key=storage_key,
        original_file_name=original_name,
        content_type=content_type,
        size_bytes=size,
        download_url=f"{settings.api_v1_prefix}/uploads/documents/{storage_key}",
    )


@router.get("/documents/{storage_key:path}", response_class=FileResponse)
async def download_document(
    storage_key: str,
    actor: Annotated[User, Depends(get_current_active_user)],
) -> FileResponse:
    del actor
    root = upload_root()
    target = (root / storage_key).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid storage key") from exc
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(target)
