import { Settings2, LayoutTemplate, ChevronRight, Gavel, Play, X } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CaseFileSection } from "@/components/CaseFileSection";
import { makeDefaultSeatMap } from "@/data/seatTypes";
import type { Template, CourtConfig } from "@/data/templates";
import { TEMPLATES } from "@/data/templates";
import type { SessionState } from "@/lib/sessionExport";
import type { CaseFileItem } from "@/hooks/useBrainSession";

interface SessionConfigureProps {
  state: SessionState;
  maxLitigants: number;
  insufficientCredits: boolean;
  estimatedCredits: number;
  fieldValues: Record<string, string>;
  setFieldValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  toolBanner: string | null;
  user: { getIdToken: () => Promise<string | undefined> } | null;
  onSetQuestion: (q: string) => void;
  onSetTemplate: (t: Template | null) => void;
  onSetConfig: (c: Partial<CourtConfig>) => void;
  onRun: () => void;
  onOpenConfig: () => void;
  onOpenTemplates: () => void;
  onAddLitigant: () => void;
  onRemoveLitigant: () => void;
  onSeatClick: (seatId: string, litIndex?: number) => void;
  onClearToolBanner: () => void;
  addCaseFile: (item: CaseFileItem) => void;
  removeCaseFile: (id: string) => void;
}

const NAMED_SEATS = [
  { id: "orchestrator", icon: "🎙", purpose: "Talks to you. Delivers the final verdict." },
  { id: "moderator",   icon: "⚖",  purpose: "Controls courtroom flow. Builds the briefing." },
  { id: "architect",   icon: "📐", purpose: "Defines the artifact structure before building." },
  { id: "builder",     icon: "🔨", purpose: "Builds the requested artifact or implementation." },
  { id: "auditor",     icon: "🔍", purpose: "Final quality gate — decides what ships." },
];

export function SessionConfigure({
  state,
  maxLitigants,
  insufficientCredits,
  estimatedCredits,
  fieldValues,
  setFieldValues,
  toolBanner,
  user,
  onSetQuestion,
  onSetTemplate,
  onRun,
  onOpenConfig,
  onOpenTemplates,
  onAddLitigant,
  onRemoveLitigant,
  onSeatClick,
  onClearToolBanner,
  addCaseFile,
  removeCaseFile,
}: SessionConfigureProps) {
  const seatMap = state.config.seatMap ?? makeDefaultSeatMap(state.config.litigantCount);

  return (
    <>
      {/* ── Row 2: Your Court (idle accordion) ── */}
      <div className="row">
        <div className="sz-court">
          <Accordion type="single" collapsible className="rounded-xl border border-primary/30 overflow-hidden" style={{ background: "rgba(0,200,83,.04)" }}>
            <AccordionItem value="your-court" className="border-b-0">
              <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-primary/5 transition-colors [&>svg]:text-primary/40 [&>svg]:shrink-0">
                <div className="flex items-center justify-between w-full mr-2">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary/70">Your Court</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenConfig(); }}
                    className="flex items-center gap-0.5 text-[11px] text-primary font-semibold hover:text-primary/80 transition-colors"
                  >
                    Configure <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3 pt-0">
                <div className="flex flex-wrap gap-1.5 mb-3 pt-1">
                  <div className="flex items-center gap-0 border border-primary/25 rounded-lg overflow-hidden bg-primary/5">
                    <button
                      onClick={onRemoveLitigant}
                      className="w-6 h-6 flex items-center justify-center text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors text-sm font-bold leading-none"
                      disabled={state.config.litigantCount <= 2}
                    >−</button>
                    <span className="text-[11px] font-mono text-primary/90 px-2 select-none whitespace-nowrap">{state.config.litigantCount} litigants</span>
                    <button
                      onClick={onAddLitigant}
                      className="w-6 h-6 flex items-center justify-center text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors text-sm font-bold leading-none"
                      disabled={state.config.litigantCount >= maxLitigants}
                    >+</button>
                  </div>
                  <span className="px-2.5 py-1 border border-border/35 rounded-lg text-[11px] text-muted-foreground capitalize">{state.config.debateMode}</span>
                  <span className="px-2.5 py-1 border border-border/35 rounded-lg text-[11px] text-muted-foreground">{state.config.confidenceTarget}% target</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {NAMED_SEATS.map(({ id, icon, purpose }) => {
                    const assignment = (seatMap as unknown as Record<string, unknown>)[id] as { name?: string } | undefined;
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/20 bg-card/30 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-colors"
                        onClick={() => onSeatClick(id, undefined)}
                      >
                        <span className="text-sm shrink-0">{icon}</span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[11px] font-semibold text-foreground/80 capitalize">{id}</span>
                          <span className="text-[10px] text-muted-foreground/50 truncate">{purpose}</span>
                        </div>
                        {assignment ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                            <span className="text-[10px] font-medium text-primary/70 truncate max-w-[80px]">{assignment.name ?? "Custom"}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30 shrink-0">default</span>
                        )}
                      </div>
                    );
                  })}
                  {Array.from({ length: state.config.litigantCount }, (_, i) => {
                    const seatId = `litigant_${i}`;
                    const assignment = (seatMap as unknown as Record<string, unknown>)[seatId] as { name?: string } | undefined;
                    return (
                      <div
                        key={seatId}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/20 bg-card/30 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-colors"
                        onClick={() => onSeatClick("litigant", i)}
                      >
                        <span className="text-sm shrink-0">⚖</span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[11px] font-semibold text-foreground/80">Litigant {i + 1}</span>
                          <span className="text-[10px] text-muted-foreground/50 truncate">Argues one position in the courtroom.</span>
                        </div>
                        {assignment ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70 shrink-0" />
                            <span className="text-[10px] font-medium text-amber-400/70 truncate max-w-[80px]">{assignment.name ?? "Custom"}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30 shrink-0">default</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex items-center gap-2 px-0.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary/70">Court Ready</span>
          </div>
        </div>
      </div>

      {/* ── Row 3: Dialogue (idle) ── */}
      <div className="row">
        <div className="sz-dialogue">

          {/* Tool banner */}
          {toolBanner && (
            <div className="session-tool-banner">
              <LayoutTemplate style={{ width: 13, height: 13, color: "#7ab87a", flexShrink: 0 }} />
              <span className="session-tool-banner-text">Pre-loaded: <strong>{toolBanner}</strong></span>
              <button
                onClick={() => { onSetTemplate(null); onClearToolBanner(); }}
                className="session-tool-banner-clear"
                title="Start fresh instead"
              >✕</button>
            </div>
          )}

          {/* Get Started accordion */}
          <Accordion type="single" collapsible className="border border-border/20 rounded-xl px-3">
            <AccordionItem value="get-started" className="border-b-0">
              <AccordionTrigger className="py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:no-underline hover:text-muted-foreground">
                Get started
              </AccordionTrigger>
              <AccordionContent className="pt-0 pb-3">
                <div className="flex flex-col gap-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 px-0.5 mb-0.5">
                    Try asking
                  </div>
                  {[
                    "Is our go-to-market strategy viable for enterprise?",
                    "Should we raise a Series A now or wait 12 months?",
                    "Is this contract clause actually enforceable?",
                    "Which of these two technical approaches is sounder?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => onSetQuestion(prompt)}
                      className="group text-left px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground border border-border/30 hover:border-primary/35 rounded-lg bg-transparent hover:bg-primary/5 transition-all"
                    >
                      <span className="text-primary/40 group-hover:text-primary/60 mr-1 transition-colors">"</span>
                      {prompt}
                      <span className="text-primary/40 group-hover:text-primary/60 transition-colors">"</span>
                    </button>
                  ))}
                </div>

                {/* Template button */}
                <button
                  onClick={onOpenTemplates}
                  className="mt-2 flex items-center gap-3 p-3 border border-primary/20 rounded-xl hover:border-primary/45 hover:bg-primary/5 transition-all text-left group w-full"
                  style={{ background: "rgba(0,200,83,.03)" }}
                >
                  <div className="w-8 h-8 rounded-lg border border-primary/25 bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <LayoutTemplate className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-primary leading-none mb-0.5">Use a template</div>
                    <div className="text-[11px] text-muted-foreground">{TEMPLATES.length} purpose-built trials</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-primary/40 group-hover:text-primary/70 transition-colors shrink-0" />
                </button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Case File */}
          <CaseFileSection
            items={state.caseFile}
            onAdd={addCaseFile}
            onRemove={removeCaseFile}
            getIdToken={() => user?.getIdToken() ?? Promise.resolve(undefined)}
          />

          {/* Input area (idle) */}
          <div className="flex flex-col gap-2 pt-1">
            {state.template ? (
              <div className="flex flex-col gap-2">
                {/* Template header */}
                <div className="flex items-center gap-2 px-0.5">
                  <Gavel className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                  <span className="text-xs font-semibold text-primary/80">{state.template.title}</span>
                  <button
                    onClick={() => { onSetTemplate(null); setFieldValues({}); }}
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md border border-border/30 hover:border-red-500/40 text-[11px] font-medium text-muted-foreground/70 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Clear template
                  </button>
                </div>
                {/* Template fields */}
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
            ) : (
              <div className="flex flex-col gap-2">
                <Textarea
                  placeholder="Put your question on trial…"
                  value={state.question}
                  onChange={(e) => onSetQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onRun(); } }}
                  className="resize-none focus-visible:ring-1 focus-visible:ring-primary/60 text-sm leading-relaxed"
                  style={{ minHeight: 96, background: "#0d1a0d", border: "1px solid #1d331d", borderRadius: 12, color: "#eef7ee", padding: "12px 14px" }}
                />
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground/30 flex-1">Enter to run · Shift+Enter for new line</span>
                  <button
                    onClick={onRun}
                    disabled={!state.question.trim() || insufficientCredits}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shrink-0"
                    style={{
                      background: (!state.question.trim() || insufficientCredits) ? "rgba(0,200,83,.15)" : "#00c853",
                      color: (!state.question.trim() || insufficientCredits) ? "rgba(0,200,83,.3)" : "#000",
                      cursor: (!state.question.trim() || insufficientCredits) ? "not-allowed" : "pointer",
                    }}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Run Trial
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
