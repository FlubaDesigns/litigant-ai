/**
 * LandingDemoPlayer — a pre-scripted animated replay of the real Session UI.
 * Zero API calls. Same styling as Session.tsx. Loops automatically.
 *
 * Phases:
 *   config   → shows the mission briefing / question input (idle state)
 *   starting → "▶ Run Trial" button animates clicked, spinner appears
 *   running  → each AI turn types in one by one, confidence bar fills
 *   complete → verdict tab revealed, CTA shown
 *   (loops back to config after 5s pause)
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

// ── Pre-scripted session content ──────────────────────────────────────────────

const DEMO_QUESTION = "Is the Earth flat?";

const DEMO_CONFIG = [
  { label: "Court Mode",    value: "Adversarial" },
  { label: "Litigants",     value: "4 (+ / −)"  },
  { label: "Reasoning",     value: "Chain of Thought" },
  { label: "Confidence Target", value: "80%" },
];

interface Turn {
  role: string;
  model: string;
  color: string;
  text: string;
  confidenceAfter: number;
}

const TURNS: Turn[] = [
  {
    role: "Advocate",
    model: "GPT-4o",
    color: "#4fc3f7",
    confidenceAfter: 28,
    text: `I'll steelman every possible argument. Ancient civilisations universally described a flat Earth — a reasonable inference from lived experience. Some claim GPS paths and flight routes are "corrected" for curvature. These intuitions feel compelling.\n\nHowever, I must be honest: every one of these arguments disintegrates under direct observational testing. I cannot in good conscience sustain the position.`,
  },
  {
    role: "Skeptic",
    model: "Claude 3.5",
    color: "#ef9a9a",
    confidenceAfter: 63,
    text: `Every flat-Earth claim fails basic empirical scrutiny — ships disappear hull-first over the horizon, star constellations shift with latitude, lunar eclipses cast circular shadows regardless of angle, time zones exist, circumnavigation is routine, and orbital mechanics require a spheroid.\n\nThe Earth is an oblate spheroid. This is not contested science. Confidence in the contrary position: 0.0%.`,
  },
  {
    role: "Devil's Advocate",
    model: "Gemini 1.5 Pro",
    color: "#fff176",
    confidenceAfter: 81,
    text: `For completeness: flat-Earth cosmology dominated recorded history for millennia. The psychological appeal of a bounded, knowable world is real and worth understanding. Modern flat-Earth communities signal a genuine crisis of institutional trust — that sociological fact deserves serious analysis.\n\nNone of this changes the underlying physics. The Earth is round. I'm simply noting that dismissing the belief without understanding its roots misses something important.`,
  },
  {
    role: "Analyst",
    model: "Grok 3",
    color: "#a5d6a7",
    confidenceAfter: 97,
    text: `The empirical record is unambiguous. We have direct photographic evidence from orbit, laser-ranging experiments, independent satellite networks operated by competing nations with adversarial interests, and a century of aviation physics — none of which are mutually compatible with a flat surface.\n\nCross-referencing all litigant arguments: zero credible scientific framework supports flat-Earth models. The Advocate's concession is telling.`,
  },
];

const VERDICT = `After adversarial cross-examination across four independent AI litigants with distinct reasoning architectures, the court finds unanimously:

The Earth is an oblate spheroid — slightly flattened at the poles, bulging at the equator. This is established to a certainty that no credible evidence contests.

VERDICT: The claim "The Earth is flat" is definitively and empirically FALSE.`;

const DEBATE_NOTES = `Round 1 — Advocate conceded under self-examination.
Round 2 — Skeptic provided categorical empirical rebuttal.
Round 3 — Devil's Advocate raised sociological context; did not contest physics.
Round 4 — Analyst cross-referenced all positions; confirmed unanimity.

Court consensus reached without dissent.`;

// ── Typewriter hook ───────────────────────────────────────────────────────────

function useTypewriter(text: string, active: boolean, speed = 18): string {
  const [displayed, setDisplayed] = useState("");
  const idx = useRef(0);

  useEffect(() => {
    if (!active) { setDisplayed(""); idx.current = 0; return; }
    idx.current = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      idx.current += 1;
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, active, speed]);

  return displayed;
}

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ value, target = 80 }: { value: number; target?: number }) {
  const pct = Math.min(100, (value / target) * 100);
  const met = value >= target;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7ab87a", marginBottom: 3 }}>
        <span>Confidence</span>
        <span style={{ fontFamily: "monospace", color: met ? "#00c853" : "#7ab87a" }}>
          {value}% / {target}%
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,.4)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3,
          background: met ? "#00c853" : "rgba(0,200,83,.55)",
          width: `${pct}%`,
          transition: "width 1.2s ease",
        }} />
      </div>
    </div>
  );
}

// ── Single AI turn card ───────────────────────────────────────────────────────

function TurnCard({ turn, active, done }: { turn: Turn; active: boolean; done: boolean }) {
  const text = useTypewriter(turn.text, active || done, 12);
  if (!active && !done) return null;
  return (
    <div style={{
      border: `1px solid ${turn.color}33`,
      borderRadius: 9, padding: "10px 12px",
      background: `${turn.color}08`,
      animation: "fadeSlideUp .3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: turn.color, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {turn.role}
        </span>
        <span style={{ fontSize: 10, color: "#3a5a3a", fontFamily: "monospace" }}>· {turn.model}</span>
        {active && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: turn.color, animation: "pulse 1s infinite", marginLeft: "auto" }} />}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.65, color: "#cce8cc", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
        {text}
        {active && text.length < turn.text.length && <span style={{ color: turn.color, animation: "pulse 1s infinite" }}>▋</span>}
      </div>
    </div>
  );
}

// ── Phase: Config ─────────────────────────────────────────────────────────────

function PhaseConfig({ onRun }: { onRun: () => void }) {
  const [btnActive, setBtnActive] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setBtnActive(true), 2200);
    const t2 = setTimeout(() => onRun(), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onRun]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Config chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {DEMO_CONFIG.map((c) => (
          <div key={c.label} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid #1d331d", background: "rgba(0,200,83,.06)", color: "#7ab87a", fontFamily: "monospace" }}>
            <span style={{ color: "#3a5a3a" }}>{c.label}: </span>{c.value}
          </div>
        ))}
      </div>

      {/* Question textarea */}
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 10, color: "#7ab87a", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800, marginBottom: 4 }}>Question</div>
        <div style={{
          minHeight: 72, padding: "10px 12px", borderRadius: 9,
          border: "1px solid rgba(0,200,83,.4)",
          background: "#0a150a",
          fontSize: 14, color: "#eef7ee", lineHeight: 1.5,
          boxShadow: "0 0 0 2px rgba(0,200,83,.08)",
        }}>
          {DEMO_QUESTION}
          <span style={{ display: "inline-block", width: 2, height: 16, background: "#00c853", marginLeft: 1, verticalAlign: "middle", animation: "pulse 1s infinite" }} />
        </div>
      </div>

      {/* Run button */}
      <button
        style={{
          width: "100%", padding: "12px 0",
          borderRadius: 9, border: "none",
          background: btnActive ? "#00c853" : "rgba(0,200,83,.15)",
          color: btnActive ? "#000" : "#3a5a3a",
          fontSize: 15, fontWeight: 800, cursor: "default",
          transition: "all .4s ease",
          transform: btnActive ? "scale(1.01)" : "scale(1)",
          boxShadow: btnActive ? "0 0 24px rgba(0,200,83,.4)" : "none",
        }}
      >
        {btnActive ? "▶ Run Trial" : "▶ Run Trial"}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Phase = "config" | "starting" | "running" | "complete";

export default function LandingDemoPlayer() {
  const [phase, setPhase] = useState<Phase>("config");
  const [activeTurn, setActiveTurn] = useState(-1);
  const [doneTurns, setDoneTurns] = useState<number[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [activeTab, setActiveTab] = useState<"answer" | "debate">("answer");

  // How long each turn takes: ~12ms/char
  const turnDurations = TURNS.map((t) => t.text.length * 12 + 600);

  function reset() {
    setPhase("config");
    setActiveTurn(-1);
    setDoneTurns([]);
    setConfidence(0);
    setActiveTab("answer");
  }

  function handleRun() {
    setPhase("starting");
    setTimeout(() => startRunning(), 700);
  }

  function startRunning() {
    setPhase("running");
    setActiveTurn(0);
    setConfidence(0);
  }

  // Advance through turns
  useEffect(() => {
    if (phase !== "running" || activeTurn < 0) return;
    const turn = TURNS[activeTurn];
    if (!turn) return;

    // Animate confidence after a short delay into the turn
    const confTimer = setTimeout(() => {
      setConfidence(turn.confidenceAfter);
    }, 400);

    // Move to next turn after typing completes
    const nextTimer = setTimeout(() => {
      setDoneTurns((prev) => [...prev, activeTurn]);
      if (activeTurn + 1 < TURNS.length) {
        setActiveTurn(activeTurn + 1);
      } else {
        // All turns done → complete
        setTimeout(() => setPhase("complete"), 800);
      }
    }, turnDurations[activeTurn]);

    return () => { clearTimeout(confTimer); clearTimeout(nextTimer); };
  }, [phase, activeTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-loop
  useEffect(() => {
    if (phase !== "complete") return;
    const t = setTimeout(() => reset(), 7000);
    return () => clearTimeout(t);
  }, [phase]);

  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [activeTurn, doneTurns]);

  return (
    <div style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%,100% { opacity: 1; } 50% { opacity: 0; }
        }
      `}</style>

      {/* Outer shell — matches Session.tsx exactly */}
      <div style={{
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid #1d331d",
        background: "radial-gradient(circle at top, #102010, #070f07 56%, #020402)",
        boxShadow: "0 0 60px rgba(0,200,83,.12), 0 0 0 1px rgba(0,200,83,.08)",
        fontFamily: "system-ui, sans-serif",
      }}>

        {/* Header bar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "7px 8px", borderBottom: "1px solid #1d331d", background: "rgba(4,8,4,.96)" }}>
          <div style={{ background: "#0d1a0d", color: "#eef7ee", border: "1px solid #1d331d", borderRadius: 9, fontSize: 13, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>
            ⚙ Configure
          </div>
          <div style={{ background: "#0d1a0d", color: "#eef7ee", border: "1px solid #1d331d", borderRadius: 9, fontSize: 13, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>
            📂 Sessions
          </div>
          {(phase === "running" || phase === "starting") && (
            <div style={{ gridColumn: "1 / -1", background: "rgba(0,200,83,.12)", color: "#b6ff6a", border: "1px solid #00c85355", borderRadius: 9, fontSize: 13, minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 700 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00c853", display: "inline-block", animation: "pulse .9s infinite" }} />
              ⚡ Brain is thinking…
              {activeTurn >= 0 && (
                <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 11, color: "#7ab87a", paddingRight: 12 }}>
                  Revolution {Math.min(activeTurn + 1, TURNS.length)} / {TURNS.length}
                </span>
              )}
            </div>
          )}
          {phase === "complete" && (
            <div style={{ gridColumn: "1 / -1", background: "rgba(0,200,83,.1)", color: "#00c853", border: "1px solid #00c85355", borderRadius: 9, fontSize: 13, minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, cursor: "pointer" }}
              onClick={reset}
            >
              ↺ New Trial
            </div>
          )}
        </div>

        {/* Conversation panel */}
        <div style={{ padding: "10px 10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, color: "#00c853", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 800 }}>Conversation</div>

          {/* Confidence bar */}
          <ConfidenceBar value={confidence} target={80} />

          {/* Config phase */}
          {phase === "config" && <PhaseConfig onRun={handleRun} />}

          {/* Starting flash */}
          {phase === "starting" && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#3a5a3a", fontSize: 12, fontFamily: "monospace" }}>
              Convening the court…
            </div>
          )}

          {/* Running / complete — conversation feed */}
          {(phase === "running" || phase === "complete") && (
            <div ref={feedRef} style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto", scrollBehavior: "smooth" }}>
              {/* Question pill */}
              <div style={{ fontSize: 12, color: "#7ab87a", padding: "6px 10px", borderRadius: 8, background: "rgba(0,200,83,.06)", border: "1px solid rgba(0,200,83,.15)", fontStyle: "italic" }}>
                "{DEMO_QUESTION}"
              </div>

              {TURNS.map((turn, i) => (
                <TurnCard
                  key={turn.role}
                  turn={turn}
                  active={activeTurn === i}
                  done={doneTurns.includes(i)}
                />
              ))}
            </div>
          )}

          {/* Verdict — complete phase */}
          {phase === "complete" && (
            <div style={{ animation: "fadeSlideUp .5s ease" }}>
              {/* Tab bar */}
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {(["answer", "debate"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "1px solid",
                      borderColor: activeTab === tab ? "#00c853" : "#1d331d",
                      background: activeTab === tab ? "rgba(0,200,83,.1)" : "transparent",
                      color: activeTab === tab ? "#00c853" : "#3a5a3a",
                      cursor: "pointer", fontWeight: 600, textTransform: "capitalize",
                    }}
                  >
                    {tab === "answer" ? "Final Answer" : "Debate"}
                  </button>
                ))}
              </div>

              {activeTab === "answer" && (
                <div style={{ border: "1px solid rgba(0,200,83,.25)", borderRadius: 10, background: "rgba(0,200,83,.05)", padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, color: "#00c853", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Verdict — {confidence}% confidence
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.65, color: "#eef7ee", whiteSpace: "pre-wrap" }}>
                    {VERDICT}
                  </div>
                </div>
              )}

              {activeTab === "debate" && (
                <div style={{ border: "1px solid #1d331d", borderRadius: 10, padding: "12px 14px", background: "rgba(0,0,0,.12)" }}>
                  <div style={{ fontSize: 11, color: "#7ab87a", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Debate Notes</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: "#9aaa9a", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                    {DEBATE_NOTES}
                  </div>
                </div>
              )}

              {/* CTA */}
              <Link href="/register">
                <div style={{
                  marginTop: 10, padding: "11px 0", textAlign: "center", borderRadius: 9,
                  background: "#00c853", color: "#000", fontSize: 14, fontWeight: 800,
                  cursor: "pointer", letterSpacing: "0.02em",
                  boxShadow: "0 0 20px rgba(0,200,83,.35)",
                }}>
                  Put your question on trial — 100 credits free →
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
