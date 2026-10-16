/** Human-reviewed seat rubrics. Scores describe this sample only, never probability of correctness. */
import { z } from "zod";
export const RUBRIC_VERSION = "2026-10-16";
export interface LitmusTestDefinition {
  seatId: string;
  label: string;
  /** The standard test prompt fed to this seat. */
  testPrompt: string;
  /** Criteria the response must satisfy to pass. */
  passCriteria: string[];
  /** Criteria that constitute an automatic fail. */
  failCriteria: string[];

}

export const LITMUS_TESTS: Record<string, LitmusTestDefinition> = {
  orchestrator: {
    seatId: "orchestrator",
    label: "Orchestrator",
    testPrompt:
      "Frame the following question for a courtroom deliberation, then deliver a closing verdict based on this mock finding: 'The evidence strongly favours Option A.' Question: Should a startup prioritise growth over profitability in its first two years?",
    passCriteria: [
      "Frames the question as a clear contested proposition in ≤4 sentences",
      "Does not express a personal opinion during framing",
      "Verdict leads with a direct plain-language answer",
      "Verdict summarises key reasons in 2–3 sentences",
      "Ends with a save prompt",
    ],
    failCriteria: [
      "Takes a side during the framing phase",
      "Buries the verdict conclusion",
      "Apologises for the verdict",
      "Exceeds 4 sentences in the framing phase",
    ],
  },

  moderator: {
    seatId: "moderator",
    label: "Moderator",
    testPrompt:
      "You have received the following litigant arguments. Produce a structured deliberation summary identifying: (a) points of consensus, (b) genuine disagreements, (c) the strongest argument on each side, (d) logical gaps. Arguments: [A] Growth enables market capture before competitors. [B] Profitability ensures survival and reduces investor dependency.",
    passCriteria: [
      "Identifies at least one point of consensus",
      "Identifies at least one genuine disagreement",
      "Names the strongest argument for each side",
      "Flags at least one logical gap or unsupported claim",
      "Does not inject a personal opinion or declare a winner",
      "Output is scannable with clear section headings",
    ],
    failCriteria: [
      "Declares one side the winner",
      "Injects personal opinion",
      "Produces a single paragraph with no structure",
    ],
  },

  auditor: {
    seatId: "auditor",
    label: "Auditor",
    testPrompt:
      "Review the following artifact for logical consistency, unsupported claims, and missing caveats. Output APPROVED or RETURNED with a corrected version if needed. Artifact: 'Companies that prioritise growth always outperform those that focus on profitability. Therefore, all startups should avoid profitability for at least five years.'",
    passCriteria: [
      "Identifies 'always' as an unsupported absolute claim",
      "Flags the five-year figure as an unsupported assertion",
      "Outputs RETURNED with a fully corrected artifact",
      "Corrected artifact does not contain the original unsupported claims",
      "Does not output revision instructions directed at a Builder",
    ],
    failCriteria: [
      "Outputs APPROVED for the flawed artifact",
      "Outputs revision instructions instead of a corrected artifact",
      "Misses the unsupported absolute 'always'",
    ],
  },

  architect: {
    seatId: "architect",
    label: "Architect",
    testPrompt:
      "Based on the following deliberation summary, produce a blueprint for a business-plan artifact. Specify: format, required sections, audience, and scope. Summary: The court found strong evidence for a growth-first approach in high-competition markets, with a caveat that runway must exceed 18 months.",
    passCriteria: [
      "Specifies a clear format (e.g. report, memo)",
      "Lists all required sections explicitly",
      "Defines the target audience",
      "Scope includes the 18-month runway caveat",
      "Does not build the artifact itself",
    ],
    failCriteria: [
      "Produces the full artifact instead of just a blueprint",
      "Omits the 18-month caveat from scope",
      "Does not specify a format",
    ],
  },

  builder: {
    seatId: "builder",
    label: "Builder",
    testPrompt:
      "Build a business-plan artifact following this blueprint. Blueprint: Format=memo, Sections=[Executive Summary, Market Opportunity, Growth Strategy, Financial Runway], Audience=seed-stage investors, Scope=growth-first approach with 18-month runway caveat.",
    passCriteria: [
      "Contains all four specified sections",
      "Format matches memo style",
      "Includes the 18-month runway caveat",
      "Appropriate tone for seed-stage investors",
      "Does not include sections not in the blueprint",
    ],
    failCriteria: [
      "Missing one or more required sections",
      "Omits the runway caveat",
      "Wrong audience tone (e.g. too casual or too technical)",
    ],
  },

  litigant: {
    seatId: "litigant",
    label: "Litigant",
    testPrompt:
      "Argue the following position in a structured courtroom debate. Your position: Growth-first strategies are superior for early-stage startups. Respond to this opposing argument: 'Profitability ensures survival — a company that runs out of cash cannot pursue growth.'",
    passCriteria: [
      "Directly addresses the opposing argument",
      "Provides at least one piece of supporting evidence or reasoning",
      "Maintains the assigned position (does not concede the core claim)",
      "Identifies a logical weakness in the opposing argument",
    ],
    failCriteria: [
      "Concedes the assigned position",
      "Ignores the opposing argument entirely",
      "Provides no supporting reasoning",
    ],
  },
};

const Judgment = z.object({met: z.boolean(), evidence: z.string().trim().min(1).max(2000)}).strict();
export const SeatReviewSchema = z.object({
  seatId: z.string().refine(id => Object.hasOwn(LITMUS_TESTS, id)),
  model: z.string().trim().min(1).max(200),
  response: z.string().trim().min(1).max(50000),
  source: z.string().trim().min(1).max(1000),
  pass: z.array(Judgment).max(20), fail: z.array(Judgment).max(20),
}).strict();
export type SeatReview = z.infer<typeof SeatReviewSchema>;
export function evaluateSeatReview(input: unknown) {
  const review = SeatReviewSchema.parse(input);
  const rubric = LITMUS_TESTS[review.seatId];
  if (review.pass.length !== rubric.passCriteria.length || review.fail.length !== rubric.failCriteria.length) {
    throw new Error("Assess every criterion and provide evidence before scoring.");
  }
  const automaticFailure = review.fail.some(item => item.met);
  const score = automaticFailure ? 0 : Math.round(100 * review.pass.filter(item => item.met).length / rubric.passCriteria.length);
  return {...review, rubricVersion:RUBRIC_VERSION, score, passed:!automaticFailure && review.pass.every(item => item.met),
    assessmentType:"human-reviewed-sample" as const, calibrated:false as const};
}
