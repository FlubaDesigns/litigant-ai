import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Briefcase, Globe, TrendingUp, Code2, FileText, BookOpen,
  Stethoscope, Scale, Search, FlaskConical, AlertTriangle,
  LayoutTemplate, Gavel, X, Play,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { buildPdfToastActions } from "@/lib/pdfExport";
import { buildMarkdown, exportPDF, exportDocx, exportJsPdf } from "@/lib/sessionExport";
import { useBrainSession } from "@/hooks/useBrainSession";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { TEMPLATES, TEMPLATE_CATEGORIES, DEFAULT_CONFIG, type Template } from "@/data/templates";
import type { CourtConfig } from "@/data/templates";
import { makeDefaultSeatMap, type SeatAssignment } from "@/data/seatTypes";
import { submitFeedback } from "@/services/feedbackService";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useLocation } from "wouter";
import {
  getProviders, getCalibration, estimateCredits,
  type ProviderInfo, type ModelCreditInfo, type CalibrationStats,
} from "@/services/providerService";
import { useLimits } from "@/hooks/useLimits";
import { toast } from "sonner";
import { ConfigPanel } from "./session/ConfigPanel";
import { SessionConfigure } from "./session/SessionConfigure";
import { SessionCourt } from "./session/SessionCourt";
import { SessionDiagram } from "./session/SessionDiagram";
import { SeatInspector } from "@/components/SeatInspector";

// ── Icon map (used by TemplateCard) ───────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase, Globe, TrendingUp, Code2, FileText, BookOpen,
  Stethoscope, Scale, Search, FlaskConical,
};

// ── TemplateCard ──────────────────────────────────────────────────────────────
function TemplateCard({ template, onClick }: { template: Template; onClick: () => void }) {
  const Icon = ICON_MAP[template.icon] ?? Briefcase;
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group text-left w-full rounded-xl border border-border/60 bg-card/50 hover:border-primary/40 hover:bg-primary/5 p-4 transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold truncate">{template.title}</span>
            <span className="ml-auto text-xs font-mono text-muted-foreground shrink-0">
              ~{template.estimatedCredits}cr
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {template.description}
          </p>
        </div>
      </div>
    </motion.button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SessionPage() {
  const { user, userProfile, isAdmin } = useAuth();
  const { credits, plan } = useUserProfile();

  // If admin has toggled a test model on this account, pre-build a seatMap
  // so all seats run on that model instead of the default.
  const testSeatMap = (userProfile?.testModel && userProfile?.testProvider)
    ? (() => {
        const count = userProfile.defaultSettings?.litigantCount ?? DEFAULT_CONFIG.litigantCount;
        const seat: SeatAssignment = { provider: userProfile.testProvider!, model: userProfile.testModel! };
        return {
          orchestrator: seat, moderator: seat, auditor: seat,
          architect: seat, builder: seat,
          litigants: Array.from({ length: count }, () => ({ ...seat })),
        };
      })()
    : undefined;

  const savedConfig = userProfile?.defaultSettings
    ? {
        litigantCount:    userProfile.defaultSettings.litigantCount ?? 3,
        confidenceTarget: userProfile.defaultSettings.confidenceTarget ?? 80,
        maxIterations:    userProfile.defaultSettings.maxIterations ?? 2,
        responseMode:     (userProfile.defaultSettings.responseMode as CourtConfig["responseMode"]) ?? "balanced",
        outputFormat:     (userProfile.defaultSettings.outputFormat as CourtConfig["outputFormat"]) ?? "report",
        provider:         (userProfile.defaultSettings.provider as CourtConfig["provider"]) ?? undefined,
        model:            userProfile.defaultSettings.model ?? undefined,
        conscience:       userProfile.defaultSettings.conscience ?? true,
        aiReasoning:      (userProfile.defaultSettings.aiReasoning as CourtConfig["aiReasoning"]) ?? "chain",
        debateMode:       (userProfile.defaultSettings.debateMode as CourtConfig["debateMode"]) ?? "adversarial",
        maxCredits:       userProfile.defaultSettings.maxCredits ?? DEFAULT_CONFIG.maxCredits,
        outputScope:      (userProfile.defaultSettings.outputScope as CourtConfig["outputScope"]) ?? DEFAULT_CONFIG.outputScope,
        outputStrategy:   (userProfile.defaultSettings.outputStrategy as CourtConfig["outputStrategy"]) ?? DEFAULT_CONFIG.outputStrategy,
        outputPreference: "both" as CourtConfig["outputPreference"],
        format:           (userProfile.defaultSettings.format as CourtConfig["format"]) ?? DEFAULT_CONFIG.format,
        artifactType:     (userProfile.defaultSettings.artifactType as CourtConfig["artifactType"]) ?? "auto",
        ...(testSeatMap ? { seatMap: testSeatMap } : {}),
      }
    : undefined;

  const brainSession = useBrainSession(savedConfig);
  const {
    state, run, stop, reset, acceptPartial, continueSession,
    loadPausedSession, loadCompleteSession, submitRebuttal, submitRelay, setEndOfJobTap,
    setQuestion, setTemplate, setConfig, setSeatAI,
    applyFeedbackGrades, addCaseFile, removeCaseFile,
  } = brainSession;

  const [, navigate] = useLocation();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [configOpen, setConfigOpen] = useState(false);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [feedbackGiven, setFeedbackGiven] = useState<"good" | "bad" | "warn" | null>(null);
  const [overdraftDialogOpen, setOverdraftDialogOpen] = useState(false);
  const [rebuttalChallenge, setRebuttalChallenge] = useState("");
  const [inspectorSeat, setInspectorSeat] = useState<{ seatId: string; litIndex?: number } | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [selectedCreditInfo, setSelectedCreditInfo] = useState<ModelCreditInfo | null>(null);
  const [calibration, setCalibration] = useState<CalibrationStats | null>(null);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [allProviders, setAllProviders] = useState<ProviderInfo[]>([]);
  const [toolBanner, setToolBanner] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const activityLogRef = useRef<HTMLDivElement>(null);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    getProviders().then((data) => setAllProviders(data.providers)).catch(() => {});
  }, []);

  useEffect(() => {
    getProviders().then((data) => {
      const prov = data.providers.find((p) => p.name === state.config.provider) ?? data.providers[0];
      const model = prov?.models.find((m) => m.id === (state.config.model ?? prov?.defaultModel)) ?? prov?.models[0];
      setSelectedCreditInfo(model?.creditInfo ?? null);
    }).catch(() => {});
  }, [state.config.provider, state.config.model]);

  useEffect(() => {
    if (!user) { setCalibration(null); return; }
    user.getIdToken().then((token) => getCalibration(token)).then((cal) => {
      if (cal) setCalibration(cal);
    }).catch(() => {});
  }, [user]);

  useEffect(() => { setFieldValues({}); }, [state.template?.id]);

  // Dev-only test helper for Playwright PDF export tests
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const _dispatch = (brainSession as any)._dispatch;
    if (!_dispatch) return;
    (window as any).__testPdfExport = (finalAnswer: string) => {
      setQuestion("Test question for PDF export");
      setConfig({ format: "pdf" });
      _dispatch({
        type: "SESSION_DONE",
        payload: {
          confidence: 85, creditsUsed: 3, finalAnswer,
          debateNotes: "Test debate notes.", transcript: "Test transcript.",
          caveats: "Test caveats.", artifacts: "", sessionId: "test-session",
        },
      });
    };
    return () => { delete (window as any).__testPdfExport; };
  });

  // Pre-select template from ?templateId= URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("templateId");
    if (tid && state.phase === "idle" && !state.template) {
      const template = TEMPLATES.find((t) => t.id === tid);
      if (template) {
        setTemplate(template);
        setConfig(template.defaultConfig);
        setToolBanner(template.title);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill from history Re-run / Resume
  useEffect(() => {
    if (state.phase !== "idle") return;
    const raw = sessionStorage.getItem("litigant_prefill");
    if (!raw) return;
    sessionStorage.removeItem("litigant_prefill");
    try {
      const prefill = JSON.parse(raw) as {
        mode: "rerun" | "resume" | "load";
        question: string;
        templateId: string | null;
        sessionId?: string;
        confidence?: number;
        creditsUsed?: number;
        finalAnswer?: string;
        debateNotes?: string;
        transcript?: string;
        caveats?: string;
        artifacts?: string;
      };
      if (prefill.templateId) {
        const tmpl = TEMPLATES.find((t) => t.id === prefill.templateId);
        if (tmpl) { setTemplate(tmpl); setConfig(tmpl.defaultConfig); }
      }
      if (prefill.mode === "rerun") {
        setQuestion(prefill.question);
      } else if (prefill.mode === "load" && prefill.sessionId) {
        loadCompleteSession({
          question: prefill.question, config: {}, sessionId: prefill.sessionId,
          confidence: prefill.confidence ?? 0, creditsUsed: prefill.creditsUsed ?? 0,
          finalAnswer: prefill.finalAnswer ?? "", debateNotes: prefill.debateNotes ?? "",
          transcript: prefill.transcript ?? "", caveats: prefill.caveats ?? "",
          artifacts: prefill.artifacts ?? "",
        });
      } else if (prefill.mode === "resume" && prefill.sessionId) {
        loadPausedSession({
          question: prefill.question, config: {}, sessionId: prefill.sessionId,
          confidence: prefill.confidence ?? 0, creditsUsed: prefill.creditsUsed ?? 0,
          finalAnswer: prefill.finalAnswer ?? "", debateNotes: prefill.debateNotes ?? "",
          transcript: prefill.transcript ?? "", caveats: prefill.caveats ?? "",
          artifacts: prefill.artifacts ?? "",
        });
      }
    } catch { /* ignore malformed payload */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (feedRef.current && state.phase === "running") {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [state.runtimeFeed, state.phase]);

  useEffect(() => {
    if (activityLogRef.current && activityLogOpen) {
      activityLogRef.current.scrollTop = activityLogRef.current.scrollHeight;
    }
  }, [state.activityLog, activityLogOpen]);

  // ── Computed values ──────────────────────────────────────────────────────────

  const { maxLitigants, overdraftLimit } = useLimits();
  const overdraftFlag = useFeatureFlag("creditOverdraft");

  const isRunning     = state.phase === "running";
  const isPaused      = state.phase === "paused";
  const isComplete    = state.phase === "complete";
  const isRelayNeeded = state.phase === "relay_needed";
  const isError       = state.phase === "error";
  const isIdle        = state.phase === "idle";

  const effectiveCreditInfo = selectedCreditInfo && calibration?.isCalibrated
    ? { ...selectedCreditInfo, fixedStagePrior: calibration.fixedStage }
    : selectedCreditInfo;

  const estimatedCredits = effectiveCreditInfo
    ? estimateCredits(effectiveCreditInfo, state.config.litigantCount, state.config.maxIterations, state.config.responseMode)
    : state.config.litigantCount * state.config.maxIterations * 3 + 6;

  const estimatedCreditsHigh = estimatedCredits + (state.config.conscience ? 1 : 0) + Math.ceil(estimatedCredits * 0.4);

  const creditsCritical    = credits < 10;
  const creditsLow         = credits < 50 && !creditsCritical;
  const hasDebt            = credits < 0;
  const overdraftAvailable = overdraftFlag && credits > -overdraftLimit;
  const insufficientCredits = !isAdmin && credits < estimatedCreditsHigh && !overdraftAvailable;

  const filteredTemplates =
    activeCategory === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.category === activeCategory);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function assembleFieldQuestion(): string {
    if (!state.template || state.template.inputFields.length === 0) return state.question;
    return state.template.inputFields
      .map((f) => (fieldValues[f.id]?.trim() ? `${f.label}: ${fieldValues[f.id].trim()}` : null))
      .filter(Boolean)
      .join("\n");
  }

  async function handleRun() {
    const hasFields = state.template && state.template.inputFields.length > 0;
    const effectiveQuestion = hasFields ? assembleFieldQuestion() : state.question;

    if (hasFields) {
      const missing = state.template!.inputFields.filter((f) => f.required && !fieldValues[f.id]?.trim());
      if (missing.length > 0) {
        toast.error(`Please fill in: ${missing.map((f) => f.label).join(", ")}`);
        return;
      }
    }

    if (!effectiveQuestion.trim()) {
      toast.error("Please enter a question first.");
      return;
    }
    if (!isAdmin && userProfile && userProfile.creditBalance < estimatedCreditsHigh) {
      if (overdraftAvailable) {
        setOverdraftDialogOpen(true);
        return;
      }
      toast.error(`You need at least ${estimatedCreditsHigh} credits to run this session.`, {
        action: { label: "Buy Credits", onClick: () => navigate("/billing") },
      });
      return;
    }
    setFeedbackGiven(null);
    await run(effectiveQuestion !== state.question ? effectiveQuestion : undefined);
  }

  async function handleOverdraftConfirm() {
    setOverdraftDialogOpen(false);
    const hasFields = state.template && state.template.inputFields.length > 0;
    const effectiveQuestion = hasFields ? assembleFieldQuestion() : state.question;
    setFeedbackGiven(null);
    await run(effectiveQuestion !== state.question ? effectiveQuestion : undefined, { overdraft: true });
  }

  function handleReset() { reset(); setFeedbackGiven(null); }

  function handleStop() { stop(); toast.info("Session stopped. Partial results are shown below."); }

  function handleCopyMarkdown() {
    navigator.clipboard.writeText(buildMarkdown(state));
    toast.success("Copied to clipboard.");
  }

  const handleDownload = useCallback(async () => {
    const fmt = state.config.format ?? "markdown";
    if (fmt === "docx") {
      try { await exportDocx(state); toast.success("Word document downloaded."); }
      catch { toast.error("Failed to generate .docx file."); }
      return;
    }
    if (fmt === "pdf") {
      try {
        const { wasTrimmed } = exportJsPdf(state);
        for (const action of buildPdfToastActions(wasTrimmed)) {
          if (action.type === "success") toast.success(action.message);
          else toast.warning(action.message);
        }
      } catch { toast.error("Failed to generate PDF."); }
      return;
    }
    if (fmt === "json") {
      const payload = {
        question: state.question, template: state.template?.title ?? null,
        confidence: state.confidence, creditsUsed: state.creditsUsed,
        date: new Date().toISOString(), finalAnswer: state.finalAnswer,
        artifacts: state.artifacts, debateNotes: state.debateNotes, caveats: state.caveats,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `brain-session-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON downloaded.");
      return;
    }
    if (fmt === "text") {
      const blob = new Blob([buildMarkdown(state).replace(/[#*_`]/g, "")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `brain-session-${Date.now()}.txt`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Text file downloaded.");
      return;
    }
    const blob = new Blob([buildMarkdown(state)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `brain-session-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded.");
  }, [state]);

  function handleExportPDF() {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Popup blocked — allow popups for this site to print/save as PDF."); return; }
    exportPDF(state, w);
  }

  async function handleFeedback(rating: "good" | "bad" | "warn") {
    setFeedbackGiven(rating);
    if (rating === "good" || rating === "bad") {
      applyFeedbackGrades(rating, state.courtHappened ? "answer" : "answer");
    }
    try {
      await submitFeedback({
        userId: user?.uid ?? null,
        sessionId: state.sessionId,
        turnId: state.sessionId ?? `anon-${Date.now()}`,
        role: "Verdict",
        rating,
      });
      toast.success("Feedback recorded — grades updated.");
    } catch { toast.error("Failed to save feedback."); }
  }

  function handleSeatClick(seatId: string, litIndex?: number) {
    setInspectorSeat({ seatId, litIndex });
  }

  function handleSeatUpdate(seatId: string, assignment: SeatAssignment, litIndex?: number) {
    setSeatAI(seatId, assignment, litIndex);
  }

  function handleAddLitigant() {
    setConfig({ litigantCount: Math.min(state.config.litigantCount + 1, maxLitigants) });
  }

  function handleRemoveLitigant() {
    setConfig({ litigantCount: Math.max(state.config.litigantCount - 1, 2) });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Overdraft confirmation dialog ── */}
      {overdraftDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-amber-400/30 bg-[#1a1200] p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-300 text-sm">Out of credits</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  This session costs ~{estimatedCreditsHigh} credits. Your balance is {credits.toLocaleString()} cr.
                  You can continue on credit — the debt ({Math.abs(Math.min(0, credits - estimatedCreditsHigh)).toLocaleString()} cr max) will be cleared automatically on your next top-up.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setOverdraftDialogOpen(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleOverdraftConfirm}
                className="flex-1 py-2 rounded-lg text-sm font-bold transition-colors"
                style={{ background: "hsl(38 92% 50%)", color: "#000" }}
              >
                Continue on Credit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mission Briefing sheet ── */}
      <ConfigPanel
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        config={state.config}
        onChange={setConfig}
        uid={user?.uid}
        onboardingComplete={userProfile?.onboardingComplete}
        isAdmin={isAdmin}
      />

      {/* ── Seat Inspector — top-level so fixed positioning escapes all containers ── */}
      {inspectorSeat && (
        <SeatInspector
          seatId={inspectorSeat.seatId}
          litIndex={inspectorSeat.litIndex}
          seatMap={state.config.seatMap ?? makeDefaultSeatMap(state.config.litigantCount)}
          grades={state.grades}
          providers={allProviders}
          globalIntelligenceLevel={state.config.intelligenceLevel ?? 50}
          onClose={() => setInspectorSeat(null)}
          onUpdate={handleSeatUpdate}
        />
      )}

      {/* ── 60/40 grid: phase content left, diagram right ── */}
      <div className="row">
        <div className="layout__split-2-3">

          {/* ── Left 60%: nav buttons + phase views ── */}
          <div className="min-w-0">

            {/* Nav buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-3 pb-1">
              <button
                onClick={() => setConfigOpen(true)}
                className="w-full flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
              >
                ⚙ Configure
              </button>
              <button
                onClick={() => navigate("/history")}
                className="w-full flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-border/40 bg-card/40 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                📂 Sessions
              </button>
            </div>

            {isIdle && (
              <SessionConfigure
                state={state}
                credits={credits}
                maxLitigants={maxLitigants}
                insufficientCredits={insufficientCredits}
                estimatedCredits={estimatedCredits}
                fieldValues={fieldValues}
                setFieldValues={setFieldValues}
                toolBanner={toolBanner}
                user={user}
                onSetQuestion={setQuestion}
                onSetTemplate={setTemplate}
                onSetConfig={setConfig}
                onRun={handleRun}
                onOpenConfig={() => setConfigOpen(true)}
                onOpenTemplates={() => setTemplateSheetOpen(true)}
                onAddLitigant={handleAddLitigant}
                onRemoveLitigant={handleRemoveLitigant}
                onSeatClick={handleSeatClick}
                onClearToolBanner={() => setToolBanner(null)}
                addCaseFile={addCaseFile}
                removeCaseFile={removeCaseFile}
              />
            )}
            {!isIdle && (
              <SessionCourt
                state={state}
                credits={credits}
                estimatedCredits={estimatedCredits}

                insufficientCredits={insufficientCredits}
                feedbackGiven={feedbackGiven}
                rebuttalChallenge={rebuttalChallenge}
                setRebuttalChallenge={setRebuttalChallenge}
                fieldValues={fieldValues}
                setFieldValues={setFieldValues}
                isRunning={isRunning}
                isPaused={isPaused}
                isComplete={isComplete}
                isRelayNeeded={isRelayNeeded}
                isError={isError}
                onStop={handleStop}
                onContinue={continueSession}
                onAcceptPartial={acceptPartial}
                onReset={handleReset}
                onFeedback={handleFeedback}
                onCopyMarkdown={handleCopyMarkdown}
                onDownload={handleDownload}
                onExportPDF={handleExportPDF}
                onSubmitRebuttal={submitRebuttal}
                onSubmitRelay={submitRelay}
                onSetEndOfJobTap={setEndOfJobTap}
                onSetTemplate={setTemplate}
                onSetFieldValues={(v) => setFieldValues(v)}
                onRun={handleRun}
                onNavigate={navigate}
              />
            )}
          </div>

          {/* ── Right 40%: diagram (always visible) ── */}
          <div className="min-w-0">
            <SessionDiagram
              state={state}
              credits={credits}
              isIdle={isIdle}
              isRunning={isRunning}
              isComplete={isComplete}
              activityLogOpen={activityLogOpen}
              setActivityLogOpen={setActivityLogOpen}
              activityLogRef={activityLogRef}
              onSeatClick={handleSeatClick}
              onAddLitigant={handleAddLitigant}
              onRemoveLitigant={handleRemoveLitigant}
              onToggleConscience={() => setConfig({ conscience: !state.config.conscience })}
            />
          </div>

        </div>
      </div>

      {/* ── Dialogue box — full-width row (idle only) ── */}
      {isIdle && (
        <div className="row">
          <div className="layout__center">

            {/* Tool banner */}
            {toolBanner && (
              <div className="session-tool-banner">
                <LayoutTemplate style={{ width: 13, height: 13, color: "#7ab87a", flexShrink: 0 }} />
                <span className="session-tool-banner-text">Pre-loaded: <strong>{toolBanner}</strong></span>
                <button
                  onClick={() => { setTemplate(null); setToolBanner(null); }}
                  className="session-tool-banner-clear"
                  title="Start fresh instead"
                >✕</button>
              </div>
            )}

            {/* Input area */}
            <div className="flex flex-col gap-2 pt-1">
              {state.template ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-0.5">
                    <Gavel className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                    <span className="text-xs font-semibold text-primary/80">{state.template.title}</span>
                    <button
                      onClick={() => { setTemplate(null); setFieldValues({}); }}
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
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun(); }}
                        className="h-9 text-sm flex-1 focus-visible:ring-1 focus-visible:ring-primary/60"
                        style={{ background: "#0d1a0d", border: "1px solid #1d331d", color: "#eef7ee" }}
                      />
                    </div>
                  ))}
                  <button
                    onClick={handleRun}
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
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRun(); } }}
                    className="resize-none focus-visible:ring-1 focus-visible:ring-primary/60 text-sm leading-relaxed"
                    style={{ minHeight: 96, background: "#0d1a0d", border: "1px solid #1d331d", borderRadius: 12, color: "#eef7ee", padding: "12px 14px" }}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground/30 flex-1">Enter to run · Shift+Enter for new line</span>
                    <button
                      onClick={handleRun}
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
      )}

      {/* ── Template picker sheet ── */}
      <Sheet open={templateSheetOpen} onOpenChange={(o) => !o && setTemplateSheetOpen(false)}>
        <SheetContent side="bottom" className="h-[65vh] flex flex-col bg-[#0a160a] border-t border-white/8">
          <SheetHeader className="shrink-0 pb-3 border-b border-white/5">
            <SheetTitle className="text-sm flex items-center gap-2">
              Templates
            </SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-2 py-2 overflow-x-auto shrink-0 scrollbar-none">
            <button
              onClick={() => setActiveCategory("all")}
              className={cn(
                "text-[10px] px-2.5 py-1 rounded-full border transition-colors shrink-0",
                activeCategory === "all"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-white/10 text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "text-[10px] px-2.5 py-1 rounded-full border transition-colors shrink-0",
                  activeCategory === cat.id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-white/10 text-muted-foreground hover:text-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onClick={() => {
                    setTemplate(template);
                    setConfig(template.defaultConfig);
                    setTemplateSheetOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
