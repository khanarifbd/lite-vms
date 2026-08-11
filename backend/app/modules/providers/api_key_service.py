import hashlib
import hmac
import ipaddress
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ProviderStatus, TelemetrySourceStatus
from app.modules.providers.model import VTSProvider, VTSProviderAllowedIP
from app.modules.tracking.model import TelemetrySource

API_KEY_SCHEME = "bnvp_live"


@dataclass(frozen=True)
class GeneratedProviderAPIKey:
    plaintext: str
    lookup_prefix: str
    digest: str
    last_four: str


class ProviderAPIKeyAuthenticationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def generate_provider_api_key() -> GeneratedProviderAPIKey:
    lookup_prefix = secrets.token_hex(8)
    secret = secrets.token_urlsafe(32)
    plaintext = f"{API_KEY_SCHEME}_{lookup_prefix}_{secret}"
    return GeneratedProviderAPIKey(
        plaintext=plaintext,
        lookup_prefix=lookup_prefix,
        digest=hash_api_key(plaintext),
        last_four=plaintext[-4:],
    )


def hash_api_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def extract_lookup_prefix(value: str) -> str | None:
    parts = value.strip().split("_", 3)
    if len(parts) != 4 or f"{parts[0]}_{parts[1]}" != API_KEY_SCHEME:
        return None
    return parts[2] or None


def canonical_ip(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


async def authenticate_provider_api_key(
    session: AsyncSession,
    *,
    api_key: str,
    client_ip: str | None,
) -> tuple[TelemetrySource, VTSProvider]:
    lookup_prefix = extract_lookup_prefix(api_key)
    if lookup_prefix is None:
        raise ProviderAPIKeyAuthenticationError(
            "TELEMETRY_API_KEY_INVALID",
            "The provider telemetry API key is invalid",
        )

    row = (
        await session.execute(
            select(TelemetrySource, VTSProvider)
            .join(VTSProvider, VTSProvider.id == TelemetrySource.provider_id)
            .where(TelemetrySource.api_key_prefix == lookup_prefix)
        )
    ).first()
    if row is None:
        raise ProviderAPIKeyAuthenticationError(
            "TELEMETRY_API_KEY_INVALID",
            "The provider telemetry API key is invalid",
        )

    source, provider = row
    if provider.status != ProviderStatus.APPROVED:
        raise ProviderAPIKeyAuthenticationError(
            "TELEMETRY_PROVIDER_NOT_APPROVED",
            "The VTS provider is not approved for telemetry submission",
        )
    if source.status not in {TelemetrySourceStatus.ACTIVE, TelemetrySourceStatus.TESTING}:
        raise ProviderAPIKeyAuthenticationError(
            "TELEMETRY_SOURCE_INACTIVE",
            "The provider telemetry source is not active",
        )
    if source.api_key_revoked_at is not None or not source.api_key_hash:
        raise ProviderAPIKeyAuthenticationError(
            "TELEMETRY_API_KEY_REVOKED",
            "The provider telemetry API key has been revoked",
        )
    if not hmac.compare_digest(source.api_key_hash, hash_api_key(api_key.strip())):
        raise ProviderAPIKeyAuthenticationError(
            "TELEMETRY_API_KEY_INVALID",
            "The provider telemetry API key is invalid",
        )

    allowed_ips = set(
        await session.scalars(
            select(VTSProviderAllowedIP.ip_address).where(
                VTSProviderAllowedIP.provider_id == provider.id
            )
        )
    )
    normalized_client_ip = canonical_ip(client_ip)
    if allowed_ips and normalized_client_ip not in allowed_ips:
        raise ProviderAPIKeyAuthenticationError(
            "TELEMETRY_SOURCE_IP_NOT_ALLOWED",
            "This server IP is not allowed for the VTS provider",
        )

    source.last_authenticated_at = datetime.now(UTC)
    return source, provider
