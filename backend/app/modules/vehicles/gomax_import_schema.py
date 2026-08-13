import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GoMaxProjectPreview(BaseModel):
    project_id: str
    project_name: str
    already_imported: bool = False


class GoMaxImportPreview(BaseModel):
    gomax_owner_id: str
    total: int
    available: int
    already_imported: int
    projects: list[GoMaxProjectPreview] = Field(default_factory=list)


class GoMaxImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_id: uuid.UUID
    project_ids: list[str] | None = None

    @model_validator(mode="after")
    def normalize_project_ids(self) -> "GoMaxImportRequest":
        if self.project_ids is not None:
            cleaned = list(
                dict.fromkeys(value.strip() for value in self.project_ids if value.strip())
            )
            if not cleaned:
                raise ValueError("Select at least one Go Max vehicle")
            self.project_ids = cleaned
        return self
