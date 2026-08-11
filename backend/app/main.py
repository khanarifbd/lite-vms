from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.database import close_database
from app.modules.auth.bootstrap import bootstrap_identity_platform
from app.modules.health.router import router as health_router
from app.modules.telemetry.kafka import telemetry_kafka_producer


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await bootstrap_identity_platform()
    await telemetry_kafka_producer.start()
    try:
        yield
    finally:
        await telemetry_kafka_producer.stop()
        await close_database()


app = FastAPI(
    title=settings.app_name,
    version="0.4.0",
    description=(
        "National vehicle registry, tenant-aware identity, Kafka telemetry ingestion, "
        "enforcement, and QR verification API."
    ),
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["Root"])
async def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "version": "0.4.0",
        "docs": "/docs",
    }
