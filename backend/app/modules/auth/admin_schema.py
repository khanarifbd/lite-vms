from pydantic import BaseModel

from app.modules.auth.schema import IdentifierRead, UserRead


class IdentifierAdminRead(IdentifierRead):
    pass


class UserAdminRead(UserRead):
    identifiers: list[IdentifierAdminRead]


class UserAdminPage(BaseModel):
    items: list[UserAdminRead]
    total: int
    offset: int
    limit: int
