import { z } from "zod";

export const SATISFACTION_QUESTIONS = [
  {id:"answered", label:"How well did the answer address your question?", low:"Not at all", high:"Completely"},
  {id:"satisfied", label:"How satisfied are you with the answer?", low:"Very dissatisfied", high:"Very satisfied"},
  {id:"reuse", label:"How likely are you to use Litigant again?", low:"Very unlikely", high:"Very likely"},
] as const;
const rating = z.number().int().min(1).max(5);
export const SatisfactionRatingsSchema = z.object({answered:rating, satisfied:rating, reuse:rating}).strict();
export type SatisfactionRatings = z.infer<typeof SatisfactionRatingsSchema>;
export const SatisfactionSubmissionSchema = SatisfactionRatingsSchema.extend({
  kind:z.literal("satisfaction"), version:z.literal(1),
  sessionId:z.string().min(1).max(200).regex(/^[^/]+$/),
  userId:z.string().min(1).max(200).nullable().optional(),
}).strict();
export interface SatisfactionSummary {
  count:number;
  overall:number|null;
  averages:Record<keyof SatisfactionRatings,number|null>;
}
