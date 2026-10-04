import { describe, it, expect } from "vitest";
import { CourtConfigSchema, restoreCourtConfig, RESPONSE_VIEWS } from "@workspace/api-zod/session";
import { sessionOutput } from "./sessionOutput";
import { buildMarkdown, buildText, exportPDF, type SessionState } from "./sessionExport";

const sample = {
  config: CourtConfigSchema.parse({}), question: "Question", template:null,
  confidence: 85, creditsUsed: 20, finalAnswer: "CONSENSUS_RESULT",
  debateNotes: "INDIVIDUAL_ARGUMENTS", transcript: "ENTIRE_RECORD",
  artifacts: "BUILT_DOCUMENT", caveats: "SOURCE_LIMITATIONS", runtimeFeed: [],
} as unknown as SessionState;

describe("one configured output for display and downloads", () => {
  it.each([
    ["moderator-consensus", "CONSENSUS_RESULT", "INDIVIDUAL_ARGUMENTS"],
    ["individual", "INDIVIDUAL_ARGUMENTS", "CONSENSUS_RESULT"],
    ["consensus+individual", "CONSENSUS_RESULT", "ENTIRE_RECORD"],
    ["transcript", "ENTIRE_RECORD", "INDIVIDUAL_ARGUMENTS"],
    ["artifact", "BUILT_DOCUMENT", "CONSENSUS_RESULT"],
  ] as const)("%s uses the saved configuration without needing a live feed", (strategy, included, excluded) => {
    const state = {...sample, config:CourtConfigSchema.parse({...sample.config, outputStrategy:strategy})};
    const output = sessionOutput(state);
    expect(output.title).toBe(RESPONSE_VIEWS[strategy]);
    expect(output.content).toContain(included);
    expect(output.content).not.toContain(excluded);
    if(strategy === "consensus+individual") expect(output.content).toContain("INDIVIDUAL_ARGUMENTS");
    expect(buildMarkdown(state)).toContain(output.content);
    expect(buildText(state)).toContain(output.content);
    expect(buildMarkdown(state)).not.toContain(excluded);
    expect(buildMarkdown(state)).toContain("SOURCE_LIMITATIONS");
    let html = "";
    exportPDF(state, {document:{write:(value:string)=> {html=value;},close:()=>{}},focus:()=>{},print:()=>{}} as unknown as Window);
    expect(html).toContain(included);
    expect(html).not.toContain(excluded);
  });
  it("preserves code and formulas verbatim in text downloads", () => {
    const code = "# Notes\nresult_value = price * count\n`reference_id`";
    expect(buildText({...sample,finalAnswer:code})).toContain(code);
  });
  it("normalizes overlapping saved controls and removes obsolete fields", () => {
    const config = CourtConfigSchema.parse({outputScope:"all-voices",outputStrategy:"moderator-consensus",outputPreference:"both",artifactType:"none"});
    expect(config.outputStrategy).toBe("consensus+individual");
    expect(config.outputPreferenceMode).toBe("answer-only");
    expect(config).not.toHaveProperty("outputScope");
    expect(config).not.toHaveProperty("outputPreference");
    expect(CourtConfigSchema.parse({...config,outputPreferenceMode:"document"}).artifactType).toBe("auto");
    expect(CourtConfigSchema.parse({...config,artifactType:"report"}).artifactType).toBe("none");
  });
  it("repairs the formerly offered 25-round preference without allowing new invalid requests", () => {
    expect(restoreCourtConfig({maxIterations:25,outputStrategy:"individual"}).maxIterations).toBe(20);
    expect(CourtConfigSchema.safeParse({maxIterations:25}).success).toBe(false);
  });
  it("does not substitute pipeline voices for individual arguments", () => {
    const state={...sample, config:CourtConfigSchema.parse({outputStrategy:"individual"}), debateNotes:"",runtimeFeed:[
      {role:"Advocate",content:"Individual evidence",round:1},
      {role:"Builder (Correction)",content:"Internal build",round:99},
    ]};
    expect(sessionOutput(state).content).toContain("Individual evidence");
    expect(sessionOutput(state).content).not.toContain("Internal build");
  });
});
