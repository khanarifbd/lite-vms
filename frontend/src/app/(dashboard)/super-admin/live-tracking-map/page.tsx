import { LiveTrackingMapClient } from "@/components/super-admin/live-tracking-map-client"
import {
  getInitialMonitoringVehiclePage,
  monitoringVehiclePageToDashboard,
} from "@/features/super-admin/monitoring"
import { getMonitoringSettings } from "@/features/super-admin/settings"

export const dynamic = "force-dynamic"

export default async function SuperAdminLiveTrackingMapPage() {
  const [page, monitoringSettings] = await Promise.all([
    getInitialMonitoringVehiclePage(),
    getMonitoringSettings(),
  ])
  const data = monitoringVehiclePageToDashboard(page)

  return (
    <LiveTrackingMapClient
      initialData={data}
      systemRefreshIntervalSeconds={
        monitoringSettings.live_map_refresh_seconds
      }
    />
  )
}
