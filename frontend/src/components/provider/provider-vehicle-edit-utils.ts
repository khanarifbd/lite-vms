import { readOptionalDdMmYyyyIso } from "@/components/ui/date-input"
import { readNumber, readText } from "@/components/provider/provider-vehicle-form-utils"
import type { VehicleDetails, VehicleUpdatePayload } from "@/features/vehicles/types"

export function buildProviderVehicleUpdate(data: FormData, vehicle: VehicleDetails): VehicleUpdatePayload {
  const imported = vehicle.registration_number.startsWith("GOMAX-")
  const registrationNumber = imported ? readText(data, "official_registration_number") || vehicle.registration_number : readText(data, "registration_number")
  const ownerName = readText(data, "registered_owner_name")
  const chassis = readText(data, "chassis_number")
  const vehicleType = readText(data, "vehicle_type")
  if (!registrationNumber || !ownerName || !chassis || !vehicleType) throw new Error("Registered owner name, registration number, chassis number, and vehicle type are required.")
  return {
    registration_number: registrationNumber,
    registration_number_display: imported ? readText(data, "vehicle_display_name") : readText(data, "registration_number_display"),
    registered_owner_name: ownerName, chassis_number: chassis, engine_number: readText(data, "engine_number"), vehicle_type: vehicleType,
    vehicle_category: readText(data, "vehicle_category"), usage_type: readText(data, "usage_type"), body_type: readText(data, "body_type"), fuel_type: readText(data, "fuel_type"),
    brand: readText(data, "brand"), model: readText(data, "model"), manufacturing_year: readNumber(data, "manufacturing_year"),
    registration_date: readOptionalDdMmYyyyIso(data, "registration_date", "Registration date"), registration_authority: readText(data, "registration_authority"),
    engine_capacity_cc: readNumber(data, "engine_capacity_cc"), axle_count: readNumber(data, "axle_count"), gross_vehicle_weight_kg: readNumber(data, "gross_vehicle_weight_kg"), color: readText(data, "color"), seating_capacity: readNumber(data, "seating_capacity"), load_capacity_kg: readNumber(data, "load_capacity_kg"),
    vts_installation_date: readOptionalDdMmYyyyIso(data, "vts_installation_date", "VTS installation date"),
    fitness_expiry_date: readOptionalDdMmYyyyIso(data, "fitness_expiry_date", "Fitness expiry"), tax_token_expiry_date: readOptionalDdMmYyyyIso(data, "tax_token_expiry_date", "Tax token expiry"), insurance_expiry_date: readOptionalDdMmYyyyIso(data, "insurance_expiry_date", "Insurance expiry"),
    route_permit_number: readText(data, "route_permit_number"), route_permit_area: readText(data, "route_permit_area"), route_permit_expiry_date: readOptionalDdMmYyyyIso(data, "route_permit_expiry_date", "Route permit expiry"),
    notes: readText(data, "notes"), default_speed_limit_kph: readNumber(data, "default_speed_limit_kph") || 80,
  }
}
