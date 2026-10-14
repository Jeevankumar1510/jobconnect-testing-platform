from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException, UploadFile, status

from config.settings import get_settings

ALLOWED_RESUME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


async def read_and_validate_resume(resume: UploadFile) -> tuple[bytes, str, str]:
    filename = Path(resume.filename or "").name
    extension = Path(filename).suffix.lower()
    content_type = ALLOWED_RESUME_TYPES.get(extension)
    if content_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Resume must be a PDF or DOCX file",
        )

    max_size = get_settings().max_resume_size_bytes
    content = await resume.read(max_size + 1)
    if len(content) > max_size:
        limit_mib = max_size / (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Resume exceeds the {limit_mib:g} MiB upload limit",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Resume file cannot be empty",
        )

    if extension == ".pdf":
        valid_content = content.startswith(b"%PDF-")
    else:
        try:
            with ZipFile(BytesIO(content)) as archive:
                valid_content = {
                    "[Content_Types].xml",
                    "word/document.xml",
                }.issubset(archive.namelist())
        except BadZipFile:
            valid_content = False

    if not valid_content:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="File content does not match a valid PDF or DOCX resume",
        )
    return content, filename[:255], content_type
