import { z } from "zod"

export const providerStaffRoleSchema = z.enum([
  "vts_operator",
  "vts_technical",
  "vts_viewer",
])

const optionalMobileSchema = z
  .string()
  .trim()
  .max(30)
  .optional()
  .transform((value) => value || null)

const optionalTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null)

export const createProviderStaffSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(180),
  email: z.string().trim().email("Enter a valid email address").max(180),
  mobile: optionalMobileSchema,
  temporaryPassword: z
    .string()
    .min(12, "Temporary password must contain at least 12 characters")
    .max(128),
  roleCode: providerStaffRoleSchema,
  employeeId: optionalTextSchema(100),
  designation: optionalTextSchema(140),
  isTechnicalContact: z.boolean(),
})

export const updateProviderStaffSchema = z.object({
  displayName: z.string().trim().min(2, "Full name is required").max(180),
  email: z.string().trim().email("Enter a valid email address").max(180),
  mobile: optionalMobileSchema,
  roleCode: providerStaffRoleSchema,
  employeeId: optionalTextSchema(100),
  designation: optionalTextSchema(140),
  isTechnicalContact: z.boolean(),
  status: z.enum(["active", "suspended", "disabled"]),
})

export const resetProviderStaffPasswordSchema = z.object({
  newPassword: z.string().min(12, "Password must contain at least 12 characters").max(128),
  reason: optionalTextSchema(500),
})

export type CreateProviderStaffValues = z.infer<typeof createProviderStaffSchema>
export type UpdateProviderStaffValues = z.infer<typeof updateProviderStaffSchema>
export type ResetProviderStaffPasswordValues = z.infer<
  typeof resetProviderStaffPasswordSchema
>
