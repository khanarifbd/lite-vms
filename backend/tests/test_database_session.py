import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import close_database, get_session


@pytest.mark.asyncio
async def test_get_session_yields_async_session() -> None:
    session_generator = get_session()
    session = await anext(session_generator)

    try:
        assert isinstance(session, AsyncSession)
    finally:
        await session_generator.aclose()
        await close_database()
