import { useEffect, useRef, useState } from "react";
import { getSeatAIShortName, type GradeMap, type SeatMapConfig } from "@/data/seatTypes";

// ── Geometry (mirrors V29 constants exactly) ─────────────────────────────────
const F = { left: 140, top: 220, right: 1060, bottom: 720, rx: 34 };
const C = { left: 250, top: 320, right: 720, bottom: 610, rx: 24 };
const Y_MID = 465;
const CX = 600;

const SEATS = {
  user:         { x: CX,      y: 95,       r: 52, short: "User"  },
  orchestrator: { x: CX,      y: F.top,    r: 52, short: "Orch"  },
  moderator:    { x: F.left,  y: Y_MID,    r: 52, short: "Mod"   },
  auditor:      { x: F.right, y: Y_MID,    r: 52, short: "Aud"   },
  architect:    { x: CX,      y: F.bottom, r: 52, short: "Arch"  },
  builder:      { x: CX,      y: 845,      r: 52, short: "Build" },
} as const;

const LITIGANT_ROLES = new Set([
  "Advocate", "Devil's Advocate", "Skeptic", "Empiricist",
  "Questioner", "Defender", "Synthesizer", "Logician",
  "Analyst", "Contrarian", "Realist", "Futurist", "Critic",
  "Balanced Reviewer", "Standards Expert",
]);

function courtroomPerimeterPoints(count: number) {
  const w = C.right - C.left;
  const h = C.bottom - C.top;
  const per = 2 * (w + h);
  const step = per / count;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    let d = i * step, x: number, y: number;
    if (d < h)          { x = C.left;             y = C.top + d;           }
    else if (d < h + w) { x = C.left + (d - h);   y = C.bottom;            }
    else if (d < 2*h+w) { x = C.right;             y = C.bottom - (d-h-w); }
    else                { x = C.right - (d-2*h-w); y = C.top;              }
    pts.push({ x, y });
  }
  return pts;
}

function roundedRect(l: number, t: number, r: number, b: number, rx: number) {
  return `M ${l+rx} ${t} L ${r-rx} ${t} Q ${r} ${t} ${r} ${t+rx} L ${r} ${b-rx} Q ${r} ${b} ${r-rx} ${b} L ${l+rx} ${b} Q ${l} ${b} ${l} ${b-rx} L ${l} ${t+rx} Q ${l} ${t} ${l+rx} ${t}`;
}

const OUTER_FRAME = roundedRect(F.left, F.top, F.right, F.bottom, F.rx);
const INNER_FRAME = roundedRect(C.left, C.top, C.right, C.bottom, C.rx);
const COURTROOM_LOOP = `M ${C.left} ${Y_MID} L ${C.left} ${C.bottom-C.rx} Q ${C.left} ${C.bottom} ${C.left+C.rx} ${C.bottom} L ${C.right-C.rx} ${C.bottom} Q ${C.right} ${C.bottom} ${C.right} ${C.bottom-C.rx} L ${C.right} ${C.top+C.rx} Q ${C.right} ${C.top} ${C.right-C.rx} ${C.top} L ${C.left+C.rx} ${C.top} Q ${C.left} ${C.top} ${C.left} ${C.top+C.rx} L ${C.left} ${Y_MID}`;

const ROUTE_PATHS: Record<string, string> = {
  "route-user-orchestrator":      `M ${CX} 95 L ${CX} ${F.top}`,
  "route-orchestrator-moderator": `M ${CX} ${F.top} L ${F.left} ${F.top} L ${F.left} ${Y_MID}`,
  "route-moderator-courtroom":    `M ${F.left+52} ${Y_MID} L ${C.left} ${Y_MID}`,
  "route-courtroom-loop":         COURTROOM_LOOP,
  "route-courtroom-moderator":    `M ${C.left} ${Y_MID} L ${F.left+52} ${Y_MID}`,
  "route-moderator-orchestrator": `M ${F.left} ${Y_MID} L ${F.left} ${F.top} L ${CX} ${F.top}`,
  "route-orchestrator-user":      `M ${CX} ${F.top} L ${CX} 95`,
  "route-moderator-architect":    `M ${F.left} ${Y_MID} L ${F.left} ${F.bottom} L ${CX} ${F.bottom}`,
  "route-architect-builder":      `M ${CX} ${F.bottom} L ${CX} 845`,
  "route-builder-architect":      `M ${CX} 845 L ${CX} ${F.bottom}`,
  "route-builder-auditor":        `M ${CX} 845 L ${CX} ${F.bottom} L ${F.right} ${F.bottom} L ${F.right} ${Y_MID}`,
  "route-auditor-builder":        `M ${F.right} ${Y_MID} L ${F.right} ${F.bottom} L ${CX} ${F.bottom} L ${CX} 845`,
  "route-architect-auditor":      `M ${CX} ${F.bottom} L ${F.right} ${F.bottom} L ${F.right} ${Y_MID}`,
  "route-auditor-orchestrator":   `M ${F.right} ${Y_MID} L ${F.right} ${F.top} L ${CX} ${F.top}`,
};

const GUIDE_ROUTE_IDS = [
  "route-user-orchestrator", "route-architect-builder",
  "route-orchestrator-moderator", "route-moderator-architect",
  "route-builder-auditor", "route-auditor-builder",
  "route-architect-auditor", "route-auditor-orchestrator",
  "route-courtroom-loop",
  "route-courtroom-moderator", "route-moderator-orchestrator", "route-orchestrator-user",
];

// ── Path segment utilities (ported from V29) ──────────────────────────────────
function pathSegmentDClosed(path: SVGPathElement, start: number, len: number, samples = 14): string {
  const total = path.getTotalLength();
  const s = ((start % total) + total) % total;
  const e = s + len;
  function build(a: number, b: number, n: number): string {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * (i / n));
      const p = path.getPointAtLength(t);
      d += (i === 0 ? "M" : " L") + p.x.toFixed(1) + " " + p.y.toFixed(1);
    }
    return d;
  }
  if (e <= total) return build(s, e, samples);
  return build(s, total, samples) + " " + build(0, e - total, samples);
}

function pathSegmentD(path: SVGPathElement, start: number, len: number, samples = 14): string {
  const total = path.getTotalLength();
  const s = Math.max(0, Math.min(start, total));
  const e = Math.max(0, Math.min(start + len, total));
  let d = "";
  for (let i = 0; i <= samples; i++) {
    const t = s + (e - s) * (i / samples);
    const p = path.getPointAtLength(t);
    d += (i === 0 ? "M" : " L") + p.x.toFixed(1) + " " + p.y.toFixed(1);
  }
  return d;
}

// ── Seat icons (SVG inline paths) ─────────────────────────────────────────────
function SeatIcon({ id, x, y }: { id: string; x: number; y: number }) {
  switch (id) {
    case "user":
      return (
        <g>
          <circle cx={x} cy={y - 18} r={10} fill="none" stroke="#fff" strokeWidth={2} />
          <path d={`M ${x-14} ${y+2} Q ${x} ${y-8} ${x+14} ${y+2}`} fill="none" stroke="#fff" strokeWidth={2} />
        </g>
      );
    case "orchestrator":
      return (
        <g>
          <circle cx={x} cy={y - 16} r={4} fill="#fff" />
          <line x1={x} y1={y - 12} x2={x} y2={y + 2} stroke="#fff" strokeWidth={2} />
          <line x1={x - 10} y1={y - 4} x2={x + 10} y2={y - 4} stroke="#fff" strokeWidth={2} />
        </g>
      );
    case "moderator":
      return (
        <g>
          <line x1={x} y1={y - 28} x2={x} y2={y - 8} stroke="#fff" strokeWidth={2} />
          <line x1={x - 12} y1={y - 22} x2={x + 12} y2={y - 22} stroke="#fff" strokeWidth={2} />
          <circle cx={x - 10} cy={y - 12} r={4} fill="none" stroke="#fff" strokeWidth={2} />
          <circle cx={x + 10} cy={y - 12} r={4} fill="none" stroke="#fff" strokeWidth={2} />
        </g>
      );
    case "auditor":
      return (
        <path d={`M ${x-10} ${y-16} L ${x-2} ${y-6} L ${x+12} ${y-24}`} fill="none" stroke="#fff" strokeWidth={3} />
      );
    case "architect":
      return (
        <g>
          <rect x={x - 12} y={y - 28} width={24} height={16} fill="none" stroke="#fff" strokeWidth={2} />
          <line x1={x - 8} y1={y - 24} x2={x + 8} y2={y - 16} stroke="#fff" strokeWidth={2} />
        </g>
      );
    case "builder":
      return (
        <g>
          <path d={`M ${x-10} ${y-24} L ${x} ${y-14} L ${x+10} ${y-24}`} fill="none" stroke="#fff" strokeWidth={2} />
          <line x1={x} y1={y - 14} x2={x} y2={y - 2} stroke="#fff" strokeWidth={3} />
        </g>
      );
    default:
      return null;
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface CourtDiagramProps {
  activeRole: string | null;
  /** Current attempt for Builder/Auditor — 1 = initial pass, 2+ = retry. */
  activeAttempt?: number;
  litigantCount: number;
  running: boolean;
  complete?: boolean;
  confidence: number;
  creditsUsed: number;
  estimatedCredits: number;
  conscience: boolean;
  seatMap?: SeatMapConfig;
  grades?: GradeMap;
  onSeatClick?: (seatId: string, litIndex?: number) => void;
  onAddLitigant?: () => void;
  onRemoveLitigant?: () => void;
  onToggleConscience?: () => void;
}

export function CourtDiagram({
  activeRole,
  activeAttempt = 1,
  litigantCount,
  running,
  complete = false,
  confidence,
  creditsUsed,
  estimatedCredits,
  conscience,
  seatMap,
  grades,
  onSeatClick,
  onAddLitigant,
  onRemoveLitigant,
  onToggleConscience,
}: CourtDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wakeRef = useRef<SVGPathElement>(null);
  const traceRef = useRef<SVGPathElement>(null);
  const coreRef = useRef<SVGPathElement>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(running);
  const completeRef = useRef(complete);
  const posRef = useRef(0);

  const [activeSeatId, setActiveSeatId] = useState<string>("user");
  const [logicText, setLogicText] = useState("Idle.");
  const [flashedLitigants, setFlashedLitigants] = useState<Set<number>>(new Set());
  const litIndexRef = useRef(0);
  const prevRoleRef = useRef<string | null>(null);
  const activeRouteRef = useRef("route-courtroom-loop");
  // Tracks whether we have passed through the courtroom — enables return-path routing
  const postCourtroomRef = useRef(false);

  function switchRoute(newRoute: string) {
    if (activeRouteRef.current !== newRoute) {
      activeRouteRef.current = newRoute;
      posRef.current = 0;
    }
  }

  // Map activeRole → seat + animation route (context-sensitive for return paths)
  useEffect(() => {
    if (!activeRole) {
      if (complete) {
        // Final leg: orchestrator → user
        switchRoute("route-orchestrator-user");
        setActiveSeatId("user");
        setLogicText("Verdict returned to user.");
      } else {
        setActiveSeatId("user");
        setLogicText(running ? "Reasoning…" : "Idle.");
      }
      return;
    }

    const prev = prevRoleRef.current;
    prevRoleRef.current = activeRole;

    if (activeRole === "Orchestrator") {
      if (postCourtroomRef.current) {
        // Return path: moderator → orchestrator
        switchRoute("route-moderator-orchestrator");
      } else {
        // Forward path: user → orchestrator
        switchRoute("route-user-orchestrator");
      }
      setActiveSeatId("orchestrator");
      setLogicText(postCourtroomRef.current ? "Orchestrator synthesising verdict…" : "Orchestrator routing…");
    } else if (activeRole === "Moderator") {
      if (postCourtroomRef.current) {
        // Return path: courtroom → moderator
        switchRoute("route-courtroom-moderator");
      } else {
        // Forward path: orchestrator → moderator
        switchRoute("route-orchestrator-moderator");
      }
      setActiveSeatId("moderator");
      setLogicText(postCourtroomRef.current ? "Moderator collecting deliberation…" : "Moderator framing deliberation…");
    } else if (activeRole === "Verdict") {
      // Explicit verdict role — always return path
      switchRoute("route-moderator-orchestrator");
      setActiveSeatId("orchestrator");
      setLogicText("Orchestrator delivering verdict…");
    } else if (activeRole === "Architect") {
      switchRoute("route-moderator-architect");
      setActiveSeatId("architect");
      setLogicText("Architect planning the build…");
    } else if (activeRole === "Builder") {
      // Retry pass: meteor travels back from Auditor → Builder
      switchRoute(activeAttempt > 1 ? "route-auditor-builder" : "route-architect-builder");
      setActiveSeatId("builder");
      setLogicText(activeAttempt > 1 ? `Builder revising (pass ${activeAttempt})…` : "Builder executing…");
    } else if (activeRole === "Auditor") {
      // Always comes from Builder — initial review or re-review
      switchRoute("route-builder-auditor");
      setActiveSeatId("auditor");
      setLogicText(activeAttempt > 1 ? `Auditor re-reviewing (pass ${activeAttempt})…` : "Auditor quality-checking output…");
    } else if (LITIGANT_ROLES.has(activeRole)) {
      // First litigant marks entry into courtroom — enable return-path routing from here on
      postCourtroomRef.current = true;
      switchRoute("route-courtroom-loop");
      if (prev !== activeRole || !LITIGANT_ROLES.has(prev || "")) {
        litIndexRef.current = (litIndexRef.current + 1) % Math.max(1, litigantCount);
      }
      const idx = litIndexRef.current;
      setActiveSeatId(`litigant-${idx}`);
      setLogicText(`${activeRole} deliberating (L${idx + 1})…`);
      setFlashedLitigants((prev) => new Set(prev).add(idx));
      setTimeout(() => {
        setFlashedLitigants((prev) => {
          const next = new Set(prev);
          next.delete(idx);
          return next;
        });
      }, 900);
    }
  }, [activeRole, activeAttempt, running, complete, litigantCount]);

  // Meteor animation — one direction only, always forward.
  // Runs during `running` AND during `complete` (final return-to-user leg).
  useEffect(() => {
    runningRef.current = running;
    completeRef.current = complete;

    const active = running || complete;

    if (!active) {
      cancelAnimationFrame(rafRef.current);
      if (wakeRef.current) wakeRef.current.setAttribute("d", "");
      if (traceRef.current) traceRef.current.setAttribute("d", "");
      if (coreRef.current) coreRef.current.setAttribute("d", "");
      return;
    }

    let last = performance.now();

    function frame(now: number) {
      const stillActive = runningRef.current || completeRef.current;
      if (!stillActive) return;
      const dt = now - last;
      last = now;

      const svg = svgRef.current;
      if (!svg) { rafRef.current = requestAnimationFrame(frame); return; }

      const routeId = activeRouteRef.current;
      const isLoop = routeId === "route-courtroom-loop";
      const path = svg.getElementById(routeId) as SVGPathElement | null;
      if (!path) { rafRef.current = requestAnimationFrame(frame); return; }

      const total = path.getTotalLength();
      const seg = 90;

      let wakeD: string, traceD: string;

      if (isLoop) {
        // Courtroom loop: continuous forward rotation, never reverses
        posRef.current = (posRef.current + dt * 0.28) % total;
        wakeD  = pathSegmentDClosed(path, posRef.current - seg * 0.7, seg * 0.7, 20);
        traceD = pathSegmentDClosed(path, posRef.current, seg, 14);
      } else {
        // Linear route: advance forward, clamp at end — meteor arrives and glows at destination
        if (posRef.current < total) {
          posRef.current = Math.min(total, posRef.current + dt * 0.45);
        }
        const head = posRef.current;
        const wakeStart = Math.max(0, head - seg * 1.2);
        wakeD  = pathSegmentD(path, wakeStart, head - wakeStart, 20);
        traceD = pathSegmentD(path, Math.max(0, head - seg), Math.min(seg, head), 14);
      }

      if (wakeRef.current) {
        wakeRef.current.setAttribute("d", wakeD);
        wakeRef.current.style.opacity = "0.55";
      }
      if (traceRef.current) traceRef.current.setAttribute("d", traceD);
      if (coreRef.current)  coreRef.current.setAttribute("d", traceD);

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [running, complete]);

  // Reset state on new run
  useEffect(() => {
    if (running) {
      litIndexRef.current = 0;
      prevRoleRef.current = null;
      posRef.current = 0;
      postCourtroomRef.current = false;
      setFlashedLitigants(new Set());
    }
  }, [running]);

  const litPts = courtroomPerimeterPoints(litigantCount);
  const creditPct = estimatedCredits > 0 ? Math.min(100, (creditsUsed / estimatedCredits) * 100) : 0;

  const p = conscience ? {
    primary:    "#00c853", bright: "#d7ff77", bright2: "#b6ff6a", secondary: "#00f06a", muted: "#7ab87a",
    railFillA:  "rgba(0,200,83,.035)", railFillB: "rgba(0,200,83,.032)", railStroke: "rgba(183,255,119,.42)",
    railOuterA: "rgba(215,255,119,.48)", guideRoute: "rgba(0,200,83,.16)", ctrlFill: "rgba(0,200,83,.08)",
    bgRadial:   "radial-gradient(circle at top, #102010, #071007 56%, #020402)",
    logicBorder:"#1d331d", logicBgA: "rgba(14,26,14,.92)", logicBgB: "rgba(7,16,7,.92)",
    nodeStroke: "rgba(137,255,160,.9)", litStroke: "rgba(122,184,122,.95)",
    seatAi: "#7ab87a", grade: "#d7ff77", litL: "#7ab87a",
    pod0:"#315831", pod1:"#102510", pod2:"#020602",
    podA0:"#d7ff77", podA1:"#1f4d1f", podA2:"#061006",
    lit0:"#214421", lit1:"#0d220d", lit2:"#020602",
    litA0:"#f4ffba", litA1:"#2b572b", litA2:"#051105",
  } : {
    primary:    "#f59e0b", bright: "#fde68a", bright2: "#fbbf24", secondary: "#fbbf24", muted: "#b45309",
    railFillA:  "rgba(245,158,11,.035)", railFillB: "rgba(245,158,11,.032)", railStroke: "rgba(253,230,138,.42)",
    railOuterA: "rgba(251,191,36,.48)", guideRoute: "rgba(245,158,11,.16)", ctrlFill: "rgba(245,158,11,.08)",
    bgRadial:   "radial-gradient(circle at top, #1a1000, #0d0800 56%, #030100)",
    logicBorder:"#331a00", logicBgA: "rgba(26,14,0,.92)", logicBgB: "rgba(13,8,0,.92)",
    nodeStroke: "rgba(251,191,36,.9)", litStroke: "rgba(184,101,0,.95)",
    seatAi: "#b45309", grade: "#fde68a", litL: "#b45309",
    pod0:"#3d2a00", pod1:"#1a1000", pod2:"#030100",
    podA0:"#fde68a", podA1:"#3d2200", podA2:"#100800",
    lit0:"#2a1a00", lit1:"#120d00", lit2:"#030100",
    litA0:"#fff3c4", litA1:"#4a2e00", litA2:"#0d0600",
  };

  return (
    <div className="flex flex-col w-full select-none">
      {/* SVG Stage */}
      <div className="relative w-full overflow-hidden rounded-xl border border-[#1d331d]"
        style={{ background: p.bgRadial }}>
        {/* Conscience toggle — upper left */}
        <button
          onClick={onToggleConscience}
          title={conscience ? "Conscience ON — click to disable" : "Conscience OFF — click to enable"}
          className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all duration-300 cursor-pointer"
          style={{
            background: conscience ? "rgba(0,200,83,.12)" : "rgba(245,158,11,.12)",
            borderColor: conscience ? "rgba(0,200,83,.4)" : "rgba(245,158,11,.4)",
          }}
        >
          <span style={{ fontSize: 11, color: p.primary }}>⚡</span>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: p.primary }}>
            {conscience ? "Conscience" : "Conscience"}
          </span>
          <span style={{
            display: "inline-block", width: 24, height: 13, borderRadius: 7,
            background: conscience ? p.primary : "#333",
            position: "relative", transition: "background 0.3s",
          }}>
            <span style={{
              position: "absolute", top: 2, left: conscience ? 12 : 2, width: 9, height: 9,
              borderRadius: "50%", background: "#fff", transition: "left 0.3s",
            }} />
          </span>
        </button>
        <svg
          ref={svgRef}
          viewBox="0 -20 1200 980"
          preserveAspectRatio="xMidYMin meet"
          style={{ width: "100%", display: "block", maxHeight: "70vw" }}
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="outerRailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor={p.bright}    stopOpacity=".92" />
              <stop offset="40%"  stopColor={p.primary}   stopOpacity=".88" />
              <stop offset="100%" stopColor={p.muted}     stopOpacity=".78" />
            </linearGradient>
            <linearGradient id="innerRailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor={p.primary}   stopOpacity=".85" />
              <stop offset="100%" stopColor={p.bright2}   stopOpacity=".70" />
            </linearGradient>
            <linearGradient id="meteorTailGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={p.primary}   stopOpacity=".02" />
              <stop offset="38%"  stopColor={p.secondary} stopOpacity=".24" />
              <stop offset="70%"  stopColor={p.bright}    stopOpacity=".72" />
              <stop offset="92%"  stopColor="#ffffff"      stopOpacity="1"   />
              <stop offset="100%" stopColor="#ffffff"      stopOpacity=".04" />
            </linearGradient>
            <linearGradient id="meteorCoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={p.bright}    stopOpacity=".08" />
              <stop offset="68%"  stopColor="#ffffff"      stopOpacity=".88" />
              <stop offset="92%"  stopColor="#ffffff"      stopOpacity="1"   />
              <stop offset="100%" stopColor={p.bright}    stopOpacity=".22" />
            </linearGradient>
            <linearGradient id="wakeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={p.primary}   stopOpacity=".03" />
              <stop offset="45%"  stopColor={p.secondary} stopOpacity=".24" />
              <stop offset="82%"  stopColor={p.bright}    stopOpacity=".42" />
              <stop offset="100%" stopColor="#ffffff"      stopOpacity=".05" />
            </linearGradient>
            <radialGradient id="nodePod" cx="35%" cy="28%" r="72%">
              <stop offset="0%"   stopColor={p.pod0} />
              <stop offset="45%"  stopColor={p.pod1} />
              <stop offset="100%" stopColor={p.pod2} />
            </radialGradient>
            <radialGradient id="nodePodActive" cx="35%" cy="28%" r="72%">
              <stop offset="0%"   stopColor={p.podA0} />
              <stop offset="36%"  stopColor={p.podA1} />
              <stop offset="100%" stopColor={p.podA2} />
            </radialGradient>
            <radialGradient id="litPod" cx="35%" cy="28%" r="72%">
              <stop offset="0%"   stopColor={p.lit0} />
              <stop offset="55%"  stopColor={p.lit1} />
              <stop offset="100%" stopColor={p.lit2} />
            </radialGradient>
            <radialGradient id="litPodActive" cx="35%" cy="28%" r="72%">
              <stop offset="0%"   stopColor={p.litA0} />
              <stop offset="42%"  stopColor={p.litA1} />
              <stop offset="100%" stopColor={p.litA2} />
            </radialGradient>
            {/* Filters */}
            <filter id="railDrop" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#000" floodOpacity=".8" />
            </filter>
            <filter id="railGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={p.primary} floodOpacity=".65" />
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity=".6" />
            </filter>
            <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={p.primary} floodOpacity=".55" />
            </filter>
            <filter id="routeHaze" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={p.primary} floodOpacity=".22" />
            </filter>
            <filter id="wakeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="9"  floodColor={p.primary} floodOpacity=".58" />
              <feDropShadow dx="0" dy="0" stdDeviation="18" floodColor={p.bright}  floodOpacity=".18" />
            </filter>
            <filter id="meteorGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="7"  floodColor={p.bright}   floodOpacity=".95" />
              <feDropShadow dx="0" dy="0" stdDeviation="15" floodColor={p.primary}  floodOpacity=".55" />
            </filter>
            <filter id="meteorCoreGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ffffff" floodOpacity=".95" />
            </filter>
            <filter id="podShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#000"      floodOpacity=".8"  />
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={p.primary} floodOpacity=".35" />
            </filter>
            <filter id="podHot" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor={p.bright} floodOpacity=".9" />
              <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#000"     floodOpacity=".8" />
            </filter>
            {/* Route paths (for animation + guides) */}
            {Object.entries(ROUTE_PATHS).map(([id, d]) => (
              <path key={id} id={id} d={d} />
            ))}
          </defs>

          {/* Rail layer */}
          <g>
            <path d={OUTER_FRAME} stroke="#010401" strokeWidth={28} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".92" filter="url(#railDrop)" />
            <path d={OUTER_FRAME} stroke="url(#outerRailGrad)" strokeWidth={22} fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#railGlow)" />
            <path d={OUTER_FRAME} stroke="rgba(0,0,0,.72)" strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".82" />
            <path d={OUTER_FRAME} stroke={p.railOuterA} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".70" filter="url(#softGlow)" />
            <path d={INNER_FRAME} stroke="#030803" strokeWidth={22} fill={p.railFillA} strokeLinecap="round" strokeLinejoin="round" filter="url(#softGlow)" />
            <path d={INNER_FRAME} stroke="url(#innerRailGrad)" strokeWidth={14} fill={p.railFillB} strokeLinecap="round" strokeLinejoin="round" filter="url(#softGlow)" />
            <path d={INNER_FRAME} stroke={p.railStroke} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".65" />
          </g>

          {/* Permanent bridge: Moderator ↔ Courtroom */}
          <g>
            <line x1={F.left + 52} y1={Y_MID} x2={C.left} y2={Y_MID} stroke="#010401"   strokeWidth={24} strokeLinecap="round" />
            <line x1={F.left + 52} y1={Y_MID} x2={C.left} y2={Y_MID} stroke={p.primary} strokeWidth={16} strokeLinecap="round" />
            <line x1={F.left + 52} y1={Y_MID} x2={C.left} y2={Y_MID} stroke={p.bright}  strokeWidth={5}  strokeLinecap="round" />
          </g>

          {/* Guide routes (dashed) */}
          <g>
            {GUIDE_ROUTE_IDS.map((id) => (
              <use key={id} href={`#${id}`}
                stroke={p.guideRoute} strokeWidth={5} fill="none"
                strokeDasharray="2 14" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#routeHaze)"
              />
            ))}
          </g>

          {/* Seat nodes */}
          <g>
            {(Object.entries(SEATS) as [string, typeof SEATS[keyof typeof SEATS]][]).map(([id, s]) => {
              const isActive = activeSeatId === id;
              const isUser = id === "user";
              const seatKey = id as keyof Omit<typeof seatMap, "litigants">;
              const assignment = (!isUser && seatMap) ? (seatMap as any)[seatKey] : null;
              const aiShort = assignment ? getSeatAIShortName(assignment.provider) : null;
              const grade = (!isUser && grades) ? grades[id]?.grade : null;
              const isClickable = !isUser && !!onSeatClick;
              return (
                <g
                  key={id}
                  onClick={isClickable ? () => onSeatClick!(id) : undefined}
                  style={{ cursor: isClickable ? "pointer" : "default" }}
                >
                  <circle
                    id={`seat-${id}`}
                    cx={s.x} cy={s.y} r={s.r}
                    fill={isActive ? "url(#nodePodActive)" : "url(#nodePod)"}
                    stroke={isActive ? p.bright : p.nodeStroke}
                    strokeWidth={4}
                    filter={isActive ? "url(#podHot)" : "url(#podShadow)"}
                    style={{ transition: "filter 0.2s" }}
                  />
                  <SeatIcon id={id} x={s.x} y={s.y} />
                  <text x={s.x} y={s.y + 14} textAnchor="middle" fill="white" fontSize={12} fontWeight={800}
                    style={{ pointerEvents: "none", textShadow: "0 0 7px rgba(255,255,255,.45)" }}>
                    {s.short}
                  </text>
                  {aiShort && (
                    <text x={s.x} y={s.y + 28} textAnchor="middle" fill={p.seatAi} fontSize={9}
                      style={{ pointerEvents: "none" }}>
                      {aiShort}
                    </text>
                  )}
                  {grade && (
                    <text x={s.x} y={s.y + 40} textAnchor="middle" fill={p.grade} fontSize={9} fontWeight={800}
                      style={{ pointerEvents: "none" }}>
                      {grade}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Litigant nodes (dynamic, on courtroom perimeter) */}
          <g>
            {litPts.map((pt, i) => {
              const isActive = activeSeatId === `litigant-${i}`;
              const isFlashed = flashedLitigants.has(i);
              const hot = isActive || isFlashed;
              const litAssignment = seatMap?.litigants?.[i];
              const aiName = litAssignment ? getSeatAIShortName(litAssignment.provider) : "AI";
              return (
                <g
                  key={i}
                  onClick={onSeatClick ? () => onSeatClick("litigant", i) : undefined}
                  style={{ cursor: onSeatClick ? "pointer" : "default" }}
                >
                  <circle
                    id={`seat-litigant-${i}`}
                    cx={pt.x} cy={pt.y} r={30}
                    fill={hot ? "url(#litPodActive)" : "url(#litPod)"}
                    stroke={hot ? p.bright : p.litStroke}
                    strokeWidth={hot ? 4 : 3}
                    filter={hot ? "url(#podHot)" : "url(#podShadow)"}
                    style={{ transition: "filter 0.15s" }}
                  />
                  <text x={pt.x} y={pt.y - 3} textAnchor="middle" fill="white" fontSize={11} fontWeight={800}
                    style={{ pointerEvents: "none" }}>
                    {aiName}
                  </text>
                  <text x={pt.x} y={pt.y + 13} textAnchor="middle" fill={p.litL} fontSize={9}
                    style={{ pointerEvents: "none" }}>
                    L{i + 1}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Court controls (+/−) in center of inner courtroom box */}
          {(() => {
            const ICX = (C.left + C.right) / 2; // 485 — inner box horizontal center
            const SEP = 58;
            const addX = ICX - SEP;
            const remX = ICX + SEP;
            return (
              <g>
                <circle
                  cx={addX} cy={Y_MID} r={48}
                  fill={p.ctrlFill} stroke={p.primary} strokeWidth={6}
                  onClick={onAddLitigant}
                  style={{ cursor: onAddLitigant ? "pointer" : "default" }}
                />
                <line x1={addX - 22} y1={Y_MID} x2={addX + 22} y2={Y_MID} stroke="#ffffff" strokeWidth={8} strokeLinecap="round" style={{ pointerEvents: "none" }} />
                <line x1={addX} y1={Y_MID - 22} x2={addX} y2={Y_MID + 22} stroke="#ffffff" strokeWidth={8} strokeLinecap="round" style={{ pointerEvents: "none" }} />
                <circle
                  cx={remX} cy={Y_MID} r={48}
                  fill={p.ctrlFill} stroke={p.primary} strokeWidth={6}
                  onClick={onRemoveLitigant}
                  style={{ cursor: onRemoveLitigant ? "pointer" : "default" }}
                />
                <line x1={remX - 22} y1={Y_MID} x2={remX + 22} y2={Y_MID} stroke="#ffffff" strokeWidth={8} strokeLinecap="round" style={{ pointerEvents: "none" }} />
              </g>
            );
          })()}

          {/* Meteor animation paths */}
          <path ref={wakeRef} d=""
            fill="none" stroke="url(#wakeGrad)" strokeWidth={24}
            strokeLinecap="round" strokeLinejoin="round"
            filter="url(#wakeGlow)" style={{ opacity: 0, transition: "opacity .15s ease", pointerEvents: "none" }} />
          <path ref={traceRef} d=""
            fill="none" stroke="url(#meteorTailGrad)" strokeWidth={20}
            strokeLinecap="round" strokeLinejoin="round"
            filter="url(#meteorGlow)" style={{ opacity: .96, pointerEvents: "none" }} />
          <path ref={coreRef} d=""
            fill="none" stroke="url(#meteorCoreGrad)" strokeWidth={6}
            strokeLinecap="round" strokeLinejoin="round"
            filter="url(#meteorCoreGlow)" style={{ pointerEvents: "none" }} />
        </svg>

        {/* Logic panel */}
        <div className="mx-2 mb-2 px-3 py-2 rounded-lg border text-xs"
          style={{ borderColor: p.logicBorder, background: `linear-gradient(160deg,${p.logicBgA},${p.logicBgB})` }}>
          <div className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: p.primary }}>Logic Location</div>
          <div className="text-[#eef7ee]">{logicText}</div>
        </div>
      </div>

    </div>
  );
}
