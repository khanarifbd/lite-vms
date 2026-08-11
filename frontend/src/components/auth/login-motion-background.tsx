"use client"

import { CarFront, MapPin, RadioTower } from "lucide-react"

const vehicles = [
  { lane: "18%", duration: "18s", delay: "-2s", reverse: false, opacity: 0.9 },
  { lane: "36%", duration: "24s", delay: "-11s", reverse: true, opacity: 0.65 },
  { lane: "63%", duration: "21s", delay: "-7s", reverse: false, opacity: 0.75 },
  { lane: "81%", duration: "28s", delay: "-17s", reverse: true, opacity: 0.5 },
]

const signalPoints = [
  { left: "14%", top: "28%", delay: "-1s" },
  { left: "34%", top: "72%", delay: "-3.5s" },
  { left: "63%", top: "21%", delay: "-2.2s" },
  { left: "78%", top: "58%", delay: "-4.8s" },
  { left: "52%", top: "46%", delay: "-6s" },
]

export function LoginMotionBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="login-motion-grid absolute inset-0 opacity-35" />
      <div className="login-motion-glow absolute -left-24 top-[38%] size-80 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="login-motion-glow login-motion-glow-delayed absolute -right-20 top-[8%] size-72 rounded-full bg-emerald-300/10 blur-3xl" />

      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full opacity-45"
      >
        <path
          d="M-120 210 C 130 110, 290 340, 520 250 S 860 80, 1120 210"
          fill="none"
          stroke="rgba(167,243,208,.18)"
          strokeWidth="2"
          strokeDasharray="8 14"
        />
        <path
          d="M-100 470 C 180 610, 350 350, 590 500 S 890 680, 1110 500"
          fill="none"
          stroke="rgba(103,232,249,.16)"
          strokeWidth="2"
          strokeDasharray="10 16"
        />
        <path
          d="M-110 790 C 110 690, 350 900, 570 760 S 880 630, 1110 780"
          fill="none"
          stroke="rgba(167,243,208,.14)"
          strokeWidth="2"
          strokeDasharray="7 15"
        />
        <path
          d="M80 -80 C 220 210, 90 420, 310 610 S 570 840, 490 1080"
          fill="none"
          stroke="rgba(255,255,255,.07)"
          strokeWidth="1.5"
        />
        <path
          d="M760 -80 C 610 190, 870 430, 690 650 S 550 870, 720 1080"
          fill="none"
          stroke="rgba(255,255,255,.06)"
          strokeWidth="1.5"
        />
      </svg>

      <div className="login-motion-scan absolute inset-y-0 w-40 bg-gradient-to-r from-transparent via-cyan-200/8 to-transparent blur-xl" />

      {vehicles.map((vehicle, index) => (
        <div
          key={`${vehicle.lane}-${index}`}
          className={`login-motion-vehicle absolute left-0 flex items-center gap-2 ${vehicle.reverse ? "login-motion-vehicle-reverse" : ""}`}
          style={{
            top: vehicle.lane,
            animationDuration: vehicle.duration,
            animationDelay: vehicle.delay,
            opacity: vehicle.opacity,
          }}
        >
          <span className="relative flex size-7 items-center justify-center rounded-lg border border-emerald-100/20 bg-emerald-300/10 text-emerald-100 shadow-[0_0_20px_rgba(52,211,153,.18)] backdrop-blur-sm">
            <CarFront className="size-3.5" />
            <span className="absolute -right-1 -top-1 size-2 rounded-full border border-emerald-950 bg-lime-300 shadow-[0_0_9px_rgba(190,242,100,.9)]" />
          </span>
          <span className="h-px w-16 bg-gradient-to-r from-emerald-200/55 to-transparent" />
        </div>
      ))}

      {signalPoints.map((point, index) => (
        <div
          key={`${point.left}-${point.top}`}
          className="login-motion-signal absolute"
          style={{ left: point.left, top: point.top, animationDelay: point.delay }}
        >
          <span className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/15" />
          <span className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/25" />
          <span className="relative flex size-6 items-center justify-center rounded-full border border-white/15 bg-emerald-900/65 text-emerald-100 backdrop-blur-sm">
            {index % 2 === 0 ? <RadioTower className="size-3" /> : <MapPin className="size-3" />}
          </span>
        </div>
      ))}

      <div className="absolute bottom-8 right-8 hidden items-center gap-2 rounded-full border border-white/10 bg-emerald-950/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-emerald-100/55 backdrop-blur-sm xl:flex">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-50" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-300" />
        </span>
        National network active
      </div>

      <style jsx>{`
        .login-motion-grid {
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
          background-size: 54px 54px;
          mask-image: linear-gradient(to bottom, transparent, black 14%, black 86%, transparent);
        }

        .login-motion-vehicle {
          animation-name: login-vehicle-cross;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
        }

        .login-motion-vehicle-reverse {
          animation-name: login-vehicle-cross-reverse;
        }

        .login-motion-signal {
          animation: login-signal-pulse 5.5s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .login-motion-scan {
          animation: login-network-scan 12s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .login-motion-glow {
          animation: login-glow-drift 14s ease-in-out infinite alternate;
        }

        .login-motion-glow-delayed {
          animation-delay: -7s;
        }

        @keyframes login-vehicle-cross {
          0% { transform: translate3d(-150px, 0, 0); }
          100% { transform: translate3d(calc(100vw + 180px), 0, 0); }
        }

        @keyframes login-vehicle-cross-reverse {
          0% { transform: translate3d(calc(100vw + 180px), 0, 0) scaleX(-1); }
          100% { transform: translate3d(-150px, 0, 0) scaleX(-1); }
        }

        @keyframes login-signal-pulse {
          0%, 100% { transform: scale(.92); opacity: .38; }
          50% { transform: scale(1.12); opacity: .82; }
        }

        @keyframes login-network-scan {
          0%, 15% { transform: translateX(-220px); opacity: 0; }
          35%, 70% { opacity: .8; }
          100% { transform: translateX(calc(100vw + 220px)); opacity: 0; }
        }

        @keyframes login-glow-drift {
          from { transform: translate3d(-20px, -10px, 0) scale(.92); opacity: .55; }
          to { transform: translate3d(35px, 28px, 0) scale(1.12); opacity: .9; }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-motion-vehicle,
          .login-motion-signal,
          .login-motion-scan,
          .login-motion-glow {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
