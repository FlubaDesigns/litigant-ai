import { useState } from "react";
import { motion } from "framer-motion";
import { Settings2, Gavel, Play, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/hooks/useBrainSession";
import type { SessionState } from "@/lib/sessionExport";
import type { Template } from "@/data/templates";

// ── Feed helpers ──────────────────────────────────────────────────────────────

const PROVIDER_SHORT: Record<string, string> = {
  anthropic: "Claude", openai: "GPT", grok: "Grok", gemini: "Gemini",
};

const NON_LITIGANT_ROLES = new Set(["Orchestrator", "Moderator", "Architect", "Builder", "Auditor", "Verdict"]);
// Pipeline role prefixes — covers variants like "Architect (Review)", "Builder (Correction)", "Auditor (Cycle 2)"
const PIPELINE_ROLE_PREFIXES = ["Architect", "Builder", "Auditor", "Moderator", "Orchestrator", "Verdict"];

function isLitigantRole(role: string) {
  return role !== "You"
    && !NON_LITIGANT_ROLES.has(role)
    && !PIPELINE_ROLE_PREFIXES.some((p) => role.startsWith(p));
}

function isOrchestratorRole(role: string) {
  return role === "Orchestrator" || role === "Verdict" || role === "Moderator";
}

function DialogLine({ item, adversarial }: { item: FeedItem; adversarial?: boolean }) {
  const isYou = item.role === "You";
  const isLit = isLitigantRole(item.role);

  let borderColor: string;
  let speakerColor: string;
  let bgStyle: React.CSSProperties;

  if (isYou) {
    borderColor = "#4a9eff";
    speakerColor = "#4a9eff";
    bgStyle = { background: "rgba(0,120,255,.08)" };
  } else if (isLit) {
    borderColor = adversarial ? "#c84040" : "#7ab87a";
    speakerColor = adversarial ? "#ff9a9a" : "#7ab87a";
    bgStyle = { background: "rgba(0,0,0,.12)" };
  } else {
    borderColor = "#7ab87a";
    speakerColor = "#7ab87a";
    bgStyle = { background: "rgba(0,0,0,.15)" };
  }

  let disclosure = "";
  let body = item.content;
  if (!isYou && !isLit && body.startsWith("[")) {
    const nl = body.indexOf("\n");
    if (nl > -1) { disclosure = body.slice(0, nl + 1); body = body.slice(nl + 1); }
  }

  const providerShort = item.provider ? (PROVIDER_SHORT[item.provider] ?? null) : null;
  const speakerLabel = `${item.role}${isLit && adversarial ? " ⚔" : ""}${providerShort ? ` · ${providerShort}` : ""}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      style={{ ...bgStyle, borderLeft: `3px solid ${borderColor}`, borderRadius: 8, marginBottom: 8, padding: "6px 8px", lineHeight: 1.5, fontSize: 14 }}
    >
      <span style={{ fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 2, color: speakerColor }}>
        {speakerLabel}
        {item.round > 0 && item.round < 99 && (
          <span className="dialog-round">R{item.round}</span>
        )}
        {!item.isComplete && (
          <span className="dialog-typing">
            {[0, 130, 260].map((d) => (
              <span key={d} className="w-1 h-1 rounded-full bg-primary animate-bounce inline-block" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        )}
      </span>
      {disclosure && (
        <span className="dialog-disclosure">
          {disclosure.trim()}
        </span>
      )}
      {body || (!item.isComplete ? "" : <span className="dialog-nocontent">No content.</span>)}
    </motion.div>
  );
}

function LitigantVoicesBox({
  items, adversarial, scrollRef,
}: { items: FeedItem[]; adversarial: boolean; scrollRef?: React.RefObject<HTMLDivElement> }) {
  const [open, setOpen] = useState(true);

  function handleSave() {
    const lines = items.filter(f => f.content).map(f =>
      `${f.role.toUpperCase()}\n${f.content}\n`
    ).join("\n---\n\n");
    if (!lines) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["Litigant Voices Export\n\n" + lines], { type: "text/plain" }));
    a.download = `LitigantVoices_${Date.now()}.txt`;
    a.click();
  }

  return (
    <div className="sbox sbox--lit">
      <div className="sbox-hd sbox-hd--lit">
        <div className="sbox-hd-left">
          <span className="sbox-label sbox-label--lit">Litigant Voices</span>
          {adversarial && <span className="adv-badge">⚔ ADV</span>}
        </div>
        <div className="sbox-hd-right">
          <button onClick={handleSave} title="Export" className="sbox-btn sbox-btn--lit">⬇</button>
          <button onClick={() => setOpen(v => !v)} className="sbox-btn sbox-btn--lit">
            {open ? "▼" : "▶"}
          </button>
        </div>
      </div>
      {open && (
        <div ref={scrollRef} className="sbox-bd sbox-bd--lit">
          {items.length === 0 ? (
            <div className="sbox-empty">Waiting for litigant debate…</div>
          ) : (
            items.map(item => <DialogLine key={item.id} item={item} adversarial={adversarial} />)
          )}
        </div>
      )}
    </div>
  );
}

function OrchestratorBox({
  question, items, scrollRef,
}: { question: string; items: FeedItem[]; scrollRef?: React.RefObject<HTMLDivElement> }) {
  function handleSave() {
    const youLine = `YOU\n${question}\n`;
    const lines = items.filter(f => f.content).map(f =>
      `${f.role.toUpperCase()}\n${f.content}\n`
    ).join("\n---\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["Litigant AI — Conversation Export\n\n" + youLine + "\n---\n\n" + lines], { type: "text/plain" }));
    a.download = `LitigantAI_${Date.now()}.txt`;
    a.click();
  }

  function handlePrint() { window.print(); }

  const youItem: FeedItem = { id: "you", role: "You", provider: "", content: question, round: 0, timestamp: 0, isComplete: true };

  return (
    <div className="sbox sbox--orch">
      <div className="sbox-hd sbox-hd--orch">
        <span className="sbox-label sbox-label--orch">Orchestrator / Consensus</span>
        <div className="sbox-hd-right--orch">
          <button onClick={handleSave} title="Save" className="sbox-btn sbox-btn--orch">⬇</button>
          <button onClick={handlePrint} title="Print" className="sbox-btn sbox-btn--orch">🖨</button>
        </div>
      </div>
      <div ref={scrollRef} className="sbox-bd sbox-bd--orch">
        {question && <DialogLine key="you" item={youItem} />}
        {items.map(item => <DialogLine key={item.id} item={item} />)}
        {items.length === 0 && question && (
          <div className="sbox-empty sbox-empty--mt">Courtroom assembling…</div>
        )}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SessionCourtProps {
  state: SessionState;
  credits: number;
  estimatedCredits: number;
  newPipelineCap: number;
  setNewPipelineCap: (v: number) => void;
  insufficientCredits: boolean;
  feedbackGiven: "good" | "bad" | "warn" | null;
  rebuttalChallenge: string;
  setRebuttalChallenge: (v: string) => void;
  fieldValues: Record<string, string>;
  setFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
  isError: boolean;
  onStop: () => void;
  onContinue: (cap?: number) => Promise<void>;
  onAcceptPartial: () => void;
  onReset: () => void;
  onFeedback: (r: "good" | "bad" | "warn") => void;
  onCopyMarkdown: () => void;
  onDownload: () => Promise<void>;
  onExportPDF: () => void;
  onSubmitRebuttal: (challenge: string) => Promise<void>;
  onSetTemplate: (t: Template | null) => void;
  onSetFieldValues: (v: Record<string, string>) => void;
  onRun: () => void;
  onNavigate: (path: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionCourt({
  state,
  credits,
  estimatedCredits,
  newPipelineCap,
  setNewPipelineCap,
  insufficientCredits,
  feedbackGiven,
  rebuttalChallenge,
  setRebuttalChallenge,
  fieldValues,
  setFieldValues,
  isRunning,
  isPaused,
  isComplete,
  isError,
  onStop,
  onContinue,
  onAcceptPartial,
  onReset,
  onFeedback,
  onCopyMarkdown,
  onDownload,
  onExportPDF,
  onSubmitRebuttal,
  onSetTemplate,
  onSetFieldValues,
  onRun,
  onNavigate,
}: SessionCourtProps) {
  return (
    <>
      {/* ── Row 2: Compact Court Summary ── */}
      <div className="row">
        <div className="sz-court-summary">
          <Settings2 className="w-3 h-3 text-primary/40 shrink-0" />
          <span className="sz-court-summary-text">
            {state.config.litigantCount} litigants · {state.config.debateMode} · ~{estimatedCredits} cr
          </span>
        </div>
      </div>

      {/* ── Row 3: Dialogue (non-idle) ── */}
      <div className="row">
        <div className="sz-dialogue">

          {/* Confidence + Credits meters */}
          <div className="session-meters">
            <div>
              <p className="session-meter-hd">
                <span>Confidence</span>
                <span className="session-meter-val" style={{ color: state.confidence >= state.config.confidenceTarget ? "#00c853" : "#7ab87a" }}>
                  {state.confidence}% / {state.config.confidenceTarget}%
                </span>
              </p>
              <div className="session-meter-track">
                <div className="session-meter-fill" style={{ background: state.confidence >= state.config.confidenceTarget ? "#00c853" : "rgba(0,200,83,.55)", width: `${Math.min(100, (state.confidence / state.config.confidenceTarget) * 100)}%` }} />
              </div>
            </div>
            <div>
              <p className="session-meter-hd">
                <span>Credits Used</span>
                <span className="session-meter-val">{state.creditsUsed} / ~{estimatedCredits} est</span>
              </p>
              <div className="session-meter-track">
                <div className="session-meter-fill" style={{ background: "rgba(0,200,83,.4)", width: `${Math.min(100, (state.creditsUsed / Math.max(estimatedCredits, 1)) * 100)}%` }} />
              </div>
            </div>
          </div>

          {/* Running status badge */}
          {isRunning && (
            <div className="session-running-badge">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />
              ⚡ Brain is thinking…
              {state.currentRound > 0 && state.currentRound < 99 && (
                <span className="session-round-label">
                  Revolution {state.currentRound} / {state.config.maxIterations}
                </span>
              )}
            </div>
          )}

          {/* Paused decision card */}
          {isPaused && state.pauseReason && (
            <div className="session-pause-card">
              <div className="session-pause-title">
                {state.pauseReason === "credit_cap_pre_pipeline"
                  ? `⏸ Debate complete — credit cap hit before verdict pipeline`
                  : state.pauseReason === "credit_cap"
                  ? `⏸ Credit cap reached — ${Math.round(state.confidence)}% confidence`
                  : `⏸ ${state.config.maxIterations} rounds done — ${Math.round(state.confidence)}% (target ${state.config.confidenceTarget}%)`}
              </div>

              {state.pauseReason === "credit_cap_pre_pipeline" ? (
                <>
                  <div style={{ fontSize: 12, color: "#9ab89a", marginBottom: 10, lineHeight: 1.5 }}>
                    The court has finished debating with <strong>{Math.round(state.confidence)}% confidence</strong>.
                    The verdict pipeline (Moderator → Architect → Builder → Verdict) still needs to run.
                    Raise your cap to allow it, or accept the debate transcript as-is.
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <label style={{ fontSize: 12, color: "#7ab87a", whiteSpace: "nowrap" }}>New credit cap</label>
                    <input
                      type="number"
                      min={state.creditsUsed + 1}
                      step={10}
                      value={newPipelineCap || (state.config.maxCredits ?? 0) + 30}
                      onChange={(e) => setNewPipelineCap(Math.max(state.creditsUsed + 1, Number(e.target.value)))}
                      style={{
                        width: 90, padding: "4px 8px", borderRadius: 7, border: "1px solid #2a4a2a",
                        background: "#0d1f0d", color: "#eef7ee", fontSize: 13,
                      }}
                    />
                    <span style={{ fontSize: 11, color: "#556655" }}>credits (you have {credits})</span>
                  </div>
                  <div className="session-pause-btns">
                    {credits < 25 ? (
                      <button onClick={() => onNavigate("/billing")} className="session-pause-btn-primary">Top Up Wallet</button>
                    ) : (
                      <button
                        onClick={() => { void onContinue(newPipelineCap || (state.config.maxCredits ?? 0) + 30); }}
                        className="session-pause-btn-primary"
                      >
                        Continue to verdict — {credits} cr
                      </button>
                    )}
                    <button onClick={onAcceptPartial} className="session-pause-btn-secondary">Accept debate only</button>
                  </div>
                </>
              ) : (
                <div className="session-pause-btns">
                  {credits === 0 ? (
                    <button onClick={() => onNavigate("/billing")} className="session-pause-btn-primary">Top Up Wallet</button>
                  ) : (
                    <button onClick={() => { void onContinue(); }} className="session-pause-btn-primary">Continue — {credits} cr</button>
                  )}
                  <button onClick={onAcceptPartial} className="session-pause-btn-secondary">Accept answer</button>
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div style={{ background: "rgba(200,64,64,.08)", border: "1px solid rgba(200,64,64,.3)", borderRadius: 9, padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: 14, color: "#ff6b6b", fontWeight: 700, marginBottom: 6 }}>Session Error</div>
              <div style={{ fontSize: 12, color: "#9a5a5a", marginBottom: 10 }}>{state.errorMessage}</div>
              <button onClick={onReset} style={{ background: "transparent", border: "1px solid #c84040", borderRadius: 8, color: "#ff6b6b", padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>Try Again</button>
            </div>
          )}

          {/* Live conversation feed */}
          {state.question && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {state.runtimeFeed.some((f) => isLitigantRole(f.role)) && (
                <LitigantVoicesBox
                  items={state.runtimeFeed.filter((f) => isLitigantRole(f.role))}
                  adversarial={state.config.debateMode !== "collaborative"}
                />
              )}
              <OrchestratorBox
                question={state.question}
                items={state.runtimeFeed.filter((f) => isOrchestratorRole(f.role))}
              />
            </div>
          )}

          {/* Complete: feedback + export + output tabs + challenge */}
          {isComplete && (
            <>
              {/* Feedback + export bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "6px 0" }}>
                <span style={{ fontSize: 12, color: "#7ab87a" }}>Helpful?</span>
                {(["good", "bad", "warn"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => onFeedback(r)}
                    disabled={feedbackGiven !== null}
                    style={{
                      width: 34, height: 34, borderRadius: 8, fontSize: 16,
                      background: feedbackGiven === r ? "rgba(0,200,83,.15)" : "transparent",
                      border: feedbackGiven === r ? "1px solid #00c853" : "1px solid #1d331d",
                      cursor: feedbackGiven !== null ? "default" : "pointer", color: "#eef7ee",
                    }}
                  >
                    {r === "good" ? "👍" : r === "bad" ? "👎" : "⚠️"}
                  </button>
                ))}
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button onClick={onCopyMarkdown} style={{ fontSize: 12, padding: "4px 8px", background: "transparent", border: "1px solid #1d331d", borderRadius: 7, color: "#eef7ee", cursor: "pointer" }}>Copy</button>
                  <button onClick={() => void onDownload()} style={{ fontSize: 12, padding: "4px 8px", background: "transparent", border: "1px solid #1d331d", borderRadius: 7, color: "#eef7ee", cursor: "pointer" }}>
                    {state.config.format === "docx" ? "DOCX" : state.config.format === "pdf" ? "PDF" : state.config.format === "json" ? "JSON" : state.config.format === "text" ? "TXT" : "MD"}
                  </button>
                  <button onClick={onExportPDF} style={{ fontSize: 12, padding: "4px 8px", background: "transparent", border: "1px solid #1d331d", borderRadius: 7, color: "#eef7ee", cursor: "pointer" }}>Print</button>
                </div>
              </div>

              {/* Output tabs */}
              <Tabs defaultValue="answer">
                <TabsList className="bg-black/30 border border-white/8 mb-2 flex-wrap h-auto gap-y-1">
                  <TabsTrigger value="answer" className="text-xs">Final Answer</TabsTrigger>
                  <TabsTrigger value="debate" className="text-xs">Debate</TabsTrigger>
                  <TabsTrigger value="transcript" className="text-xs">Transcript</TabsTrigger>
                  <TabsTrigger value="caveats" className="text-xs">Caveats</TabsTrigger>
                </TabsList>
                <TabsContent value="answer">
                  <div style={{ border: "1px solid rgba(0,200,83,.2)", borderRadius: 10, background: "rgba(0,200,83,.05)", padding: "14px" }}>
                    <div style={{ fontSize: 11, color: "#00c853", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                      Verdict — {state.confidence}% confidence
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.65, color: "#eef7ee", whiteSpace: "pre-wrap" }}>
                      {state.finalAnswer || "No final answer generated."}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="debate">
                  <div style={{ border: "1px solid #1d331d", borderRadius: 10, padding: "14px", background: "rgba(0,0,0,.12)" }}>
                    <div style={{ fontSize: 11, color: "#7ab87a", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Debate Notes</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: "#9aaa9a", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                      {state.debateNotes || "No debate notes recorded."}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="transcript">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {state.runtimeFeed.some((f) => isLitigantRole(f.role)) && (
                      <LitigantVoicesBox items={state.runtimeFeed.filter((f) => isLitigantRole(f.role))} adversarial={state.config.debateMode !== "collaborative"} />
                    )}
                    <OrchestratorBox question={state.question} items={state.runtimeFeed.filter((f) => isOrchestratorRole(f.role))} />
                  </div>
                </TabsContent>
                <TabsContent value="caveats">
                  <div style={{ border: "1px solid rgba(243,210,106,.2)", borderRadius: 10, background: "rgba(243,210,106,.04)", padding: "14px" }}>
                    <div style={{ fontSize: 11, color: "#f3d26a", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Sources & Caveats</div>
                    <div style={{ fontSize: 14, lineHeight: 1.65, color: "#eef7ee", whiteSpace: "pre-wrap", marginBottom: 10 }}>{state.caveats}</div>
                    <div style={{ fontSize: 12, color: "#5a5a3a", borderTop: "1px solid rgba(243,210,106,.1)", paddingTop: 10 }}>
                      Litigant AI provides AI-generated reasoning. Not legal, medical, financial, or professional advice.
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Challenge the Verdict */}
              <div style={{ border: "1px solid rgba(0,200,83,.25)", borderRadius: 10, background: "rgba(0,200,83,.03)", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid rgba(0,200,83,.12)", background: "rgba(0,200,83,.06)" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "#00c853" }}>
                    ⚖ Challenge the Verdict
                  </span>
                  {state.rebuttalRound > 0 && (
                    <span style={{ fontSize: 10, padding: "2px 8px", background: "rgba(0,200,83,.12)", border: "1px solid rgba(0,200,83,.3)", borderRadius: 20, color: "#7ab87a", fontWeight: 700, marginLeft: 4 }}>
                      Rebuttal {state.rebuttalRound}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#3a5a3a" }}>~{estimatedCredits} cr to reconvene</span>
                </div>

                {state.rebuttals.length > 0 && (
                  <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(0,200,83,.08)", display: "flex", flexDirection: "column", gap: 5 }}>
                    {state.rebuttals.map((r) => (
                      <div key={r.round} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11 }}>
                        <span style={{ color: "#3a5a3a", fontWeight: 700, whiteSpace: "nowrap", minWidth: 28 }}>R{r.round}</span>
                        <span style={{ color: "#5a7a5a", fontStyle: "italic" }}>
                          "{r.challenge.length > 90 ? r.challenge.slice(0, 90) + "…" : r.challenge}"
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={rebuttalChallenge}
                    onChange={(e) => setRebuttalChallenge(e.target.value)}
                    placeholder="What did the court miss? What assumption is wrong? State your objection and the court will reconvene…"
                    rows={3}
                    style={{ width: "100%", background: "#070f07", border: "1px solid rgba(0,200,83,.2)", borderRadius: 8, color: "#eef7ee", fontSize: 13, padding: "8px 10px", resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.6 }}
                    onFocus={(e) => { e.target.style.borderColor = "rgba(0,200,83,.5)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "rgba(0,200,83,.2)"; }}
                  />
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => {
                        const challenge = rebuttalChallenge.trim();
                        if (!challenge) return;
                        setRebuttalChallenge("");
                        void onSubmitRebuttal(challenge);
                      }}
                      disabled={!rebuttalChallenge.trim() || insufficientCredits}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        borderRadius: 8,
                        background: rebuttalChallenge.trim() && !insufficientCredits ? "#00c853" : "rgba(0,200,83,.1)",
                        color: rebuttalChallenge.trim() && !insufficientCredits ? "#000" : "#2a4a2a",
                        fontSize: 13,
                        fontWeight: 800,
                        border: "none",
                        cursor: rebuttalChallenge.trim() && !insufficientCredits ? "pointer" : "not-allowed",
                        transition: "background .15s, color .15s",
                      }}
                    >
                      ⚖ Reconvene the Court
                    </button>
                    <button
                      onClick={onReset}
                      style={{ padding: "10px 14px", borderRadius: 8, background: "transparent", color: "#3a5a3a", fontSize: 12, border: "1px solid #1d331d", cursor: "pointer" }}
                    >
                      New Case
                    </button>
                  </div>
                  {insufficientCredits && (
                    <div style={{ fontSize: 11, color: "#c84040", textAlign: "center" }}>
                      Not enough credits to reconvene.{" "}
                      <button onClick={() => onNavigate("/billing")} style={{ background: "none", border: "none", color: "#ff6b6b", cursor: "pointer", fontSize: 11, textDecoration: "underline", padding: 0 }}>
                        Top up
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Input area for complete + template rerun */}
              {state.template && (
                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-0.5">
                      <Gavel className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                      <span className="text-xs font-semibold text-primary/80">{state.template.title}</span>
                      <button
                        onClick={() => { onSetTemplate(null); onSetFieldValues({}); }}
                        className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md border border-border/30 hover:border-red-500/40 text-[11px] font-medium text-muted-foreground/70 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                      >
                        <X className="w-3 h-3" />
                        Clear template
                      </button>
                    </div>
                    {state.template.inputFields.map((field) => (
                      <div key={field.id} className="flex items-center gap-2">
                        <span className="text-[11px] text-primary/60 whitespace-nowrap w-20 shrink-0 font-medium">{field.label}</span>
                        <Input
                          type={field.type === "url" ? "url" : "text"}
                          placeholder={field.placeholder}
                          value={fieldValues[field.id] ?? ""}
                          onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onRun(); }}
                          className="h-9 text-sm flex-1 focus-visible:ring-1 focus-visible:ring-primary/60"
                          style={{ background: "#0d1a0d", border: "1px solid #1d331d", color: "#eef7ee" }}
                        />
                      </div>
                    ))}
                    <button
                      onClick={onRun}
                      disabled={insufficientCredits}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-all"
                      style={{
                        background: insufficientCredits ? "rgba(0,200,83,.15)" : "#00c853",
                        color: insufficientCredits ? "rgba(0,200,83,.35)" : "#000",
                        cursor: insufficientCredits ? "not-allowed" : "pointer",
                      }}
                    >
                      <Play className="w-4 h-4" />
                      Run Trial
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
}
