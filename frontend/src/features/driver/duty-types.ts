export type DriverDutySession = {
  id: string
  assignment_id: string
  vehicle_id: string
  vehicle_registration: string
  driver_id: string
  driver_code: string
  driver_name: string
  owner_id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  is_open: boolean
  started_by_user_id: number
  ended_by_user_id: number | null
  start_reason: string
  end_reason: string | null
  source: string
}

export type DriverDutyHistoryPage = {
  items: DriverDutySession[]
  total: number
  offset: number
  limit: number
}
