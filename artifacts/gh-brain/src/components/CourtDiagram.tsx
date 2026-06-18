import { useEffect, useRef, useState } from "react";

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
  "route-architect-auditor":      `M ${CX} ${F.bottom} L ${F.right} ${F.bottom} L ${F.right} ${Y_MID}`,
  "route-auditor-orchestrator":   `M ${F.right} ${Y_MID} L ${F.right} ${F.top} L ${CX} ${F.top}`,
};

const GUIDE_ROUTE_IDS = [
  "route-user-orchestrator", "route-architect-builder",
  "route-orchestrator-moderator", "route-moderator-architect",
  "route-architect-auditor", "route-auditor-orchestrator",
  "route-courtroom-loop",
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
  litigantCount: number;
  running: boolean;
  complete?: boolean;
  confidence: number;
  creditsUsed: number;
  estimatedCredits: number;
}

export function CourtDiagram({
  activeRole,
  litigantCount,
  running,
  complete = false,
  confidence,
  creditsUsed,
  estimatedCredits,
}: CourtDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wakeRef = useRef<SVGPathElement>(null);
  const traceRef = useRef<SVGPathElement>(null);
  const coreRef = useRef<SVGPathElement>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(running);
  const posRef = useRef(0);

  const [activeSeatId, setActiveSeatId] = useState<string>("user");
  const [logicText, setLogicText] = useState("Idle.");
  const [flashedLitigants, setFlashedLitigants] = useState<Set<number>>(new Set());
  const litIndexRef = useRef(0);
  const prevRoleRef = useRef<string | null>(null);

  // Map activeRole → seat/litigant to highlight
  useEffect(() => {
    if (!activeRole) {
      if (complete) {
        setActiveSeatId("orchestrator");
        setLogicText("Session complete.");
      } else {
        setActiveSeatId("user");
        setLogicText(running ? "Reasoning…" : "Idle.");
      }
      return;
    }

    const prev = prevRoleRef.current;
    prevRoleRef.current = activeRole;

    if (activeRole === "Orchestrator") {
      setActiveSeatId("orchestrator");
      setLogicText("Orchestrator routing…");
    } else if (activeRole === "Moderator") {
      setActiveSeatId("moderator");
      setLogicText("Moderator framing deliberation…");
    } else if (activeRole === "Verdict") {
      setActiveSeatId("orchestrator");
      setLogicText("Orchestrator delivering verdict…");
    } else if (LITIGANT_ROLES.has(activeRole)) {
      // Advance litigant index only when the role changes
      if (prev !== activeRole || !LITIGANT_ROLES.has(prev || "")) {
        litIndexRef.current = (litIndexRef.current + 1) % Math.max(1, litigantCount);
      }
      const idx = litIndexRef.current;
      setActiveSeatId(`litigant-${idx}`);
      setLogicText(`${activeRole} deliberating (L${idx + 1})…`);
      // Flash node briefly
      setFlashedLitigants((prev) => new Set(prev).add(idx));
      setTimeout(() => {
        setFlashedLitigants((prev) => {
          const next = new Set(prev);
          next.delete(idx);
          return next;
        });
      }, 900);
    }
  }, [activeRole, running, complete, litigantCount]);

  // Courtroom loop meteor animation
  useEffect(() => {
    runningRef.current = running;
    if (!running) {
      cancelAnimationFrame(rafRef.current);
      if (wakeRef.current) wakeRef.current.setAttribute("d", "");
      if (traceRef.current) traceRef.current.setAttribute("d", "");
      if (coreRef.current) coreRef.current.setAttribute("d", "");
      return;
    }

    let last = performance.now();

    function frame(now: number) {
      if (!runningRef.current) return;
      const dt = now - last;
      last = now;

      const svg = svgRef.current;
      if (!svg) { rafRef.current = requestAnimationFrame(frame); return; }

      const loopPath = svg.getElementById("route-courtroom-loop") as SVGPathElement | null;
      if (!loopPath) { rafRef.current = requestAnimationFrame(frame); return; }

      const total = loopPath.getTotalLength();
      const seg = 90;
      posRef.current = (posRef.current + dt * 0.28) % total;

      const wakeD = pathSegmentDClosed(loopPath, posRef.current - seg * 0.7, seg * 0.7, 20);
      const traceD = pathSegmentDClosed(loopPath, posRef.current, seg, 14);

      if (wakeRef.current) {
        wakeRef.current.setAttribute("d", wakeD);
        wakeRef.current.style.opacity = "0.55";
      }
      if (traceRef.current) traceRef.current.setAttribute("d", traceD);
      if (coreRef.current) coreRef.current.setAttribute("d", traceD);

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [running]);

  // Reset state on new run
  useEffect(() => {
    if (running) {
      litIndexRef.current = 0;
      prevRoleRef.current = null;
      posRef.current = 0;
      setFlashedLitigants(new Set());
    }
  }, [running]);

  const litPts = courtroomPerimeterPoints(litigantCount);
  const creditPct = estimatedCredits > 0 ? Math.min(100, (creditsUsed / estimatedCredits) * 100) : 0;

  return (
    <div className="flex flex-col w-full select-none">
      {/* SVG Stage */}
      <div className="relative w-full overflow-hidden rounded-xl border border-[#1d331d]"
        style={{ background: "radial-gradient(circle at top, #102010, #071007 56%, #020402)" }}>
        <svg
          ref={svgRef}
          viewBox="0 -20 1200 980"
          preserveAspectRatio="xMidYMin meet"
          style={{ width: "100%", display: "block", maxHeight: "70vw" }}
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="outerRailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#d7ff77" stopOpacity=".92" />
              <stop offset="40%"  stopColor="#00c853" stopOpacity=".88" />
              <stop offset="100%" stopColor="#7ab87a" stopOpacity=".78" />
            </linearGradient>
            <linearGradient id="innerRailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#00c853" stopOpacity=".85" />
              <stop offset="100%" stopColor="#b6ff6a" stopOpacity=".70" />
            </linearGradient>
            <linearGradient id="meteorTailGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#00c853" stopOpacity=".02" />
              <stop offset="38%"  stopColor="#00f06a" stopOpacity=".24" />
              <stop offset="70%"  stopColor="#d7ff77" stopOpacity=".72" />
              <stop offset="92%"  stopColor="#ffffff" stopOpacity="1"   />
              <stop offset="100%" stopColor="#ffffff" stopOpacity=".04" />
            </linearGradient>
            <linearGradient id="meteorCoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#d7ff77" stopOpacity=".08" />
              <stop offset="68%"  stopColor="#ffffff" stopOpacity=".88" />
              <stop offset="92%"  stopColor="#ffffff" stopOpacity="1"   />
              <stop offset="100%" stopColor="#d7ff77" stopOpacity=".22" />
            </linearGradient>
            <linearGradient id="wakeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#00c853" stopOpacity=".03" />
              <stop offset="45%"  stopColor="#00f06a" stopOpacity=".24" />
              <stop offset="82%"  stopColor="#d7ff77" stopOpacity=".42" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity=".05" />
            </linearGradient>
            <radialGradient id="nodePod" cx="35%" cy="28%" r="72%">
              <stop offset="0%"   stopColor="#315831" />
              <stop offset="45%"  stopColor="#102510" />
              <stop offset="100%" stopColor="#020602" />
            </radialGradient>
            <radialGradient id="nodePodActive" cx="35%" cy="28%" r="72%">
              <stop offset="0%"   stopColor="#d7ff77" />
              <stop offset="36%"  stopColor="#1f4d1f" />
              <stop offset="100%" stopColor="#061006" />
            </radialGradient>
            <radialGradient id="litPod" cx="35%" cy="28%" r="72%">
              <stop offset="0%"   stopColor="#214421" />
              <stop offset="55%"  stopColor="#0d220d" />
              <stop offset="100%" stopColor="#020602" />
            </radialGradient>
            <radialGradient id="litPodActive" cx="35%" cy="28%" r="72%">
              <stop offset="0%"   stopColor="#f4ffba" />
              <stop offset="42%"  stopColor="#2b572b" />
              <stop offset="100%" stopColor="#051105" />
            </radialGradient>
            {/* Filters */}
            <filter id="railDrop" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#000" floodOpacity=".8" />
            </filter>
            <filter id="railGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#00c853" floodOpacity=".65" />
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity=".6" />
            </filter>
            <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#00c853" floodOpacity=".55" />
            </filter>
            <filter id="routeHaze" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00c853" floodOpacity=".22" />
            </filter>
            <filter id="wakeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="9"  floodColor="#00c853" floodOpacity=".58" />
              <feDropShadow dx="0" dy="0" stdDeviation="18" floodColor="#d7ff77" floodOpacity=".18" />
            </filter>
            <filter id="meteorGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="7"  floodColor="#d7ff77" floodOpacity=".95" />
              <feDropShadow dx="0" dy="0" stdDeviation="15" floodColor="#00c853" floodOpacity=".55" />
            </filter>
            <filter id="meteorCoreGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ffffff" floodOpacity=".95" />
            </filter>
            <filter id="podShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#000" floodOpacity=".8" />
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00c853" floodOpacity=".35" />
            </filter>
            <filter id="podHot" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#d7ff77" floodOpacity=".9" />
              <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#000" floodOpacity=".8" />
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
            <path d={OUTER_FRAME} stroke="rgba(215,255,119,.48)" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".70" filter="url(#softGlow)" />
            <path d={INNER_FRAME} stroke="#030803" strokeWidth={22} fill="rgba(0,200,83,.035)" strokeLinecap="round" strokeLinejoin="round" filter="url(#softGlow)" />
            <path d={INNER_FRAME} stroke="url(#innerRailGrad)" strokeWidth={14} fill="rgba(0,200,83,.032)" strokeLinecap="round" strokeLinejoin="round" filter="url(#softGlow)" />
            <path d={INNER_FRAME} stroke="rgba(183,255,119,.42)" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".65" />
          </g>

          {/* Permanent bridge: Moderator ↔ Courtroom */}
          <g>
            <line x1={F.left + 52} y1={Y_MID} x2={C.left} y2={Y_MID} stroke="#010401" strokeWidth={24} strokeLinecap="round" />
            <line x1={F.left + 52} y1={Y_MID} x2={C.left} y2={Y_MID} stroke="#00c853" strokeWidth={16} strokeLinecap="round" />
            <line x1={F.left + 52} y1={Y_MID} x2={C.left} y2={Y_MID} stroke="#d7ff77" strokeWidth={5}  strokeLinecap="round" />
          </g>

          {/* Guide routes (dashed) */}
          <g>
            {GUIDE_ROUTE_IDS.map((id) => (
              <use key={id} href={`#${id}`}
                stroke="rgba(0,200,83,.16)" strokeWidth={5} fill="none"
                strokeDasharray="2 14" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#routeHaze)"
              />
            ))}
          </g>

          {/* Seat nodes */}
          <g>
            {(Object.entries(SEATS) as [string, typeof SEATS[keyof typeof SEATS]][]).map(([id, s]) => {
              const isActive = activeSeatId === id;
              return (
                <g key={id}>
                  <circle
                    id={`seat-${id}`}
                    cx={s.x} cy={s.y} r={s.r}
                    fill={isActive ? "url(#nodePodActive)" : "url(#nodePod)"}
                    stroke={isActive ? "#d7ff77" : "rgba(137,255,160,.9)"}
                    strokeWidth={isActive ? 4 : 4}
                    filter={isActive ? "url(#podHot)" : "url(#podShadow)"}
                    style={{ transition: "filter 0.2s" }}
                  />
                  <SeatIcon id={id} x={s.x} y={s.y} />
                  <text x={s.x} y={s.y + 14} textAnchor="middle" fill="white" fontSize={12} fontWeight={800}
                    style={{ pointerEvents: "none", textShadow: "0 0 7px rgba(255,255,255,.45)" }}>
                    {s.short}
                  </text>
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
              const labels = ["L1","L2","L3","L4","L5","L6","L7","L8"];
              return (
                <g key={i}>
                  <circle
                    id={`seat-litigant-${i}`}
                    cx={pt.x} cy={pt.y} r={30}
                    fill={hot ? "url(#litPodActive)" : "url(#litPod)"}
                    stroke={hot ? "#d7ff77" : "rgba(122,184,122,.95)"}
                    strokeWidth={hot ? 4 : 3}
                    filter={hot ? "url(#podHot)" : "url(#podShadow)"}
                    style={{ transition: "filter 0.15s" }}
                  />
                  <text x={pt.x} y={pt.y - 3} textAnchor="middle" fill="white" fontSize={13} fontWeight={800}
                    style={{ pointerEvents: "none" }}>
                    AI
                  </text>
                  <text x={pt.x} y={pt.y + 13} textAnchor="middle" fill="#7ab87a" fontSize={9}
                    style={{ pointerEvents: "none" }}>
                    {labels[i] ?? `L${i+1}`}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Court controls (+/−) in center */}
          <g>
            <circle cx={CX - 58} cy={Y_MID} r={48} fill="rgba(0,200,83,.08)" stroke="#00c853" strokeWidth={6} />
            <line x1={CX - 80} y1={Y_MID} x2={CX - 36} y2={Y_MID} stroke="#ffffff" strokeWidth={8} strokeLinecap="round" />
            <line x1={CX - 58} y1={Y_MID - 22} x2={CX - 58} y2={Y_MID + 22} stroke="#ffffff" strokeWidth={8} strokeLinecap="round" />
            <circle cx={CX + 58} cy={Y_MID} r={48} fill="rgba(0,200,83,.08)" stroke="#00c853" strokeWidth={6} />
            <line x1={CX + 36} y1={Y_MID} x2={CX + 80} y2={Y_MID} stroke="#ffffff" strokeWidth={8} strokeLinecap="round" />
          </g>

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
        <div className="mx-2 mb-2 px-3 py-2 rounded-lg border border-[#1d331d] text-xs"
          style={{ background: "linear-gradient(160deg,rgba(14,26,14,.92),rgba(7,16,7,.92))" }}>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#00c853] mb-0.5">Logic Location</div>
          <div className="text-[#eef7ee]">{logicText}</div>
        </div>
      </div>

      {/* Meters */}
      <div className="mt-2 px-1 space-y-1.5">
        <div>
          <div className="flex justify-between text-[10px] mb-0.5">
            <span style={{ color: "#7ab87a" }}>Confidence</span>
            <span style={{ color: "#b6ff6a", fontWeight: 800 }}>{confidence}%</span>
          </div>
          <div style={{ height: 8, background: "#222", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${confidence}%`, height: "100%", background: "#b6ff6a", transition: "width .4s" }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] mb-0.5">
            <span style={{ color: "#7ab87a" }}>Credits Used</span>
            <span style={{ color: "#eef7ee", fontWeight: 800 }}>{creditsUsed}{estimatedCredits > 0 ? ` / ~${estimatedCredits}` : ""}</span>
          </div>
          <div style={{ height: 8, background: "#222", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${creditPct}%`, height: "100%", background: "#00c853", transition: "width .4s" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
