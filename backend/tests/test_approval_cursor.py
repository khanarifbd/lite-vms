import uuid
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.modules.approvals.cursor_router import _decode_cursor, _encode_cursor


def test_approval_cursor_round_trip() -> None:
    created_at = datetime(2026, 8, 1, 10, 30, tzinfo=UTC)
    item_id = uuid.uuid4()
    cursor = _encode_cursor(
        entity="provider",
        status="pending",
        sort="oldest",
        search="example provider",
        created_at=created_at,
        item_id=item_id,
    )

    decoded = _decode_cursor(
        cursor,
        entity="provider",
        status="pending",
        sort="oldest",
        search="example provider",
    )

    assert decoded == (created_at, item_id)


def test_approval_cursor_rejects_different_query() -> None:
    cursor = _encode_cursor(
        entity="provider",
        status="all",
        sort="newest",
        search=None,
        created_at=datetime(2026, 8, 1, 10, 30, tzinfo=UTC),
        item_id=uuid.uuid4(),
    )

    with pytest.raises(HTTPException) as error:
        _decode_cursor(
            cursor,
            entity="vehicle",
            status="all",
            sort="newest",
            search=None,
        )

    assert error.value.status_code == 400
