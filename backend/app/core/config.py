from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Bangladesh National Vehicle Platform"
    app_env: str = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    public_web_url: str = "http://169.58.86.147"
    database_url: str = "sqlite+aiosqlite:///./vehicle_platform.db"
    default_speed_limit_kph: float = 80.0
    overspeed_tolerance_kph: float = 5.0
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    kafka_bootstrap_servers: str = "localhost:9092"
    telemetry_enabled: bool = False
    kafka_client_id: str = "bnvp-ingestion-api"
    kafka_tracking_packets_topic: str = "tracking.packet.valid.v1"
    kafka_tracking_packets_dlq_topic: str = "tracking.packet.dead-letter.v1"
    kafka_telemetry_consumer_group: str = "bnvp-telemetry-storage-v1"
    kafka_consumer_max_retries: int = 5
    kafka_consumer_retry_delay_seconds: float = 2.0
    telemetry_max_batch_size: int = 500
    telemetry_max_request_bytes: int = 5 * 1024 * 1024
    telemetry_allow_unauthenticated_test: bool = False

    clickhouse_host: str = "127.0.0.1"
    clickhouse_port: int = 8123
    clickhouse_username: str = "default"
    clickhouse_password: str = ""
    clickhouse_database: str = "bnvp_tracking"
    clickhouse_secure: bool = False
    clickhouse_connect_timeout_seconds: int = 10
    clickhouse_send_receive_timeout_seconds: int = 30
    clickhouse_history_table: str = "vehicle_position_history"

    upload_dir: str = "storage/uploads"
    upload_max_bytes: int = 25 * 1024 * 1024
    upload_allowed_content_types: list[str] = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
    ]

    jwt_secret_key: str = "development-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    allow_public_registration: bool = True
    public_registration_auto_activate: bool = True

    owner_password_reset_otp_expire_minutes: int = 5
    owner_password_reset_otp_cooldown_seconds: int = 60
    owner_password_reset_otp_max_attempts: int = 5

    sms_gateway_url: str = ""
    sms_gateway_api_key: str = ""
    sms_sender_id: str = "BNVP"

    bootstrap_super_admin_email: str = ""
    bootstrap_super_admin_password: str = ""
    bootstrap_super_admin_full_name: str = "Platform Super Admin"

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        is_production = self.app_env.strip().lower() == "production"
        if is_production and (
            self.jwt_secret_key == "development-only-change-me" or len(self.jwt_secret_key) < 32
        ):
            raise ValueError("JWT_SECRET_KEY must be a strong secret in production")
        if is_production and self.public_registration_auto_activate:
            raise ValueError("PUBLIC_REGISTRATION_AUTO_ACTIVATE must be false in production")
        if is_production and not self.sms_gateway_url.strip():
            raise ValueError("SMS_GATEWAY_URL must be configured in production")
        if is_production and self.telemetry_enabled and not self.kafka_bootstrap_servers.strip():
            raise ValueError("KAFKA_BOOTSTRAP_SERVERS must be configured in production")
        if is_production and self.telemetry_allow_unauthenticated_test:
            raise ValueError(
                "TELEMETRY_ALLOW_UNAUTHENTICATED_TEST must be false in production"
            )
        if is_production and self.telemetry_enabled and not self.clickhouse_host.strip():
            raise ValueError("CLICKHOUSE_HOST must be configured in production")

        if not self.public_web_url.strip().startswith(("http://", "https://")):
            raise ValueError("PUBLIC_WEB_URL must start with http:// or https://")
        if self.kafka_consumer_max_retries < 1:
            raise ValueError("KAFKA_CONSUMER_MAX_RETRIES must be at least 1")
        if self.kafka_consumer_retry_delay_seconds < 0:
            raise ValueError("KAFKA_CONSUMER_RETRY_DELAY_SECONDS cannot be negative")
        if self.clickhouse_port < 1 or self.clickhouse_port > 65535:
            raise ValueError("CLICKHOUSE_PORT must be between 1 and 65535")
        if self.clickhouse_connect_timeout_seconds < 1:
            raise ValueError("CLICKHOUSE_CONNECT_TIMEOUT_SECONDS must be at least 1")
        if self.clickhouse_send_receive_timeout_seconds < 1:
            raise ValueError("CLICKHOUSE_SEND_RECEIVE_TIMEOUT_SECONDS must be at least 1")
        if not self.clickhouse_database.replace("_", "").isalnum():
            raise ValueError("CLICKHOUSE_DATABASE contains invalid characters")
        if not self.clickhouse_history_table.replace("_", "").isalnum():
            raise ValueError("CLICKHOUSE_HISTORY_TABLE contains invalid characters")
        if self.telemetry_max_batch_size < 1 or self.telemetry_max_batch_size > 5000:
            raise ValueError("TELEMETRY_MAX_BATCH_SIZE must be between 1 and 5000")
        if self.telemetry_max_request_bytes < 1024:
            raise ValueError("TELEMETRY_MAX_REQUEST_BYTES must be at least 1024")
        if self.upload_max_bytes < 1:
            raise ValueError("UPLOAD_MAX_BYTES must be positive")
        if not self.upload_allowed_content_types:
            raise ValueError("UPLOAD_ALLOWED_CONTENT_TYPES cannot be empty")
        if self.owner_password_reset_otp_expire_minutes < 1:
            raise ValueError("OWNER_PASSWORD_RESET_OTP_EXPIRE_MINUTES must be at least 1")
        if self.owner_password_reset_otp_cooldown_seconds < 10:
            raise ValueError("OWNER_PASSWORD_RESET_OTP_COOLDOWN_SECONDS must be at least 10")
        if self.owner_password_reset_otp_max_attempts < 1:
            raise ValueError("OWNER_PASSWORD_RESET_OTP_MAX_ATTEMPTS must be at least 1")

        email_set = bool(self.bootstrap_super_admin_email.strip())
        password_set = bool(self.bootstrap_super_admin_password)
        if email_set != password_set:
            raise ValueError(
                "BOOTSTRAP_SUPER_ADMIN_EMAIL and BOOTSTRAP_SUPER_ADMIN_PASSWORD "
                "must be configured together"
            )
        if password_set and len(self.bootstrap_super_admin_password) < 12:
            raise ValueError("BOOTSTRAP_SUPER_ADMIN_PASSWORD must be at least 12 characters")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
