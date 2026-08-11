import type { VehicleDocumentType } from "@/features/vehicles/document-types"

export type VehicleDocumentDefinition = {
  value: VehicleDocumentType
  label: string
  description: string
}

export const VEHICLE_DOCUMENT_DEFINITIONS: readonly VehicleDocumentDefinition[] = [
  {
    value: "registration",
    label: "Registration certificate",
    description: "BRTA registration certificate or smart card copy.",
  },
  {
    value: "fitness",
    label: "Fitness certificate",
    description: "Current fitness certificate and expiry date.",
  },
  {
    value: "tax_token",
    label: "Tax token",
    description: "Current tax token and expiry date.",
  },
  {
    value: "insurance",
    label: "Insurance",
    description: "Active motor insurance policy and expiry date.",
  },
  {
    value: "route_permit",
    label: "Route permit",
    description: "Route permit file, number, and expiry date.",
  },
]
