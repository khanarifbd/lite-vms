import asyncio
import json
import logging
import signal
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from aiokafka.structs import ConsumerRecord
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clickhouse import close_clickhouse, insert_position_history
from app.core.config import settings
from app.core.database import close_database, get_session_factory
from app.db import models as db_models  # noqa: F401
from app.modules.enforcement.detector import detect_overspeed
from app.modules.telemetry.model import TelemetryPoint
from app.modules.tracking.model import TrackingDevice
from app.modules.vehicles.model import Vehicle

logger = logging.getLogger("bnvp.telemetry.consumer")
OFFLINE_WINDOW = timedelta(minutes=5)


def parse_datetime(value: Any, *, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")
    return parsed.astimezone(UTC)


def parse_uuid(value: Any, *, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be a valid UUID") from exc


def optional_float(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def ignition_from(event: dict[str, Any]) -> bool | None:
    params = event.get("params")
    if not isinstance(params, dict):
        return None
    value = params.get("ignition")
    return value if isinstance(value, bool) else None


def movement_state_from(*, speed_kph: float, ignition: bool | None) -> str:
    if speed_kph > 3:
        return "moving"
    if ignition is True:
        return "idle"
    return "stopped"


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def get_or_create_telemetry_point(
    session: AsyncSession,
    *,
    packet_id: str,
    vehicle_id: uuid.UUID,
    source_id: uuid.UUID,
    device_id: uuid.UUID,
    assignment_id: uuid.UUID,
    recorded_at: datetime,
    received_at: datetime,
    latitude: float,
    longitude: float,
    speed_kph: float,
    heading: float | None,
    ignition: bool | None,
    event: dict[str, Any],
) -> TelemetryPoint:
    telemetry_id = uuid.uuid5(uuid.NAMESPACE_URL, f"bnvp-telemetry:{packet_id}")
    existing = await session.get(TelemetryPoint, telemetry_id)
    if existing is not None:
        return existing

    telemetry = TelemetryPoint(
        id=telemetry_id,
        vehicle_id=vehicle_id,
        source_id=source_id,
        device_id=device_id,
        assignment_id=assignment_id,
        external_event_id=packet_id,
        recorded_at=recorded_at,
        received_at=received_at,
        latitude=latitude,
        longitude=longitude,
        speed_kph=speed_kph,
        heading=heading,
        ignition=ignition,
        gps_accuracy_m=optional_float(event.get("gps_accuracy_m")),
        raw_payload=event,
    )
    session.add(telemetry)
    await session.flush()
    return telemetry


async def persist_event(session: AsyncSession, event: dict[str, Any]) -> str:
    packet_id = str(event.get("packet_id") or "").strip()
    if not packet_id:
        raise ValueError("packet_id is required")

    vehicle_id = parse_uuid(event.get("vehicle_id"), field="vehicle_id")
    device_id = parse_uuid(event.get("device_id"), field="device_id")
    source_id = parse_uuid(event.get("source_id"), field="source_id")
    assignment_id = parse_uuid(event.get("assignment_id"), field="assignment_id")
    recorded_at = parse_datetime(event.get("dt_tracker"), field="dt_tracker")
    received_at = parse_datetime(event.get("dt_server"), field="dt_server")

    vehicle = await session.get(Vehicle, vehicle_id)
    device = await session.get(TrackingDevice, device_id)
    if vehicle is None:
        raise ValueError(f"Vehicle does not exist: {vehicle_id}")
    if device is None:
        raise ValueError(f"Tracking device does not exist: {device_id}")

    current_seen = normalize_datetime(device.last_seen_at)
    recovered_from_offline = current_seen is None or received_at - current_seen > OFFLINE_WINDOW
    if current_seen is None or received_at >= current_seen:
        device.last_seen_at = received_at

    op = str(event.get("op") or "").strip().lower()
    loc_valid = bool(event.get("loc_valid", False))
    latitude = optional_float(event.get("lat"))
    longitude = optional_float(event.get("lng"))
    has_location = op == "loc" and loc_valid and latitude is not None and longitude is not None

    if not has_location:
        if recovered_from_offline and vehicle.movement_state is not None:
            vehicle.movement_state_changed_at = received_at
        await session.commit()
        return "heartbeat"

    speed = optional_float(event.get("speed")) or 0.0
    heading = optional_float(event.get("angle"))
    ignition = ignition_from(event)
    next_movement_state = movement_state_from(speed_kph=speed, ignition=ignition)

    await insert_position_history(
        event,
        recorded_at=recorded_at,
        received_at=received_at,
        latitude=latitude,
        longitude=longitude,
        speed_kph=speed,
        heading=heading,
        ignition=ignition,
    )

    telemetry = await get_or_create_telemetry_point(
        session,
        packet_id=packet_id,
        vehicle_id=vehicle_id,
        source_id=source_id,
        device_id=device_id,
        assignment_id=assignment_id,
        recorded_at=recorded_at,
        received_at=received_at,
        latitude=latitude,
        longitude=longitude,
        speed_kph=speed,
        heading=heading,
        ignition=ignition,
        event=event,
    )

    current_received_at = normalize_datetime(vehicle.last_received_at)
    if current_received_at is None or received_at >= current_received_at:
        vehicle.latest_latitude = latitude
        vehicle.latest_longitude = longitude
        vehicle.latest_speed_kph = speed
        vehicle.latest_heading = heading
        vehicle.latest_ignition = ignition
        vehicle.last_recorded_at = recorded_at
        vehicle.last_received_at = received_at

        if (
            vehicle.movement_state != next_movement_state
            or vehicle.movement_state_changed_at is None
            or recovered_from_offline
        ):
            vehicle.movement_state = next_movement_state
            vehicle.movement_state_changed_at = received_at

    candidate = await detect_overspeed(session, telemetry=telemetry, vehicle=vehicle)
    await session.commit()
    return "location_violation" if candidate is not None else "location"


class TelemetryStorageConsumer:
    def __init__(self) -> None:
        self._stopping = asyncio.Event()
        self._consumer: AIOKafkaConsumer | None = None
        self._dlq_producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        self._consumer = AIOKafkaConsumer(
            settings.kafka_tracking_packets_topic,
            bootstrap_servers=settings.kafka_bootstrap_servers,
            group_id=settings.kafka_telemetry_consumer_group,
            client_id="bnvp-telemetry-storage-consumer",
            enable_auto_commit=False,
            auto_offset_reset="earliest",
            value_deserializer=lambda value: json.loads(value.decode("utf-8")),
        )
        self._dlq_producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            client_id="bnvp-telemetry-storage-dlq",
            value_serializer=lambda value: json.dumps(
                value, separators=(",", ":"), default=str
            ).encode("utf-8"),
            compression_type="lz4",
            acks="all",
        )
        await self._consumer.start()
        await self._dlq_producer.start()
        logger.info(
            "Telemetry consumer started topic=%s group=%s history=%s.%s enforcement=enabled",
            settings.kafka_tracking_packets_topic,
            settings.kafka_telemetry_consumer_group,
            settings.clickhouse_database,
            settings.clickhouse_history_table,
        )

    async def stop(self) -> None:
        self._stopping.set()
        if self._consumer is not None:
            await self._consumer.stop()
            self._consumer = None
        if self._dlq_producer is not None:
            await self._dlq_producer.stop()
            self._dlq_producer = None
        await close_clickhouse()
        await close_database()
        logger.info("Telemetry consumer stopped")

    async def send_to_dlq(self, *, message: ConsumerRecord, error: Exception) -> None:
        if self._dlq_producer is None:
            raise RuntimeError("DLQ producer is not started")
        await self._dlq_producer.send_and_wait(
            settings.kafka_tracking_packets_dlq_topic,
            value={
                "failed_at": datetime.now(UTC).isoformat(),
                "source_topic": message.topic,
                "source_partition": message.partition,
                "source_offset": message.offset,
                "error_type": type(error).__name__,
                "error_message": str(error),
                "event": message.value,
            },
            key=message.key,
        )

    async def process_message(self, message: ConsumerRecord) -> None:
        session_factory = get_session_factory()
        last_error: Exception | None = None
        for attempt in range(1, settings.kafka_consumer_max_retries + 1):
            try:
                async with session_factory() as session:
                    result = await persist_event(session, message.value)
                logger.info(
                    "Telemetry packet stored packet_id=%s result=%s partition=%s offset=%s",
                    message.value.get("packet_id"),
                    result,
                    message.partition,
                    message.offset,
                )
                return
            except Exception as exc:
                last_error = exc
                logger.exception(
                    "Telemetry packet failed attempt=%s/%s partition=%s offset=%s",
                    attempt,
                    settings.kafka_consumer_max_retries,
                    message.partition,
                    message.offset,
                )
                if attempt < settings.kafka_consumer_max_retries:
                    await asyncio.sleep(settings.kafka_consumer_retry_delay_seconds * attempt)

        assert last_error is not None
        await self.send_to_dlq(message=message, error=last_error)
        logger.error(
            "Telemetry packet moved to DLQ partition=%s offset=%s",
            message.partition,
            message.offset,
        )

    async def run(self) -> None:
        await self.start()
        assert self._consumer is not None
        try:
            async for message in self._consumer:
                if self._stopping.is_set():
                    break
                await self.process_message(message)
                await self._consumer.commit()
        finally:
            await self.stop()


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    logging.getLogger("clickhouse_connect").setLevel(logging.WARNING)


async def main() -> None:
    configure_logging()
    worker = TelemetryStorageConsumer()
    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signal_name, worker._stopping.set)
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
