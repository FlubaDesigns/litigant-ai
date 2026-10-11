export interface ModelIdentity {provider: string; model: string;}
export interface ModelProvenance {
  configured: ModelIdentity;
  completed: ModelIdentity[];
  attempted: ModelIdentity[];
}
function identities(value: unknown): ModelIdentity[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ModelIdentity => !!item && typeof item.provider === "string" && typeof item.model === "string")
    .map(({provider,model})=>({provider,model}));
}
function distinct(values: ModelIdentity[]): ModelIdentity[] {
  return [...new Map(values.map(value=>[JSON.stringify([value.provider,value.model]),value])).values()];
}
/** Preserve known completed calls across resumptions; legacy billing attempts never prove success. */
export function mergeModelProvenance(current: ModelProvenance, previous?: unknown) {
  const prior = previous && typeof previous === "object" ? previous as Partial<ModelProvenance> : {};
  const completed = distinct([...identities(prior.completed),...identities(current.completed)]);
  const attempted = distinct([...identities(prior.attempted),...identities(current.attempted)]);
  const providers = [...new Set(completed.map(value=>value.provider))];
  return {
    provider: providers.length === 1 ? providers[0]! : providers.length ? "mixed" : "none",
    model: completed.length ? [...new Set(completed.map(value=>value.model))].join(" + ") : "No completed model call",
    modelProvenance: {configured:current.configured,completed,attempted},
  };
}
