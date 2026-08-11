import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"

type VehicleWorkspaceHeroProps = {
  eyebrow: string
  title: string
  description: ReactNode
  icon?: ReactNode
  actions?: ReactNode
}

export function VehicleWorkspaceHero({
  eyebrow,
  title,
  description,
  icon,
  actions,
}: VehicleWorkspaceHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl sm:px-8 lg:px-10">
      <div className="absolute -right-16 -top-24 size-80 rounded-full border border-white/10" />
      <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <Badge className="border-white/15 bg-white/10 text-emerald-100 hover:bg-white/10">
            {eyebrow}
          </Badge>
          <h1 className="mt-5 flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {icon}
            {title}
          </h1>
          <div className="mt-3 max-w-2xl text-base leading-7 text-emerald-100/75">
            {description}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  )
}
