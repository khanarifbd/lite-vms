"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { Eye, EyeOff, Loader2, ShieldCheck, UserPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { registerVehicleOwnerApplicant } from "@/lib/auth/browser"

const schema = z
  .object({
    ownerType: z.enum(["individual", "company"]),
    fullName: z.string().trim().min(2, "Enter the owner or company name").max(180),
    mobile: z.string().trim().min(10, "Enter a valid mobile number").max(30),
    password: z.string().min(6, "Use at least 6 characters").max(128),
    confirmPassword: z.string().min(6, "Confirm the password").max(128),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type Values = z.infer<typeof schema>

export function VehicleOwnerSignupForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      ownerType: "individual",
      fullName: "",
      mobile: "+880",
      password: "",
      confirmPassword: "",
    },
  })
  const mutation = useMutation({ mutationFn: registerVehicleOwnerApplicant })
  const loading = isSubmitting || mutation.isPending

  const onSubmit = async (values: Values) => {
    try {
      await mutation.mutateAsync(values)
      toast.success("Owner applicant account created", {
        description: "Complete and submit your owner application for Bangladesh Police verification.",
      })
      router.replace("/owner/application")
      router.refresh()
    } catch (error) {
      setError("root", {
        message:
          error instanceof Error ? error.message : "Unable to create the owner applicant account.",
      })
    }
  }

  const fieldError = (message?: string) =>
    message ? <p className="text-xs text-destructive">{message}</p> : null

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ownerType" className="text-xs sm:text-sm">
            Owner type
          </Label>
          <select
            id="ownerType"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            disabled={loading}
            {...register("ownerType")}
          >
            <option value="individual">Individual vehicle owner</option>
            <option value="company">Company / fleet owner</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mobile" className="text-xs sm:text-sm">
            Mobile number
          </Label>
          <Input
            id="mobile"
            type="tel"
            autoComplete="tel"
            placeholder="+8801712345678"
            className="h-10 text-sm"
            disabled={loading}
            aria-invalid={Boolean(errors.mobile)}
            {...register("mobile")}
          />
          {fieldError(errors.mobile?.message)}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fullName" className="text-xs sm:text-sm">
            Owner or company name
          </Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Enter the owner or company name"
            className="h-10 text-sm"
            disabled={loading}
            aria-invalid={Boolean(errors.fullName)}
            {...register("fullName")}
          />
          {fieldError(errors.fullName?.message)}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs sm:text-sm">
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Minimum 6 characters"
              className="h-10 pr-10 text-sm"
              disabled={loading}
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide passwords" : "Show passwords"}
              disabled={loading}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {fieldError(errors.password?.message)}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-xs sm:text-sm">
            Confirm password
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Enter password again"
            className="h-10 text-sm"
            disabled={loading}
            aria-invalid={Boolean(errors.confirmPassword)}
            {...register("confirmPassword")}
          />
          {fieldError(errors.confirmPassword?.message)}
        </div>
      </div>

      <p className="text-[11px] leading-4 text-muted-foreground sm:text-xs">
        Your mobile number becomes the primary login identifier. Email and username can be added
        later from Settings.
      </p>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-900">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            This creates an Owner Applicant account. Complete the individual or company profile,
            upload required documents, and submit it for review after sign-in.
          </p>
        </div>
      </div>

      {errors.root ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
          {errors.root.message}
        </div>
      ) : null}

      <Button
        type="submit"
        className="h-10 w-full bg-emerald-800 text-sm text-white hover:bg-emerald-900"
        disabled={loading}
      >
        {loading ? <Loader2 className="animate-spin" /> : <UserPlus className="size-4" />}
        {loading ? "Creating account..." : "Create owner applicant account"}
      </Button>
    </form>
  )
}
