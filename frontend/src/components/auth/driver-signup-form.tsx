"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { Eye, EyeOff, IdCard, Loader2, Phone, ShieldCheck, UserRoundPlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { registerDriverApplicant } from "@/lib/auth/browser"

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(180),
    mobile: z.string().trim().min(10, "Enter a valid mobile number").max(30),
    email: z
      .string()
      .trim()
      .max(180)
      .refine(
        (value) => value.length === 0 || z.string().email().safeParse(value).success,
        "Enter a valid email address"
      ),
    licenceNumber: z.string().trim().min(3, "Enter your driving licence number").max(100),
    licenceType: z.enum(["professional", "non_professional", "learner"]),
    licenceExpiryDate: z.string().min(1, "Select the licence expiry date"),
    password: z.string().min(12, "Use at least 12 characters").max(128),
    confirmPassword: z.string().min(12, "Confirm the password").max(128),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (value) => {
      const expiry = new Date(`${value.licenceExpiryDate}T00:00:00`)
      return !Number.isNaN(expiry.getTime()) && expiry > new Date()
    },
    { message: "Driving licence must not be expired", path: ["licenceExpiryDate"] }
  )

type Values = z.infer<typeof schema>

export function DriverSignupForm() {
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
      fullName: "",
      mobile: "+880",
      email: "",
      licenceNumber: "",
      licenceType: "professional",
      licenceExpiryDate: "",
      password: "",
      confirmPassword: "",
    },
  })

  const mutation = useMutation({ mutationFn: registerDriverApplicant })
  const loading = isSubmitting || mutation.isPending

  const onSubmit = async (values: Values) => {
    try {
      await mutation.mutateAsync(values)
      toast.success("Driver account created", {
        description: "You can use your mobile number to sign in. Complete the NID verification application next.",
      })
      router.replace("/driver/application")
      router.refresh()
    } catch (error) {
      setError("root", {
        message: error instanceof Error ? error.message : "Unable to create the driver account.",
      })
    }
  }

  const fieldError = (message?: string) =>
    message ? <p className="text-xs text-destructive">{message}</p> : null

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fullName" className="text-xs sm:text-sm">Full name</Label>
          <Input id="fullName" autoComplete="name" className="h-10 text-sm" placeholder="Enter your full name" disabled={loading} {...register("fullName")} />
          {fieldError(errors.fullName?.message)}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="mobile" className="flex items-center gap-1.5 text-xs sm:text-sm">
            Mobile number <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="mobile" autoComplete="tel" inputMode="tel" className="h-10 pl-9 text-sm" placeholder="+8801712345678" disabled={loading} {...register("mobile")} />
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">This mobile number will be your login identifier.</p>
          {fieldError(errors.mobile?.message)}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs sm:text-sm">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="email" type="email" autoComplete="email" className="h-10 text-sm" placeholder="Optional email address" disabled={loading} {...register("email")} />
          {fieldError(errors.email?.message)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="licenceNumber" className="text-xs sm:text-sm">Driving licence number</Label>
          <Input id="licenceNumber" className="h-10 text-sm uppercase" placeholder="BRTA licence number" disabled={loading} {...register("licenceNumber")} />
          {fieldError(errors.licenceNumber?.message)}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="licenceType" className="text-xs sm:text-sm">Licence type</Label>
          <select id="licenceType" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={loading} {...register("licenceType")}>
            <option value="professional">Professional</option>
            <option value="non_professional">Non-professional</option>
            <option value="learner">Learner</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="licenceExpiryDate" className="text-xs sm:text-sm">Licence expiry</Label>
          <Input id="licenceExpiryDate" type="date" className="h-10 px-2 text-sm" disabled={loading} {...register("licenceExpiryDate")} />
          {fieldError(errors.licenceExpiryDate?.message)}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs sm:text-sm">Password</Label>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" className="h-10 pr-10 text-sm" placeholder="Minimum 12 characters" disabled={loading} {...register("password")} />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" disabled={loading} aria-label={showPassword ? "Hide passwords" : "Show passwords"}>
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {fieldError(errors.password?.message)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-xs sm:text-sm">Confirm password</Label>
          <Input id="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" className="h-10 text-sm" placeholder="Enter password again" disabled={loading} {...register("confirmPassword")} />
          {fieldError(errors.confirmPassword?.message)}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-900">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>Only the mobile number is required for account access. Email is optional. After sign-in, add the NID number and upload NID, licence, and driver photo for police verification.</p>
        </div>
      </div>

      {errors.root ? <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">{errors.root.message}</div> : null}

      <Button type="submit" className="h-10 w-full bg-emerald-800 text-sm text-white hover:bg-emerald-900" disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <UserRoundPlus className="size-4" />}
        {loading ? "Creating account..." : "Register with mobile number"}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground">
        <IdCard className="size-3" /> NID will be collected during the verification application.
      </p>
    </form>
  )
}
