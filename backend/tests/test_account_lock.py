from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.common.enums import UserStatus
from app.db.base import Base
from app.modules.auth.service import authenticate_user, create_user_identity, get_security


@pytest.mark.asyncio
async def test_expired_naive_account_lock_is_released(tmp_path: Path) -> None:
    database_path = tmp_path / "account-lock.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        user = await create_user_identity(
            session,
            email="locked@example.com",
            mobile=None,
            display_name="Locked User",
            password="Locked-Password-123",
            status=UserStatus.ACTIVE,
            created_by_id=None,
        )
        security = await get_security(session, user.id)
        assert security is not None
        user.status = UserStatus.LOCKED
        security.failed_login_count = 5
        security.locked_until = datetime.now() - timedelta(minutes=1)
        await session.commit()

        authenticated = await authenticate_user(
            session,
            identifier="locked@example.com",
            password="Locked-Password-123",
            ip_address="127.0.0.1",
            user_agent="pytest",
        )
        assert authenticated is not None
        assert authenticated[0].status == UserStatus.ACTIVE
        assert authenticated[2].failed_login_count == 0
        assert authenticated[2].locked_until is None

    await engine.dispose()
