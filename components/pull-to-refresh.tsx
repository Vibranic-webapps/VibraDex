"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * Pull-to-refresh for the page area. When Vibradex is open as a phone app there is no browser
 * refresh button, so dragging down at the top of the page does it here: the page follows the
 * finger, a row of little chips fills as you pull, and at the threshold it is full. Let go and
 * the chips pulse in a wave while the page refetches its data. The app itself is never reloaded.
 *
 * This renders the layout's ONE scroll area (<main>). Pages that load their own data call
 * `usePullRefresh(handler)`; pages rendered on the server need nothing: the default handler
 * re-runs them with `router.refresh()`.
 *
 * Touch only (desktop is untouched). The gesture starts only when the page is scrolled to the
 * very top, the finger moves mostly downward, and nothing modal is open. Put `data-no-pull` on
 * anything with its own touch dragging. The transform is applied only while pulling: a
 * permanent one would break position:fixed inside the page.
 */

// Words in one place.
const COPY = {
  pull: "Pull to refresh",
  release: "Release to refresh",
  refreshing: "Refreshing…",
  updated: "Up to date",
  failed: "Couldn't refresh",
}

// --- Feel (px / ms). Distances are the page's travel, not the finger's. -------------------
const SEGMENTS = 12
const RESISTANCE = 0.7 // the page moves 70% of the finger's distance until the threshold
const THRESHOLD = 64 // travel at which letting go refreshes
const OVERSHOOT_DAMPING = 0.3 // past the threshold it gets heavier
const MAX_TRAVEL = 96
const HOLD_TRAVEL = 56 // where the page rests while refreshing
const MIN_REFRESH_MS = 700 // a fast answer would flash by; show the wave at least this long
const DONE_HOLD_MS = 350 // the full row stays a moment so "done" registers
const START_SLOP = 8 // the finger must move this far before we decide pull vs scroll

type Phase = "idle" | "pulling" | "armed" | "refreshing" | "done" | "failed"
type RefreshHandler = () => Promise<unknown>

/** Page travel for a finger distance: linear, then heavier past the threshold, then capped. */
function travelFor(dy: number): number {
  const raw = dy * RESISTANCE
  if (raw <= THRESHOLD) return raw
  return Math.min(MAX_TRAVEL, THRESHOLD + (raw - THRESHOLD) * OVERSHOOT_DAMPING)
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// The layout owns the gesture; the current page hands it a refetch function.
type Register = (handler: RefreshHandler) => () => void
const RegisterContext = createContext<Register | null>(null)

/**
 * A page registers what pulling should refetch. Resolve = "up to date", reject (throw) =
 * "couldn't refresh". Only refetch data: never reload or reset the page.
 */
export function usePullRefresh(handler: RefreshHandler) {
  const register = useContext(RegisterContext)
  useEffect(() => register?.(handler), [register, handler])
}

export function PullToRefresh({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter()
  const rootRef = useRef<HTMLElement | null>(null)
  const handlerSlot = useRef<RefreshHandler | null>(null)
  const register = useCallback<Register>((handler) => {
    handlerSlot.current = handler
    return () => {
      if (handlerSlot.current === handler) handlerSlot.current = null
    }
  }, [])
  const [phase, setPhase] = useState<Phase>("idle")
  const [travel, setTravel] = useState(0)
  const [dragging, setDragging] = useState(false)

  // The listeners are attached once; they read the latest values through refs.
  const phaseRef = useRef<Phase>("idle")
  const routerRef = useRef(router)
  useEffect(() => {
    routerRef.current = router
  }, [router])

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let tracking = false
    let pulling = false
    let alive = true

    /** True when the touch began inside something that scrolls on its own and isn't at its top. */
    const insideScrolledContainer = (target: EventTarget | null): boolean => {
      let node = target instanceof Element ? target : null
      while (node && node !== el) {
        if (node.scrollTop > 0 && node.scrollHeight > node.clientHeight) {
          const overflowY = getComputedStyle(node).overflowY
          if (overflowY === "auto" || overflowY === "scroll") return true
        }
        node = node.parentElement
      }
      return false
    }

    const onTouchStart = (e: TouchEvent) => {
      tracking = false
      pulling = false
      if (phaseRef.current !== "idle" || e.touches.length !== 1) return
      if (el.scrollTop > 0 || insideScrolledContainer(e.target)) return
      // Things with their own touch dragging keep the gesture.
      if ((e.target as Element | null)?.closest?.("[data-no-pull]")) return
      // A dialog, sheet or the search palette is open: its own gestures win.
      if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      tracking = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return
      const t = e.touches[0]
      const dy = t.clientY - startY
      const dx = t.clientX - startX

      if (!pulling) {
        // Not decided yet: upward or sideways means a normal scroll or a horizontal swipe.
        if (dy < -START_SLOP || Math.abs(dx) > START_SLOP) {
          tracking = false
          return
        }
        if (dy < START_SLOP || el.scrollTop > 0) return
        pulling = true
        setDragging(true)
      }

      // Take over from the browser's own overscroll.
      if (e.cancelable) e.preventDefault()
      const next = travelFor(Math.max(0, dy - START_SLOP))
      setTravel(next)
      setPhaseBoth(next >= THRESHOLD ? "armed" : "pulling")
    }

    const onTouchEnd = async () => {
      const wasPulling = pulling
      tracking = false
      pulling = false
      if (!wasPulling) return
      setDragging(false)

      if (phaseRef.current !== "armed") {
        setPhaseBoth("idle")
        setTravel(0)
        return
      }

      setPhaseBoth("refreshing")
      setTravel(HOLD_TRAVEL)
      let ok = true
      try {
        // A page that fetches its own data hands us a function; server pages just re-run.
        const run: RefreshHandler = handlerSlot.current ?? (async () => routerRef.current.refresh())
        await Promise.all([run(), wait(MIN_REFRESH_MS)])
      } catch {
        ok = false
      }
      if (!alive) return
      setPhaseBoth(ok ? "done" : "failed")
      await wait(ok ? DONE_HOLD_MS : DONE_HOLD_MS * 2)
      if (!alive) return
      setPhaseBoth("idle")
      setTravel(0)
    }

    const onTouchCancel = () => {
      if (phaseRef.current === "pulling" || phaseRef.current === "armed") {
        setPhaseBoth("idle")
        setTravel(0)
      }
      setDragging(false)
      tracking = false
      pulling = false
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    // Not passive: we must be able to cancel the browser's own overscroll while pulling.
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", onTouchEnd, { passive: true })
    el.addEventListener("touchcancel", onTouchCancel, { passive: true })
    return () => {
      alive = false
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchCancel)
    }
  }, [setPhaseBoth])

  const filled =
    phase === "refreshing" || phase === "armed" || phase === "done"
      ? SEGMENTS
      : Math.round(Math.min(1, travel / THRESHOLD) * SEGMENTS)

  const caption =
    phase === "armed" ? COPY.release
    : phase === "refreshing" ? COPY.refreshing
    : phase === "done" ? COPY.updated
    : phase === "failed" ? COPY.failed
    : COPY.pull

  // What a screen reader hears. Pulling and armed are visual only.
  const announcement = phase === "refreshing" || phase === "done" || phase === "failed" ? caption : ""
  const emphasised = phase === "armed" || phase === "refreshing"

  return (
    <RegisterContext.Provider value={register}>
      <main ref={rootRef} className={cn("relative", className)}>
        {/* The room the page leaves behind as it moves down. Above the page, never takes touches. */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-10 overflow-hidden",
            !dragging && "transition-[height] duration-200 ease-out",
          )}
          style={{ height: travel }}
        >
          {/* Anchored to the bottom of the gap, chips lowest: they are the first thing the pull
              uncovers (the caption is secondary and arrives with the rest of the room). */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-2">
            <span
              className={cn(
                "text-xs font-medium tracking-wider whitespace-nowrap uppercase",
                emphasised ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {caption}
            </span>
            <div className={cn("flex w-full max-w-60 gap-1 px-4", phase === "refreshing" && "ptr-sweep")}>
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "ptr-seg block h-3 min-w-0 flex-1 rounded-sm border",
                    i < filled ? "border-primary bg-primary" : "border-border bg-muted",
                  )}
                  style={{ "--i": i + 1 } as React.CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div
          className={cn(!dragging && "transition-transform duration-200 ease-out")}
          style={travel > 0 ? { transform: `translateY(${travel}px)` } : undefined}
        >
          {children}
        </div>
      </main>
    </RegisterContext.Provider>
  )
}
