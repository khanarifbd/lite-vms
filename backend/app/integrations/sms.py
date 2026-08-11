import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class SMSDeliveryError(RuntimeError):
    pass


async def send_sms(*, mobile: str, message: str) -> str:
    environment = settings.app_env.strip().lower()
    if environment in {"development", "testing"}:
        logger.info("Simulated SMS delivery to %s", mobile)
        return "simulated"

    if not settings.sms_gateway_url.strip():
        raise SMSDeliveryError("SMS gateway is not configured")

    headers = {"Content-Type": "application/json"}
    if settings.sms_gateway_api_key.strip():
        headers["Authorization"] = f"Bearer {settings.sms_gateway_api_key.strip()}"

    payload = {
        "to": mobile,
        "message": message,
        "sender_id": settings.sms_sender_id.strip() or None,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                settings.sms_gateway_url.strip(),
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise SMSDeliveryError("SMS delivery failed") from exc
    return "sent"
