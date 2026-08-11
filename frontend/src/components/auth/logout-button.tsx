"use client"

import { useMutation } from "@tanstack/react-query"
import { Loader2, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { logoutUser } from "@/lib/auth/browser"
import { cn } from "@/lib/utils"

export function LogoutButton({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
} = {}) {
  const router = useRouter()
  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      toast.success("Signed out successfully")
      router.replace("/login")
      router.refresh()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to sign out.")
    },
  })

  const label = logoutMutation.isPending ? "Signing out..." : "Sign out"

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "default"}
      className={cn(compact && "size-10 rounded-xl", className)}
      onClick={() => logoutMutation.mutate()}
      disabled={logoutMutation.isPending}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
    >
      {logoutMutation.isPending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <LogOut aria-hidden="true" />
      )}
      {compact ? <span className="sr-only">{label}</span> : label}
    </Button>
  )
}
