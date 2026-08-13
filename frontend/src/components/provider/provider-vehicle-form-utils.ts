import { readOptionalDdMmYyyyIso } from "@/components/ui/date-input"
import type { ProviderVehicleRegistrationPayload, VehicleIdentityAvailability } from "@/features/provider/vehicle-registration-types"
import type { VehicleUpdatePayload } from "@/features/vehicles/types"

export function readText(data: FormData, key: string) {
  const value = String(data.get(key) || "").trim()
  return value || null
}

export function readNumber(data: FormData, key: string) {
  const value = readText(data, key)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function responseMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { message?: string; detail?: string | { message?: string } } | null
  if (body?.message) return body.message
  if (typeof body?.detail === "string") return body.detail
  if (body?.detail && typeof body.detail === "object" && body.detail.message) return body.detail.message
  return fallback
}

export async function checkProviderVehicleIdentity(apiBase: string, payload: VehicleUpdatePayload & { registration_number?: string | null; chassis_number?: string | null }, excludeVehicleId?: string) {
  const params = new URLSearchParams({ registration_number: payload.registration_number || "", chassis_number: payload.chassis_number || "" })
  if (payload.engine_number) params.set("engine_number", payload.engine_number)
  if (excludeVehicleId) params.set("exclude_vehicle_id", excludeVehicleId)
  const response = await fetch(`${apiBase}/identity-check?${params.toString()}`)
  if (!response.ok) throw new Error(await responseMessage(response, "Unable to validate vehicle identity."))
  const result = (await response.json()) as VehicleIdentityAvailability
  if (result.available) return
  const conflicts: string[] = []
  if (!result.registration_number_available) conflicts.push("registration number")
  if (!result.chassis_number_available) conflicts.push("chassis number")
  if (!result.engine_number_available) conflicts.push("engine number")
  throw new Error(`${excludeVehicleId ? "Another vehicle" : "A vehicle"} already uses this ${conflicts.join(", ")}.`)
}

export function buildProviderRegistrationPayload(data: FormData, submitForReview: boolean): ProviderVehicleRegistrationPayload {
  const ownerId = readText(data, "owner_id")
  const registrationNumber = readText(data, "registration_number")
  const registeredOwnerName = readText(data, "registered_owner_name")
  const chassisNumber = readText(data, "chassis_number")
  const vehicleType = readText(data, "vehicle_type")
  if (!ownerId || !registrationNumber || !registeredOwnerName || !chassisNumber || !vehicleType) throw new Error("Owner, registered owner name, registration number, chassis number, and vehicle type are required.")
  return {
    owner_id: ownerId, registration_number: registrationNumber,
    registration_number_display: readText(data, "registration_number_display"), registered_owner_name: registeredOwnerName,
    chassis_number: chassisNumber, engine_number: readText(data, "engine_number"), vehicle_type: vehicleType,
    vehicle_category: readText(data, "vehicle_category"), usage_type: readText(data, "usage_type"), body_type: readText(data, "body_type"), fuel_type: readText(data, "fuel_type"),
    brand: readText(data, "brand"), model: readText(data, "model"), manufacturing_year: readNumber(data, "manufacturing_year"),
    registration_date: readOptionalDdMmYyyyIso(data, "registration_date", "Registration date"), registration_authority: readText(data, "registration_authority"),
    engine_capacity_cc: readNumber(data, "engine_capacity_cc"), axle_count: readNumber(data, "axle_count"), gross_vehicle_weight_kg: readNumber(data, "gross_vehicle_weight_kg"), color: readText(data, "color"), seating_capacity: readNumber(data, "seating_capacity"), load_capacity_kg: readNumber(data, "load_capacity_kg"),
    vts_installation_date: readOptionalDdMmYyyyIso(data, "vts_installation_date", "VTS installation date"),
    route_permit_number: readText(data, "route_permit_number"), route_permit_area: readText(data, "route_permit_area"),
    route_permit_expiry_date: readOptionalDdMmYyyyIso(data, "route_permit_expiry_date", "Route permit expiry"), fitness_expiry_date: readOptionalDdMmYyyyIso(data, "fitness_expiry_date", "Fitness expiry"), tax_token_expiry_date: readOptionalDdMmYyyyIso(data, "tax_token_expiry_date", "Tax token expiry"), insurance_expiry_date: readOptionalDdMmYyyyIso(data, "insurance_expiry_date", "Insurance expiry"),
    notes: readText(data, "notes"), default_speed_limit_kph: readNumber(data, "default_speed_limit_kph") || 80, submit_for_review: submitForReview,
  }
}
