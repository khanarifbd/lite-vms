"use client"

import {
  Building2,
  CalendarDays,
  CarFront,
  Clock3,
  Crosshair,
  ExternalLink,
  FileCheck2,
  Gauge,
  Loader2,
  MapPinned,
  Maximize2,
  Navigation,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Route,
  Search,
  SkipBack,
  SkipForward,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

import { LiveFleetMap } from "@/components/super-admin/live-fleet-map"
import { LivePlaybackMap } from "@/components/super-admin/live-playback-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type {
  MonitoringFleetCounts,
  MonitoringPlayback,
  MonitoringPlaybackPoint,
  MonitoringVehicle,
  MonitoringVehicleCursorPage,
  MonitoringVehicleDetail,
  MonitoringVehicleFilter,
  NationalMonitoringDashboard,
} from "@/features/super-admin/monitoring"
import { cn } from "@/lib/utils"

type WorkspaceMode = "objects" | "playback"
type PlaybackSpeed = 1 | 2 | 4 | 8
type LiveDetailTab = "overview" | "documents"
type DocumentTone = "missing" | "expired" | "warning" | "valid"

const PANEL_STORAGE_KEY = "bnvp:live-map-object-panel-width"
const VEHICLE_PAGE_SIZE = 100
const DETAIL_CACHE_MS = 30_000
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000
const HOUR_IN_MILLISECONDS = 60 * 60 * 1000
const MAXIMUM_PLAYBACK_WINDOW_MS = 24 * HOUR_IN_MILLISECONDS
const MINIMUM_REFRESH_SECONDS = 15
const MAXIMUM_REFRESH_SECONDS = 3600
const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
})
const documentDateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeZone: "UTC",
})
const pointTimeFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "medium",
})

function formatDate(value: string | null) {
  if (!value) return "No signal received"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "No signal received" : dateFormatter.format(date)
}

function formatPointTime(value: string | null) {
  if (!value) return "No playback point"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : pointTimeFormatter.format(date)
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours || days) parts.push(`${hours}h`)
  if (minutes || hours || days) parts.push(`${minutes}m`)
  parts.push(`${remainingSeconds}s`)
  return parts.join(" ")
}

function formatRefreshCountdown(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
}

function normalizeRefreshInterval(value: number) {
  if (!Number.isFinite(value)) return 30
  return Math.min(
    MAXIMUM_REFRESH_SECONDS,
    Math.max(MINIMUM_REFRESH_SECONDS, Math.floor(value)),
  )
}

function dhakaTodayUtc() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day))
}

function dateOnlyToUtc(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function documentExpiryState(expiresAt: string | null) {
  if (!expiresAt) {
    return {
      tone: "missing" as DocumentTone,
      title: "Not recorded",
      detail: "No expiry date",
    }
  }

  const expiryUtc = dateOnlyToUtc(expiresAt)
  if (expiryUtc === null) {
    return {
      tone: "missing" as DocumentTone,
      title: "Invalid date",
      detail: expiresAt,
    }
  }

  const days = Math.round((expiryUtc - dhakaTodayUtc()) / DAY_IN_MILLISECONDS)
  const formattedDate = documentDateFormatter.format(new Date(expiryUtc))

  if (days < 0) {
    const elapsed = Math.abs(days)
    return {
      tone: "expired" as DocumentTone,
      title: `${elapsed} day${elapsed === 1 ? "" : "s"} expired`,
      detail: `Expired ${formattedDate}`,
    }
  }

  if (days === 0) {
    return {
      tone: "warning" as DocumentTone,
      title: "Expires today",
      detail: formattedDate,
    }
  }

  return {
    tone: days <= 30 ? ("warning" as DocumentTone) : ("valid" as DocumentTone),
    title: `${days} day${days === 1 ? "" : "s"} left`,
    detail: `Expires ${formattedDate}`,
  }
}

function DocumentExpiryCard({ label, expiresAt }: { label: string; expiresAt: string | null }) {
  const state = documentExpiryState(expiresAt)
  const toneClass = {
    missing: "border-slate-200 bg-slate-50 text-slate-700",
    expired: "border-rose-200 bg-rose-50 text-rose-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    valid: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[state.tone]
  const iconClass = {
    missing: "bg-slate-200 text-slate-600",
    expired: "bg-rose-100 text-rose-700",
    warning: "bg-amber-100 text-amber-700",
    valid: "bg-emerald-100 text-emerald-700",
  }[state.tone]

  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-3", toneClass)}>
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", iconClass)}>
        <FileCheck2 className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</p>
        <p className="mt-0.5 text-sm font-semibold">{state.title}</p>
        <p className="mt-0.5 truncate text-[11px] opacity-75">{state.detail}</p>
      </div>
    </div>
  )
}

function toLocalDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function latestPlaybackWindow() {
  const end = new Date()
  return {
    start: new Date(end.getTime() - HOUR_IN_MILLISECONDS),
    end,
  }
}

function initialCounts(data: NationalMonitoringDashboard): MonitoringFleetCounts {
  return {
    all: data.stats.tracked_vehicles || data.vehicles.length,
    online: data.stats.online_vehicles,
    offline: data.stats.offline_vehicles,
    moving: data.stats.moving_vehicles,
    idle: data.stats.idle_vehicles,
    stopped: data.stats.stopped_vehicles,
    no_data: data.stats.no_data_vehicles,
  }
}

function currentSpeed(vehicle: MonitoringVehicle) {
  if (!vehicle.online || vehicle.movement_state === "offline" || vehicle.movement_state === "no_data") {
    return 0
  }
  return Math.max(0, vehicle.speed_kph || 0)
}

function normalizeVehicle(vehicle: MonitoringVehicle): MonitoringVehicle {
  return {
    ...vehicle,
    last_known_speed_kph: vehicle.last_known_speed_kph ?? vehicle.speed_kph,
    speed_kph: currentSpeed(vehicle),
  }
}

function vehicleTone(vehicle: MonitoringVehicle) {
  if (vehicle.movement_state === "no_data") {
    return {
      dot: "bg-slate-400",
      icon: "bg-slate-100 text-slate-500",
      badge: "border-slate-200 bg-slate-50 text-slate-600",
      row: "bg-slate-50/45",
      text: "text-slate-600",
    }
  }
  if (vehicle.movement_state === "offline") {
    return {
      dot: "bg-rose-500",
      icon: "bg-rose-50 text-rose-700",
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      row: "bg-rose-50/55",
      text: "text-rose-700",
    }
  }
  if (vehicle.movement_state === "moving") {
    return {
      dot: "bg-lime-500",
      icon: "bg-lime-100 text-lime-700",
      badge: "border-lime-300 bg-lime-100 text-lime-800",
      row: "bg-lime-100/65",
      text: "text-lime-700",
    }
  }
  if (vehicle.movement_state === "idle") {
    return {
      dot: "bg-orange-500",
      icon: "bg-orange-50 text-orange-600",
      badge: "border-orange-200 bg-orange-50 text-orange-700",
      row: "bg-orange-50/55",
      text: "text-orange-700",
    }
  }
  return {
    dot: "bg-sky-500",
    icon: "bg-sky-50 text-sky-600",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    row: "bg-sky-50/45",
    text: "text-sky-700",
  }
}

function SpeedGauge({ speed, maxSpeed = 140 }: { speed: number; maxSpeed?: number }) {
  const maximum = Math.max(40, maxSpeed)
  const ratio = Math.min(1, Math.max(0, speed / maximum))
  const angle = Math.PI * (1 + ratio)
  const needleX = 80 + Math.cos(angle) * 50
  const needleY = 78 + Math.sin(angle) * 50

  return (
    <div className="relative mx-auto h-[112px] w-[180px]">
      <svg viewBox="0 0 160 100" className="h-full w-full" aria-label={`${Math.round(speed)} kilometres per hour`}>
        <path d="M20 78 A60 60 0 0 1 140 78" fill="none" stroke="#dcfce7" strokeWidth="18" strokeLinecap="round" />
        <path d="M20 78 A60 60 0 0 1 80 18" fill="none" stroke="#16a34a" strokeWidth="18" strokeLinecap="round" />
        <path d="M80 18 A60 60 0 0 1 122 36" fill="none" stroke="#f59e0b" strokeWidth="18" strokeLinecap="round" />
        <path d="M122 36 A60 60 0 0 1 140 78" fill="none" stroke="#ef4444" strokeWidth="18" strokeLinecap="round" />
        <line x1="80" y1="78" x2={needleX} y2={needleY} stroke="#0f766e" strokeWidth="5" strokeLinecap="round" />
        <circle cx="80" cy="78" r="7" fill="#0f766e" />
        <text x="17" y="96" fontSize="9" fill="#64748b">0</text>
        <text x="132" y="96" fontSize="9" fill="#64748b">{maximum}</text>
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-2xl font-bold text-slate-900">{Math.round(speed)}</p>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">km/h</p>
      </div>
    </div>
  )
}

function VehicleRow({
  vehicle,
  selected,
  elapsedSeconds,
  onSelect,
}: {
  vehicle: MonitoringVehicle
  selected: boolean
  elapsedSeconds: number
  onSelect: () => void
}) {
  const tone = vehicleTone(vehicle)
  const registration = vehicle.registration_number_display || vehicle.registration_number
  const speed = currentSpeed(vehicle)
  const hasCoordinates = vehicle.latitude != null && vehicle.longitude != null

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full border-b px-2.5 py-2 text-left transition hover:brightness-[0.98]",
        tone.row,
        selected && "shadow-[inset_4px_0_0_#0f766e] ring-1 ring-inset ring-emerald-300",
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-xl", tone.icon)}>
          <Navigation
            className="size-5"
            style={{ transform: `rotate(${Number.isFinite(vehicle.heading) ? vehicle.heading : 0}deg)` }}
          />
          <span className={cn("absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-white", tone.dot)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[12px] font-semibold text-slate-900">{registration}</p>
            <p className={cn("shrink-0 text-[12px] font-bold", vehicle.online ? "text-slate-900" : "text-slate-500")}>
              {Math.round(speed)} km/h
            </p>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2 text-[10px] font-semibold">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={tone.text}>{statusLabel(vehicle.movement_state)}</span>
              <span className="truncate font-mono text-slate-500">{formatDuration(elapsedSeconds)}</span>
            </span>
            {!hasCoordinates ? <Badge variant="outline" className="h-4 px-1 text-[8px]">No GPS</Badge> : null}
          </div>
        </div>
      </div>
    </button>
  )
}

function IdentityRow({
  icon,
  label,
  name,
  meta,
}: {
  icon: ReactNode
  label: string
  name: string
  meta?: string | null
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border bg-white px-3 py-2.5">
      <span className="mt-0.5 text-emerald-700">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
        {meta ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</p> : null}
      </div>
    </div>
  )
}

function LiveVehicleDetails({
  vehicle,
  elapsedSeconds,
  detail,
  detailLoading,
  detailError,
}: {
  vehicle: MonitoringVehicle
  elapsedSeconds: number
  detail: MonitoringVehicleDetail | null
  detailLoading: boolean
  detailError: string | null
}) {
  const [activeTab, setActiveTab] = useState<LiveDetailTab>("overview")
  const speed = currentSpeed(vehicle)
  const lastKnownSpeed = Math.max(0, vehicle.last_known_speed_kph || 0)

  useEffect(() => {
    setActiveTab("overview")
  }, [vehicle.id])

  return (
    <div className="absolute right-4 top-4 z-[600] max-h-[calc(100%-2rem)] w-[min(410px,calc(100%-2rem))] overflow-y-auto rounded-2xl border bg-white/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-full", vehicleTone(vehicle).dot)} />
            <p className="truncate font-semibold">{vehicle.registration_number_display || vehicle.registration_number}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Vehicle live monitoring details</p>
        </div>
        <Badge variant="outline" className={vehicleTone(vehicle).badge}>{statusLabel(vehicle.movement_state)}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_150px] items-center gap-2 rounded-xl bg-slate-50 p-3">
        <div>
          <p className="font-semibold text-slate-900">{statusLabel(vehicle.movement_state)}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{formatDuration(elapsedSeconds)}</p>
          <div className="mt-3 space-y-1.5 text-xs text-slate-600">
            <p className="flex items-center gap-2"><RadioTower className="size-3.5 text-emerald-700" /> GPS {vehicle.online ? "online" : "offline"}</p>
            {!vehicle.online && lastKnownSpeed > 0 ? <p className="text-slate-500">Last known speed: {Math.round(lastKnownSpeed)} km/h</p> : null}
          </div>
        </div>
        <SpeedGauge speed={speed} />
      </div>

      <div className="mt-3 grid grid-cols-2 rounded-xl border bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition",
            activeTab === "overview"
              ? "bg-white text-emerald-800 shadow-sm"
              : "text-slate-500 hover:bg-white/70",
          )}
        >
          <Gauge className="size-3.5" /> Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition",
            activeTab === "documents"
              ? "bg-white text-emerald-800 shadow-sm"
              : "text-slate-500 hover:bg-white/70",
          )}
        >
          <CalendarDays className="size-3.5" /> Documents
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border bg-slate-50 px-3 py-6 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading vehicle details…
          </div>
        ) : detailError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700">{detailError}</div>
        ) : detail && activeTab === "overview" ? (
          <>
            <IdentityRow
              icon={<Building2 className="size-4" />}
              label="Vehicle owner"
              name={detail.owner_name}
              meta={[detail.owner_code, detail.owner_phone].filter(Boolean).join(" · ") || null}
            />
            <IdentityRow
              icon={<RadioTower className="size-4" />}
              label="VTS provider"
              name={detail.provider_name || "No tracking provider assigned"}
              meta={[detail.provider_code, detail.provider_phone].filter(Boolean).join(" · ") || null}
            />
            <IdentityRow
              icon={<UserRound className="size-4" />}
              label="Driver"
              name={detail.driver_name || "No driver assigned"}
              meta={detail.driver_name
                ? [detail.driver_on_duty ? "On duty" : "Assigned", detail.driver_code, detail.driver_phone].filter(Boolean).join(" · ")
                : null}
            />
          </>
        ) : detail && activeTab === "documents" ? (
          <>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-xs text-cyan-900">
              Current compliance dates and remaining validity from today.
            </div>
            <DocumentExpiryCard label="Tax token" expiresAt={detail.tax_token_expiry_date} />
            <DocumentExpiryCard label="Fitness certificate" expiresAt={detail.fitness_expiry_date} />
            <DocumentExpiryCard label="Route permit" expiresAt={detail.route_permit_expiry_date} />
          </>
        ) : null}
      </div>

      <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="size-3" /> Last signal: {formatDate(vehicle.received_at || vehicle.recorded_at)}</p>
      <Button asChild size="sm" className="mt-3 w-full bg-emerald-800 text-white hover:bg-emerald-900">
        <Link href={activeTab === "documents" ? `/super-admin/vehicles/${vehicle.id}/documents` : `/super-admin/vehicles/${vehicle.id}`}>
          <ExternalLink /> {activeTab === "documents" ? "Open vehicle documents" : "Open vehicle details"}
        </Link>
      </Button>
    </div>
  )
}

function PlaybackDetails({ playback, point, currentIndex }: { playback: MonitoringPlayback; point: MonitoringPlaybackPoint; currentIndex: number }) {
  const progress = playback.points.length > 1 ? Math.round((currentIndex / (playback.points.length - 1)) * 100) : 100
  const gaugeMax = Math.max(120, Math.ceil(playback.max_speed_kph / 20) * 20)

  return (
    <div className="absolute right-4 top-4 z-[600] w-[min(380px,calc(100%-2rem))] rounded-2xl border bg-white/95 p-4 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Route className="size-4 text-emerald-700" /><p className="font-semibold">{playback.registration_number}</p></div>
          <p className="mt-1 text-xs text-muted-foreground">Playback point {currentIndex + 1} of {playback.total_points}</p>
        </div>
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{progress}%</Badge>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_150px] items-center gap-2 rounded-xl bg-slate-50 p-3">
        <div className="space-y-2 text-xs text-slate-600">
          <p className="font-semibold text-slate-900">{formatPointTime(point.recorded_at)}</p>
          <p>Heading: {Math.round(point.heading || 0)}°</p>
          <p>Ignition: {point.ignition == null ? "Unknown" : point.ignition ? "On" : "Off"}</p>
          <p>Distance: {playback.distance_km.toFixed(2)} km</p>
          <p>Max speed: {Math.round(playback.max_speed_kph)} km/h</p>
        </div>
        <SpeedGauge speed={point.speed_kph} maxSpeed={gaugeMax} />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${progress}%` }} /></div>
    </div>
  )
}

export function LiveTrackingWorkspace({
  initialData,
  refreshIntervalSeconds = 30,
}: {
  initialData: NationalMonitoringDashboard
  refreshIntervalSeconds?: number
}) {
  const refreshInterval = normalizeRefreshInterval(refreshIntervalSeconds)
  const [vehicles, setVehicles] = useState<MonitoringVehicle[]>(() => initialData.vehicles.map(normalizeVehicle))
  const [counts, setCounts] = useState<MonitoringFleetCounts>(() => initialCounts(initialData))
  const [generatedAt, setGeneratedAt] = useState(initialData.generated_at)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [mode, setMode] = useState<WorkspaceMode>("objects")
  const [filter, setFilter] = useState<MonitoringVehicleFilter>("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<MonitoringVehicleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(refreshInterval)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [panelWidth, setPanelWidth] = useState(405)
  const [detailsVisible, setDetailsVisible] = useState(true)

  const [playbackVehicleId, setPlaybackVehicleId] = useState(initialData.vehicles[0]?.id || "")
  const [playbackStart, setPlaybackStart] = useState("")
  const [playbackEnd, setPlaybackEnd] = useState("")
  const [playbackUsesLatestHour, setPlaybackUsesLatestHour] = useState(true)
  const [playback, setPlayback] = useState<MonitoringPlayback | null>(null)
  const [playbackLoading, setPlaybackLoading] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [playbackIndex, setPlaybackIndex] = useState(0)
  const [playbackPlaying, setPlaybackPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1)
  const [followCurrent, setFollowCurrent] = useState(true)
  const [fitRequest, setFitRequest] = useState(0)

  const mapShellRef = useRef<HTMLElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const detailCacheRef = useRef(new Map<string, { detail: MonitoringVehicleDetail; loadedAt: number }>())

  useEffect(() => {
    const latest = latestPlaybackWindow()
    setPlaybackStart(toLocalDateTimeInput(latest.start))
    setPlaybackEnd(toLocalDateTimeInput(latest.end))
    const savedWidth = Number(window.localStorage.getItem(PANEL_STORAGE_KEY))
    if (Number.isFinite(savedWidth) && savedWidth >= 300 && savedWidth <= 560) setPanelWidth(savedWidth)
  }, [])

  useEffect(() => {
    if (mode !== "playback" || !playbackUsesLatestHour) return
    const latest = latestPlaybackWindow()
    setPlaybackStart(toLocalDateTimeInput(latest.start))
    setPlaybackEnd(toLocalDateTimeInput(latest.end))
  }, [mode, playbackUsesLatestHour])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  const fetchVehiclePage = useCallback(async ({
    append,
    cursor,
    includeCounts,
  }: {
    append: boolean
    cursor?: string | null
    includeCounts: boolean
  }) => {
    if (append) setLoadingMore(true)
    else setRefreshing(true)

    try {
      const params = new URLSearchParams({
        state: filter,
        limit: String(VEHICLE_PAGE_SIZE),
        include_counts: String(includeCounts),
      })
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (cursor) params.set("cursor", cursor)

      const response = await fetch(`/api/super-admin/monitoring/vehicles?${params.toString()}`, { cache: "no-store" })
      const body = (await response.json()) as MonitoringVehicleCursorPage & { message?: string }
      if (!response.ok) throw new Error(body.message || "Unable to load monitoring vehicles.")

      const normalizedItems = body.items.map(normalizeVehicle)
      setVehicles((current) => {
        if (!append) return normalizedItems
        const merged = new Map(current.map((vehicle) => [vehicle.id, vehicle]))
        normalizedItems.forEach((vehicle) => merged.set(vehicle.id, vehicle))
        return [...merged.values()]
      })
      if (body.counts) setCounts(body.counts)
      setGeneratedAt(body.generated_at)
      setNextCursor(body.next_cursor)
      setHasNext(body.has_next)
      setClock(Date.now())
      setError(null)
      if (!append) {
        setSelectedVehicleId((current) =>
          current && normalizedItems.some((vehicle) => vehicle.id === current)
            ? current
            : null,
        )
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load monitoring vehicles.")
    } finally {
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [debouncedSearch, filter])

  useEffect(() => {
    if (mode !== "objects") return
    setSecondsUntilRefresh(refreshInterval)
    void fetchVehiclePage({ append: false, includeCounts: true })
  }, [debouncedSearch, fetchVehiclePage, filter, mode, refreshInterval])

  useEffect(() => {
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(clockTimer)
  }, [])

  useEffect(() => {
    setSecondsUntilRefresh(refreshInterval)
    if (mode !== "objects" || refreshing) return

    const refreshTimer = window.setInterval(() => {
      setSecondsUntilRefresh((current) => {
        if (current > 1) return current - 1
        void fetchVehiclePage({ append: false, includeCounts: true })
        return refreshInterval
      })
    }, 1_000)

    return () => window.clearInterval(refreshTimer)
  }, [fetchVehiclePage, mode, refreshInterval, refreshing])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasNext || loadingMore || mode !== "objects") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor) {
          void fetchVehiclePage({ append: true, cursor: nextCursor, includeCounts: false })
        }
      },
      { rootMargin: "180px" },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchVehiclePage, hasNext, loadingMore, mode, nextCursor])

  useEffect(() => {
    if (!selectedVehicleId || mode !== "objects" || !detailsVisible) {
      setSelectedDetail(null)
      setDetailLoading(false)
      setDetailError(null)
      return
    }

    const cached = detailCacheRef.current.get(selectedVehicleId)
    if (cached && Date.now() - cached.loadedAt < DETAIL_CACHE_MS) {
      setSelectedDetail(cached.detail)
      setDetailLoading(false)
      setDetailError(null)
      return
    }

    const controller = new AbortController()
    setSelectedDetail(null)
    setDetailLoading(true)
    setDetailError(null)

    void fetch(`/api/super-admin/monitoring/vehicles/${encodeURIComponent(selectedVehicleId)}/details`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as MonitoringVehicleDetail & { message?: string }
        if (!response.ok) throw new Error(body.message || "Unable to load vehicle details.")
        detailCacheRef.current.set(selectedVehicleId, { detail: body, loadedAt: Date.now() })
        setSelectedDetail(body)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setDetailError(cause instanceof Error ? cause.message : "Unable to load vehicle details.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })

    return () => controller.abort()
  }, [detailsVisible, mode, selectedVehicleId])

  useEffect(() => {
    if (!playbackPlaying || !playback?.points.length) return
    const interval = window.setInterval(() => {
      setPlaybackIndex((current) => {
        if (current >= playback.points.length - 1) {
          setPlaybackPlaying(false)
          return current
        }
        return current + 1
      })
    }, Math.max(80, Math.round(720 / playbackSpeed)))
    return () => window.clearInterval(interval)
  }, [playback, playbackPlaying, playbackSpeed])

  const generatedAtMs = new Date(generatedAt).getTime()
  const elapsedSinceResponse = Number.isNaN(generatedAtMs) ? 0 : Math.max(0, Math.floor((clock - generatedAtMs) / 1000))
  const liveDuration = (vehicle: MonitoringVehicle) => vehicle.state_duration_seconds + elapsedSinceResponse
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null
  const playbackPoint = playback?.points[Math.min(playbackIndex, Math.max(0, playback.points.length - 1))] || null
  const filteredTotal = filter === "all" ? counts.all : filter === "online" ? counts.online : counts[filter]

  const primaryFilters: Array<{ key: MonitoringVehicleFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "online", label: "Online", count: counts.online },
    { key: "offline", label: "Offline", count: counts.offline },
    { key: "no_data", label: "Inactive", count: counts.no_data },
  ]
  const movementFilters: Array<{ key: MonitoringVehicleFilter; label: string; count: number }> = [
    { key: "moving", label: "Moving", count: counts.moving },
    { key: "idle", label: "Idle", count: counts.idle },
    { key: "stopped", label: "Stopped", count: counts.stopped },
  ]

  function startPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth < 1024) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panelWidth
    let latestWidth = panelWidth
    const onMove = (moveEvent: PointerEvent) => {
      latestWidth = Math.min(560, Math.max(300, startWidth + moveEvent.clientX - startX))
      setPanelWidth(latestWidth)
      window.dispatchEvent(new Event("bnvp:layout-resize"))
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.localStorage.setItem(PANEL_STORAGE_KEY, String(latestWidth))
      window.dispatchEvent(new Event("bnvp:layout-resize"))
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  function resetLatestPlaybackWindow() {
    const latest = latestPlaybackWindow()
    setPlaybackUsesLatestHour(true)
    setPlaybackStart(toLocalDateTimeInput(latest.start))
    setPlaybackEnd(toLocalDateTimeInput(latest.end))
    setPlayback(null)
    setPlaybackError(null)
    setPlaybackPlaying(false)
    setPlaybackIndex(0)
  }

  async function loadPlayback() {
    if (!playbackVehicleId) {
      setPlaybackError("Select a vehicle.")
      return
    }

    let resolvedStart: Date
    let resolvedEnd: Date

    if (playbackUsesLatestHour) {
      const latest = latestPlaybackWindow()
      resolvedStart = latest.start
      resolvedEnd = latest.end
      setPlaybackStart(toLocalDateTimeInput(resolvedStart))
      setPlaybackEnd(toLocalDateTimeInput(resolvedEnd))
    } else {
      if (!playbackStart || !playbackEnd) {
        setPlaybackError("Select a playback start and end time.")
        return
      }
      resolvedStart = new Date(playbackStart)
      resolvedEnd = new Date(playbackEnd)
    }

    if (Number.isNaN(resolvedStart.getTime()) || Number.isNaN(resolvedEnd.getTime())) {
      setPlaybackError("Enter a valid playback start and end time.")
      return
    }

    const windowDuration = resolvedEnd.getTime() - resolvedStart.getTime()
    if (windowDuration <= 0) {
      setPlaybackError("Playback end time must be after the start time.")
      return
    }
    if (windowDuration > MAXIMUM_PLAYBACK_WINDOW_MS) {
      setPlaybackError("Playback time range cannot exceed 24 hours.")
      return
    }

    setPlaybackLoading(true)
    setPlaybackError(null)
    setPlaybackPlaying(false)
    setPlayback(null)
    setPlaybackIndex(0)

    try {
      const params = new URLSearchParams({
        start_at: resolvedStart.toISOString(),
        end_at: resolvedEnd.toISOString(),
        limit: "3000",
        request_at: String(Date.now()),
      })
      const response = await fetch(
        `/api/super-admin/monitoring/${encodeURIComponent(playbackVehicleId)}/playback?${params.toString()}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        },
      )
      const body = (await response.json()) as MonitoringPlayback & { message?: string }
      if (!response.ok) throw new Error(body.message || "Unable to load playback history.")
      setPlayback(body)
      setPlaybackIndex(0)
      setFitRequest((value) => value + 1)
    } catch (cause) {
      setPlayback(null)
      setPlaybackError(cause instanceof Error ? cause.message : "Unable to load playback history.")
    } finally {
      setPlaybackLoading(false)
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await mapShellRef.current?.requestFullscreen()
      else await document.exitFullscreen()
    } catch {
      // The map remains usable if the browser blocks fullscreen.
    }
  }

  function refreshNow() {
    setSecondsUntilRefresh(refreshInterval)
    void fetchVehiclePage({ append: false, includeCounts: true })
  }

  return (
    <div className="flex min-h-[calc(100vh-4.25rem)] flex-col bg-white">
      <header className="border-b bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
          <div>
            <div className="flex items-center gap-2">
              <MapPinned className="size-5 text-emerald-700" />
              <h1 className="text-xl font-semibold tracking-tight">National live tracking map</h1>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700"><span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" /> Live</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{counts.all.toLocaleString()} tracked · {counts.online.toLocaleString()} online · loaded {vehicles.length.toLocaleString()} · updated {formatDate(generatedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {error ? <p className="text-xs text-rose-700">{error}</p> : null}
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 text-xs font-medium text-cyan-900 shadow-sm" title={`Automatic refresh every ${refreshInterval} seconds`}>
              <Clock3 className="size-3.5" />
              <span className="hidden sm:inline">Refresh in</span>
              <span className="font-mono font-semibold tabular-nums">{formatRefreshCountdown(secondsUntilRefresh)}</span>
            </span>
            <Button type="button" size="sm" variant="outline" onClick={refreshNow} disabled={refreshing}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh</Button>
            <Button asChild size="sm" variant="outline"><Link href="/super-admin/monitoring"><Gauge /> Monitoring dashboard</Link></Button>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row" style={{ "--object-panel-width": `${panelWidth}px` } as CSSProperties}>
        <aside className="flex min-h-[520px] w-full shrink-0 flex-col border-r bg-white lg:h-[calc(100vh-8.7rem)] lg:w-[var(--object-panel-width)]">
          <div className="grid grid-cols-2 border-b bg-slate-50 p-1.5">
            <button type="button" onClick={() => setMode("objects")} className={cn("rounded-lg px-3 py-2 text-sm font-semibold transition", mode === "objects" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500 hover:bg-white/70")}>Objects</button>
            <button type="button" onClick={() => { setMode("playback"); setPlaybackVehicleId((current) => current || selectedVehicleId || vehicles[0]?.id || "") }} className={cn("rounded-lg px-3 py-2 text-sm font-semibold transition", mode === "playback" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500 hover:bg-white/70")}>Playback</button>
          </div>

          {mode === "objects" ? (
            <>
              <div className="border-b p-2.5">
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Registration, chassis or engine" className="h-9 pl-9" /></div>
                  <Button type="button" size="icon" variant="outline" className="size-9" onClick={refreshNow} disabled={refreshing}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}<span className="sr-only">Refresh objects</span></Button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {primaryFilters.map((item) => <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={cn("rounded-lg border px-1 py-1.5 text-center transition", filter === item.key ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}><span className="block text-[8px] font-medium">{item.label}</span><span className="mt-0.5 block text-xs font-semibold">{item.count.toLocaleString()}</span></button>)}
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {movementFilters.map((item) => <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={cn("rounded-lg border px-1 py-1.5 text-center transition", filter === item.key ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}><span className="block text-[8px] font-medium">{item.label}</span><span className="mt-0.5 block text-xs font-semibold">{item.count.toLocaleString()}</span></button>)}
                </div>
              </div>

              <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-1.5 text-[10px] text-muted-foreground"><span>Loaded {vehicles.length.toLocaleString()} of {filteredTotal.toLocaleString()}</span><span>Cursor feed · 100/batch</span></div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {vehicles.length ? vehicles.map((vehicle) => (
                  <VehicleRow
                    key={vehicle.id}
                    vehicle={vehicle}
                    selected={vehicle.id === selectedVehicleId}
                    elapsedSeconds={liveDuration(vehicle)}
                    onSelect={() => { setSelectedVehicleId(vehicle.id); setDetailsVisible(true) }}
                  />
                )) : <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><CarFront className="size-8 text-slate-400" /><p className="mt-3 font-medium">No vehicles found</p><p className="mt-1 text-xs text-muted-foreground">Change the search or status filter.</p></div>}
                <div ref={loadMoreRef} className="flex min-h-16 items-center justify-center p-3">
                  {loadingMore ? <span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading next 100 vehicles…</span> : hasNext ? <Button type="button" size="sm" variant="outline" onClick={() => void fetchVehiclePage({ append: true, cursor: nextCursor, includeCounts: false })}>Load more vehicles</Button> : vehicles.length ? <span className="text-[10px] text-muted-foreground">All matching vehicles loaded</span> : null}
                </div>
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="rounded-2xl border bg-slate-50 p-3">
                <div className="flex items-center gap-2"><Route className="size-4 text-emerald-700" /><p className="text-sm font-semibold">Vehicle playback</p></div>
                <p className="mt-1 text-xs text-muted-foreground">Load the latest hour or choose a custom telemetry window of up to 24 hours.</p>
                <label className="mt-4 block text-xs font-medium text-slate-700">Vehicle</label>
                <select
                  value={playbackVehicleId}
                  onChange={(event) => {
                    setPlaybackVehicleId(event.target.value)
                    setPlayback(null)
                    setPlaybackError(null)
                    setPlaybackPlaying(false)
                    setPlaybackIndex(0)
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">Select vehicle</option>
                  {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration_number_display || vehicle.registration_number}</option>)}
                </select>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-cyan-950">Latest one-hour window</p>
                    <p className="text-[10px] text-cyan-800">Refreshes the time range whenever playback is loaded.</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={playbackUsesLatestHour}
                      onChange={(event) => {
                        if (event.target.checked) resetLatestPlaybackWindow()
                        else setPlaybackUsesLatestHour(false)
                      }}
                      className="peer sr-only"
                    />
                    <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-cyan-700 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                    <span className="sr-only">Use latest one-hour playback window</span>
                  </label>
                </div>

                <label className="mt-3 block text-xs font-medium text-slate-700">Start time</label>
                <Input
                  type="datetime-local"
                  value={playbackStart}
                  onChange={(event) => {
                    setPlaybackStart(event.target.value)
                    setPlaybackUsesLatestHour(false)
                    setPlayback(null)
                    setPlaybackError(null)
                  }}
                  className="mt-1"
                />
                <label className="mt-3 block text-xs font-medium text-slate-700">End time</label>
                <Input
                  type="datetime-local"
                  value={playbackEnd}
                  onChange={(event) => {
                    setPlaybackEnd(event.target.value)
                    setPlaybackUsesLatestHour(false)
                    setPlayback(null)
                    setPlaybackError(null)
                  }}
                  className="mt-1"
                />
                <Button type="button" className="mt-4 w-full bg-emerald-800 text-white hover:bg-emerald-900" onClick={() => void loadPlayback()} disabled={playbackLoading}>{playbackLoading ? <><Loader2 className="animate-spin" /> Loading fresh history…</> : <><Play /> Load playback</>}</Button>
                {playbackError ? <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{playbackError}</p> : null}
              </div>

              {playback ? (
                <div className="mt-3 rounded-2xl border p-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 p-2"><p className="text-sm font-bold">{playback.total_points}</p><p className="text-[9px] text-muted-foreground">Points</p></div>
                    <div className="rounded-xl bg-slate-50 p-2"><p className="text-sm font-bold">{playback.distance_km.toFixed(2)}</p><p className="text-[9px] text-muted-foreground">Distance km</p></div>
                    <div className="rounded-xl bg-slate-50 p-2"><p className="text-sm font-bold">{Math.round(playback.max_speed_kph)}</p><p className="text-[9px] text-muted-foreground">Max km/h</p></div>
                  </div>
                  {playback.points.length ? (
                    <>
                      <input type="range" min={0} max={Math.max(0, playback.points.length - 1)} value={playbackIndex} onChange={(event) => { setPlaybackPlaying(false); setPlaybackIndex(Number(event.target.value)) }} className="mt-4 w-full accent-emerald-700" />
                      <div className="mt-2 flex items-center justify-center gap-1.5">
                        <Button type="button" size="icon" variant="outline" onClick={() => { setPlaybackPlaying(false); setPlaybackIndex(0) }}><SkipBack /><span className="sr-only">Start</span></Button>
                        <Button type="button" size="icon" className="bg-emerald-800 text-white hover:bg-emerald-900" onClick={() => setPlaybackPlaying((current) => !current)}>{playbackPlaying ? <Pause /> : <Play />}<span className="sr-only">{playbackPlaying ? "Pause" : "Play"}</span></Button>
                        <Button type="button" size="icon" variant="outline" onClick={() => { setPlaybackPlaying(false); setPlaybackIndex(Math.max(0, playback.points.length - 1)) }}><SkipForward /><span className="sr-only">End</span></Button>
                        <Button type="button" size="icon" variant="outline" onClick={() => { setPlaybackPlaying(false); setPlaybackIndex(0) }}><RotateCcw /><span className="sr-only">Reset</span></Button>
                      </div>
                      <div className="mt-3 grid grid-cols-4 gap-1.5">{([1, 2, 4, 8] as PlaybackSpeed[]).map((speed) => <button key={speed} type="button" onClick={() => setPlaybackSpeed(speed)} className={cn("rounded-lg border px-2 py-1.5 text-xs font-semibold", playbackSpeed === speed ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "text-slate-500")}>{speed}×</button>)}</div>
                      <p className="mt-3 text-center text-[11px] text-muted-foreground">{formatPointTime(playbackPoint?.recorded_at || null)}</p>
                    </>
                  ) : <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">No telemetry points were found in this time range.</p>}
                </div>
              ) : null}
            </div>
          )}
        </aside>

        <div role="separator" aria-orientation="vertical" onPointerDown={startPanelResize} className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-100 transition hover:bg-emerald-300 lg:block" />

        <main ref={mapShellRef} className="relative min-h-[580px] min-w-0 flex-1 overflow-hidden bg-slate-100 lg:h-[calc(100vh-8.7rem)]">
          {mode === "objects" ? <LiveFleetMap vehicles={vehicles} selectedVehicleId={selectedVehicleId} onVehicleSelect={(vehicleId) => { setSelectedVehicleId(vehicleId); setDetailsVisible(true) }} className="h-full min-h-[580px]" /> : <LivePlaybackMap playback={playback} currentIndex={playbackIndex} followCurrent={followCurrent} fitRequest={fitRequest} onPointSelect={(index) => { setPlaybackPlaying(false); setPlaybackIndex(index) }} className="h-full min-h-[580px]" />}

          <div className="absolute left-3 top-3 z-[650] flex flex-col gap-1.5 rounded-xl border bg-white/92 p-1.5 shadow-md backdrop-blur">
            {mode === "objects" ? <Button type="button" size="icon" variant="ghost" onClick={() => setSelectedVehicleId(null)} title="Fit loaded vehicles"><Crosshair /><span className="sr-only">Fit loaded vehicles</span></Button> : <Button type="button" size="icon" variant="ghost" onClick={() => setFitRequest((value) => value + 1)} title="Fit playback route"><Route /><span className="sr-only">Fit playback route</span></Button>}
            {mode === "playback" ? <Button type="button" size="icon" variant={followCurrent ? "secondary" : "ghost"} onClick={() => setFollowCurrent((current) => !current)} title="Follow playback vehicle"><Navigation /><span className="sr-only">Follow playback vehicle</span></Button> : null}
            <Button type="button" size="icon" variant="ghost" onClick={() => setDetailsVisible((current) => !current)} title="Toggle vehicle details"><Gauge /><span className="sr-only">Toggle vehicle details</span></Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => void toggleFullscreen()} title="Fullscreen map"><Maximize2 /><span className="sr-only">Fullscreen map</span></Button>
          </div>

          {detailsVisible && mode === "objects" && selectedVehicle ? (
            <LiveVehicleDetails
              key={selectedVehicle.id}
              vehicle={selectedVehicle}
              elapsedSeconds={liveDuration(selectedVehicle)}
              detail={selectedDetail}
              detailLoading={detailLoading}
              detailError={detailError}
            />
          ) : null}
          {detailsVisible && mode === "playback" && playback && playbackPoint ? <PlaybackDetails playback={playback} point={playbackPoint} currentIndex={playbackIndex} /> : null}
        </main>
      </div>
    </div>
  )
}
