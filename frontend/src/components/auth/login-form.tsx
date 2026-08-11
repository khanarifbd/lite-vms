"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { Eye, EyeOff, Loader2, LockKeyhole, UserRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginUser } from "@/lib/auth/browser"
import { dashboardPathForUser } from "@/lib/auth/roles"

const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, "Enter a valid username, email address, or mobile number"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean(),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
      rememberMe: false,
    },
  })

  const loginMutation = useMutation({
    mutationFn: loginUser,
  })

  const onSubmit = async (values: LoginValues) => {
    clearErrors("root")

    try {
      const result = await loginMutation.mutateAsync(values)
      toast.success("Signed in successfully", {
        description: `Welcome back, ${result.user.display_name}.`,
      })
      router.replace(
        result.mustChangePassword ? "/change-password" : dashboardPathForUser(result.user)
      )
      router.refresh()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sign in. Please try again."
      setError("root", { message })
    }
  }

  const isLoading = isSubmitting || loginMutation.isPending

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="identifier" className="text-xs sm:text-sm">
          Username, email, or mobile
        </Label>
        <div className="relative">
          <UserRound
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="identifier"
            autoComplete="username"
            className="h-10 pl-10 text-sm"
            placeholder="Enter your username, email, or mobile"
            aria-invalid={Boolean(errors.identifier)}
            disabled={isLoading}
            {...register("identifier")}
          />
        </div>
        {errors.identifier ? (
          <p className="text-xs text-destructive">{errors.identifier.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs sm:text-sm">
          Password
        </Label>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="h-10 px-10 text-sm"
            placeholder="Enter your password"
            aria-invalid={Boolean(errors.password)}
            disabled={isLoading}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            aria-label={showPassword ? "Hide password" : "Show password"}
            disabled={isLoading}
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-3 text-[11px] sm:text-xs">
        <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 size-3.5 rounded border-input accent-emerald-700"
            disabled={isLoading}
            {...register("rememberMe")}
          />
          <span>Remember this device</span>
        </label>
        <span className="max-w-40 text-right leading-4 text-muted-foreground">
          Contact your administrator for access
        </span>
      </div>

      {errors.root ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
        >
          {errors.root.message}
        </div>
      ) : null}

      <Button
        type="submit"
        className="h-10 w-full bg-emerald-800 text-sm text-white hover:bg-emerald-900"
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <LockKeyhole aria-hidden="true" className="size-4" />
        )}
        {isLoading ? "Signing in..." : "Sign in securely"}
      </Button>
    </form>
  )
}
