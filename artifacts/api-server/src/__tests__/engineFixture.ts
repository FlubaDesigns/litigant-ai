import { runBrainSession as runEngine, type BrainRunOptions } from "../lib/brainEngine.js";

// Unit fixtures use deterministic pricing; production receives a reserved rate snapshot.
// Billing integration tests exercise real rates and settlement at the route boundary.
export function runBrainSession(opts: Omit<BrainRunOptions, "priceCalls" | "estimatedCredits"> & Partial<Pick<BrainRunOptions, "priceCalls" | "estimatedCredits">>) {
  return runEngine({ estimatedCredits: 1, priceCalls: () => 1, ...opts });
}
