from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.settings.model import SystemConfiguration
from app.modules.settings.schema import MonitoringSettings

GLOBAL_CONFIGURATION_SCOPE = "global"


async def read_monitoring_settings(session: AsyncSession) -> MonitoringSettings:
    configuration = await session.scalar(
        select(SystemConfiguration).where(
            SystemConfiguration.scope == GLOBAL_CONFIGURATION_SCOPE
        )
    )
    if configuration is None:
        return MonitoringSettings()
    return MonitoringSettings(
        live_map_refresh_seconds=configuration.live_map_refresh_seconds,
    )


async def save_monitoring_settings(
    session: AsyncSession,
    settings: MonitoringSettings,
) -> MonitoringSettings:
    configuration = await session.scalar(
        select(SystemConfiguration).where(
            SystemConfiguration.scope == GLOBAL_CONFIGURATION_SCOPE
        )
    )
    if configuration is None:
        configuration = SystemConfiguration(
            scope=GLOBAL_CONFIGURATION_SCOPE,
            live_map_refresh_seconds=settings.live_map_refresh_seconds,
        )
        session.add(configuration)
    else:
        configuration.live_map_refresh_seconds = settings.live_map_refresh_seconds

    await session.flush()
    return MonitoringSettings(
        live_map_refresh_seconds=configuration.live_map_refresh_seconds,
    )
