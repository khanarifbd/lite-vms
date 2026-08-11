"use client"

import { RotateCcw, TimerReset } from "lucide-react"
import { createPortal } from "react-dom"
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"

import { LiveTrackingWorkspace } from "@/components/super-admin/live-tracking-workspace"
import type { NationalMonitoringDashboard } from "@/features/super-admin/monitoring"

const MINIMUM_REFRESH_SECONDS = 15
const MAXIMUM_REFRESH_SECONDS = 3600
const LIVE_MAP_PATH = "/super-admin/live-tracking-map"

function normalizeRefreshInterval(value: number) {
  if (!Number.isFinite(value)) return 30
  return Math.min(
    MAXIMUM_REFRESH_SECONDS,
    Math.max(MINIMUM_REFRESH_SECONDS, Math.floor(value)),
  )
}

export function LiveTrackingMapClient({
  initialData,
  systemRefreshIntervalSeconds,
}: {
  initialData: NationalMonitoringDashboard
  systemRefreshIntervalSeconds: number
}) {
  const systemInterval = useMemo(
    () => normalizeRefreshInterval(systemRefreshIntervalSeconds),
    [systemRefreshIntervalSeconds],
  )
  const [activeInterval, setActiveInterval] = useState(systemInterval)
  const [draftInterval, setDraftInterval] = useState(String(systemInterval))
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const [workspaceKey, setWorkspaceKey] = useState(0)

  const resetVisitState = useCallback(() => {
    setWorkspaceKey((current) => current + 1)
    setActiveInterval(systemInterval)
    setDraftInterval(String(systemInterval))
    setPortalHost(null)
  }, [systemInterval])

  useEffect(() => {
    setActiveInterval(systemInterval)
    setDraftInterval(String(systemInterval))
  }, [systemInterval])

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest<HTMLAnchorElement>("a[href]")
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (destination.pathname === LIVE_MAP_PATH) return

      resetVisitState()
    }

    function handleHistoryNavigation() {
      resetVisitState()
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) resetVisitState()
    }

    document.addEventListener("click", handleDocumentClick, true)
    window.addEventListener("popstate", handleHistoryNavigation)
    window.addEventListener("pageshow", handlePageShow)

    return () => {
      document.removeEventListener("click", handleDocumentClick, true)
      window.removeEventListener("popstate", handleHistoryNavigation)
      window.removeEventListener("pageshow", handlePageShow)
    }
  }, [resetVisitState])

  useEffect(() => {
    let host: HTMLSpanElement | null = null
    let observer: MutationObserver | null = null

    const attachControl = () => {
      const refreshButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === "Refresh",
      )
      const parent = refreshButton?.parentElement
      if (!refreshButton || !parent) return false

      const existing = parent.querySelector<HTMLElement>(
        "[data-live-map-local-refresh-control]",
      )
      if (existing) {
        setPortalHost(existing)
        return true
      }

      host = document.createElement("span")
      host.dataset.liveMapLocalRefreshControl = "true"
      host.className = "contents"
      parent.insertBefore(host, refreshButton)
      setPortalHost(host)
      return true
    }

    if (!attachControl()) {
      observer = new MutationObserver(() => {
        if (attachControl()) observer?.disconnect()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    return () => {
      observer?.disconnect()
      host?.remove()
    }
  }, [workspaceKey])

  const parsedDraft = Number(draftInterval)
  const draftIsValid =
    Number.isInteger(parsedDraft) &&
    parsedDraft >= MINIMUM_REFRESH_SECONDS &&
    parsedDraft <= MAXIMUM_REFRESH_SECONDS
  const hasTemporaryOverride = activeInterval !== systemInterval

  function applyTemporaryInterval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draftIsValid) return
    const nextInterval = normalizeRefreshInterval(parsedDraft)
    setActiveInterval(nextInterval)
    setDraftInterval(String(nextInterval))
  }

  function resetToSystemInterval() {
    setActiveInterval(systemInterval)
    setDraftInterval(String(systemInterval))
  }

  return (
    <>
      <LiveTrackingWorkspace
        key={workspaceKey}
        initialData={initialData}
        refreshIntervalSeconds={activeInterval}
      />

      {portalHost
        ? createPortal(
            <form
              onSubmit={applyTemporaryInterval}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 text-xs shadow-sm"
              title={`System default: ${systemInterval} seconds. This override lasts only until you leave or reload this page.`}
            >
              <TimerReset className="size-3.5 text-slate-500" />
              <span className="hidden text-slate-500 2xl:inline">This page</span>
              <input
                type="number"
                min={MINIMUM_REFRESH_SECONDS}
                max={MAXIMUM_REFRESH_SECONDS}
                step={1}
                value={draftInterval}
                onChange={(event) => setDraftInterval(event.target.value)}
                aria-label="Temporary live map refresh interval in seconds"
                className="h-6 w-14 rounded border border-slate-200 bg-slate-50 px-1.5 text-center font-mono font-semibold outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-200"
              />
              <span className="text-slate-500">s</span>
              <button
                type="submit"
                disabled={!draftIsValid}
                className="h-6 rounded bg-cyan-700 px-2 font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply
              </button>
              {hasTemporaryOverride ? (
                <button
                  type="button"
                  onClick={resetToSystemInterval}
                  className="flex size-6 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  title={`Reset to system default (${systemInterval} seconds)`}
                >
                  <RotateCcw className="size-3.5" />
                  <span className="sr-only">Reset to system default</span>
                </button>
              ) : null}
            </form>,
            portalHost,
          )
        : null}
    </>
  )
}
