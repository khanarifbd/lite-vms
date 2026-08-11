import { NationalMonitoringCenter } from "@/components/super-admin/national-monitoring-center"
import { getNationalMonitoringDashboard } from "@/features/super-admin/monitoring"

export const dynamic = "force-dynamic"

export default async function SuperAdminMonitoringPage() {
  const data = await getNationalMonitoringDashboard()

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1600px]">
        <NationalMonitoringCenter initialData={data} />
      </div>
    </div>
  )
}
