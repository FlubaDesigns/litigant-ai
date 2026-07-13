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

const DEMO_QUESTION = "Is the Earth flat?";

const DEMO_CONFIG = [
  { label: "Court Mode",        value: "Adversarial"      },
  { label: "Litigants",         value: "4 (+ / −)"        },
  { label: "Reasoning",         value: "Chain of Thought"  },
  { label: "Confidence Target", value: "80%"               },
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
    role: "Advocate", model: "GPT-4o", color: "#d4a860", confidenceAfter: 28,
    text: `I'll steelman every possible argument. Ancient civilisations universally described a flat Earth — a reasonable inference from lived experience. Some claim GPS paths and flight routes are "corrected" for curvature. These intuitions feel compelling.\n\nHowever, I must be honest: every one of these arguments disintegrates under direct observational testing. I cannot in good conscience sustain the position.`,
  },
  {
    role: "Skeptic", model: "Claude 3.5", color: "#94a3b8", confidenceAfter: 63,
    text: `Every flat-Earth claim fails basic empirical scrutiny — ships disappear hull-first over the horizon, star constellations shift with latitude, lunar eclipses cast circular shadows regardless of angle, time zones exist, circumnavigation is routine, and orbital mechanics require a spheroid.\n\nThe Earth is an oblate spheroid. This is not contested science. Confidence in the contrary position: 0.0%.`,
  },
  {
    role: "Devil's Advocate", model: "Gemini 1.5 Pro", color: "#a78bfa", confidenceAfter: 81,
    text: `For completeness: flat-Earth cosmology dominated recorded history for millennia. The psychological appeal of a bounded, knowable world is real and worth understanding. Modern flat-Earth communities signal a genuine crisis of institutional trust — that sociological fact deserves serious analysis.\n\nNone of this changes the underlying physics. The Earth is round. I'm simply noting that dismissing the belief without understanding its roots misses something important.`,
  },
  {
    role: "Analyst", model: "Grok 3", color: "#34d399", confidenceAfter: 97,
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

function ConfidenceBar({ value, target = 80 }: { value: number; target?: number }) {
  const pct = Math.min(100, (value / target) * 100);
  const met = value >= target;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-zinc-500 mb-[3px]">
        <span>Confidence</span>
        <span className={`font-mono ${met ? "text-amber-400" : "text-zinc-500"}`}>
          {value}% / {target}%
        </span>
      </div>
      <div className="h-[6px] rounded-[3px] bg-black/40 overflow-hidden">
        <div
          className={`h-full rounded-[3px] transition-[width] duration-[1200ms] ease-linear ${met ? "bg-amber-500" : "bg-amber-500/50"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TurnCard({ turn, active, done }: { turn: Turn; active: boolean; done: boolean }) {
  const text = useTypewriter(turn.text, active || done, 12);
  if (!active && !done) return null;
  return (
    <div
      className="demo-turn-card demo-fade-in-up"
      style={{ border: `1px solid ${turn.color}33`, background: `${turn.color}08` }}
    >
      <div className="demo-turn-header">
        <span className="demo-turn-role" style={{ color: turn.color }}>{turn.role}</span>
        <span className="demo-turn-model">· {turn.model}</span>
        {active && (
          <span
            className="w-[6px] h-[6px] rounded-full inline-block demo-blink ml-auto"
            style={{ background: turn.color }}
          />
        )}
      </div>
      <div className="demo-turn-body">
        {text}
        {active && text.length < turn.text.length && (
          <span className="demo-blink" style={{ color: turn.color }}>▋</span>
        )}
      </div>
    </div>
  );
}

function PhaseConfig({ onRun }: { onRun: () => void }) {
  const [btnActive, setBtnActive] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setBtnActive(true), 2200);
    const t2 = setTimeout(() => onRun(), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onRun]);

  return (
    <div className="flex flex-col gap-2">
      <div className="demo-config-chips">
        {DEMO_CONFIG.map((c) => (
          <div key={c.label} className="demo-chip">
            <span className="demo-chip-label">{c.label}: </span>{c.value}
          </div>
        ))}
      </div>

      <div className="relative">
        <div className="demo-q-label">Question</div>
        <div className="demo-q-box">
          {DEMO_QUESTION}
          <span className="demo-cursor demo-blink" />
        </div>
      </div>

      <button
        className="demo-run-btn"
        style={{
          background: btnActive ? "#f59e0b" : "rgba(245,158,11,.12)",
          color: btnActive ? "#000" : "#6b5a2d",
          transform: btnActive ? "scale(1.01)" : "scale(1)",
          boxShadow: btnActive ? "0 0 24px rgba(245,158,11,.35)" : "none",
        }}
      >
        ▶ Run Trial
      </button>
    </div>
  );
}

type Phase = "config" | "starting" | "running" | "complete";

export default function LandingDemoPlayer() {
  const [phase, setPhase]           = useState<Phase>("config");
  const [activeTurn, setActiveTurn] = useState(-1);
  const [doneTurns, setDoneTurns]   = useState<number[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [activeTab, setActiveTab]   = useState<"answer" | "debate">("answer");

  const turnDurations = TURNS.map((t) => t.text.length * 12 + 600);

  function reset() {
    setPhase("config"); setActiveTurn(-1);
    setDoneTurns([]); setConfidence(0); setActiveTab("answer");
  }

  function handleRun() {
    setPhase("starting");
    setTimeout(() => { setPhase("running"); setActiveTurn(0); setConfidence(0); }, 700);
  }

  useEffect(() => {
    if (phase !== "running" || activeTurn < 0) return;
    const turn = TURNS[activeTurn];
    if (!turn) return;
    const confTimer = setTimeout(() => setConfidence(turn.confidenceAfter), 400);
    const nextTimer = setTimeout(() => {
      setDoneTurns((prev) => [...prev, activeTurn]);
      if (activeTurn + 1 < TURNS.length) setActiveTurn(activeTurn + 1);
      else setTimeout(() => setPhase("complete"), 800);
    }, turnDurations[activeTurn]);
    return () => { clearTimeout(confTimer); clearTimeout(nextTimer); };
  }, [phase, activeTurn]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="w-full max-w-[480px] mx-auto">
      <div className="demo-shell">

        {/* Header bar */}
        <div className="demo-header">
          <div className="demo-header-tab">⚙ Configure</div>
          <div className="demo-header-tab">📂 Sessions</div>

          {(phase === "running" || phase === "starting") && (
            <div className="demo-status-bar demo-status-bar--running">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block demo-blink" />
              ⚡ Brain is thinking…
              {activeTurn >= 0 && (
                <span className="ml-auto font-mono text-[11px] text-zinc-500 pr-3">
                  Revolution {Math.min(activeTurn + 1, TURNS.length)} / {TURNS.length}
                </span>
              )}
            </div>
          )}

          {phase === "complete" && (
            <div className="demo-status-bar demo-status-bar--complete" onClick={reset}>
              ↺ New Trial
            </div>
          )}
        </div>

        {/* Conversation panel */}
        <div className="demo-body">
          <div className="demo-conv-label">Conversation</div>
          <ConfidenceBar value={confidence} target={80} />

          {phase === "config"    && <PhaseConfig onRun={handleRun} />}
          {phase === "starting"  && <div className="demo-starting">Convening the court…</div>}

          {(phase === "running" || phase === "complete") && (
            <div ref={feedRef} className="demo-feed">
              <div className="demo-q-pill">"{DEMO_QUESTION}"</div>
              {TURNS.map((turn, i) => (
                <TurnCard key={turn.role} turn={turn} active={activeTurn === i} done={doneTurns.includes(i)} />
              ))}
            </div>
          )}

          {phase === "complete" && (
            <div className="demo-fade-in-up--slow flex flex-col gap-2">
              <div className="demo-tabs">
                {(["answer", "debate"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`demo-tab ${activeTab === tab ? "demo-tab--on" : "demo-tab--off"}`}
                  >
                    {tab === "answer" ? "Final Answer" : "Debate"}
                  </button>
                ))}
              </div>

              {activeTab === "answer" && (
                <div className="demo-answer-box">
                  <div className="demo-answer-hdr">Verdict — {confidence}% confidence</div>
                  <div className="demo-answer-body">{VERDICT}</div>
                </div>
              )}

              {activeTab === "debate" && (
                <div className="demo-debate-box">
                  <div className="demo-debate-hdr">Debate Notes</div>
                  <div className="demo-debate-body">{DEBATE_NOTES}</div>
                </div>
              )}

              <Link href="/register" className="demo-cta">
                Put your question on trial — 500 credits free →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
