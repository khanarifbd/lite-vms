import json
from collections.abc import Mapping
from typing import Any

from aiokafka import AIOKafkaProducer

from app.core.config import settings


class TelemetryKafkaProducer:
    def __init__(self) -> None:
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        if self._producer is not None:
            return
        self._producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            client_id=settings.kafka_client_id,
            acks="all",
            enable_idempotence=True,
            compression_type="lz4",
            value_serializer=lambda value: json.dumps(
                value,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode("utf-8"),
            key_serializer=lambda value: value.encode("utf-8"),
        )
        await self._producer.start()

    async def stop(self) -> None:
        if self._producer is None:
            return
        await self._producer.stop()
        self._producer = None

    async def publish_packet(self, *, key: str, event: Mapping[str, Any]) -> None:
        if self._producer is None:
            raise RuntimeError("Kafka telemetry producer is not started")
        await self._producer.send_and_wait(
            settings.kafka_tracking_packets_topic,
            key=key,
            value=dict(event),
        )


telemetry_kafka_producer = TelemetryKafkaProducer()
