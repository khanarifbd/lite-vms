"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm, type UseFormRegister } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changePassword } from "@/lib/auth/browser"

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(12, "New password must contain at least 12 characters")
      .max(128, "New password is too long"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  })

type PasswordValues = z.infer<typeof passwordSchema>

type PasswordInputProps = {
  id: keyof PasswordValues
  label: string
  placeholder: string
  autoComplete: string
  error?: string
  disabled: boolean
  register: UseFormRegister<PasswordValues>
}

function PasswordInput({
  id,
  label,
  placeholder,
  autoComplete,
  error,
  disabled,
  register,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <LockKeyhole
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="h-11 px-10"
          aria-invalid={Boolean(error)}
          disabled={disabled}
          {...register(id)}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          disabled={disabled}
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

export function ChangePasswordForm() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  const passwordMutation = useMutation({ mutationFn: changePassword })

  const onSubmit = async (values: PasswordValues) => {
    clearErrors("root")

    try {
      const result = await passwordMutation.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      toast.success(result.message)
      router.replace("/login")
      router.refresh()
    } catch (error) {
      setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Unable to change the password. Please try again.",
      })
    }
  }

  const isLoading = isSubmitting || passwordMutation.isPending

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <PasswordInput
        id="currentPassword"
        label="Current password"
        placeholder="Enter your current password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        disabled={isLoading}
        register={register}
      />
      <PasswordInput
        id="newPassword"
        label="New password"
        placeholder="Create a secure new password"
        autoComplete="new-password"
        error={errors.newPassword?.message}
        disabled={isLoading}
        register={register}
      />
      <PasswordInput
        id="confirmPassword"
        label="Confirm new password"
        placeholder="Enter the new password again"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        disabled={isLoading}
        register={register}
      />

      {errors.root ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {errors.root.message}
        </div>
      ) : null}

      <Button
        type="submit"
        className="h-11 w-full bg-emerald-800 text-white hover:bg-emerald-900"
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <LockKeyhole aria-hidden="true" />
        )}
        {isLoading ? "Updating password..." : "Update password"}
      </Button>
    </form>
  )
}
