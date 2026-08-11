from pydantic import BaseModel


class DocumentUploadRead(BaseModel):
    storage_key: str
    original_file_name: str
    content_type: str
    size_bytes: int
    download_url: str
