import { PAID_ACCESS_NOTE } from "@workspace/api-zod/session";
import { useState } from "react";
import { Link } from "wouter";
import { CourtConfigSchema } from "@workspace/api-zod/session";
import { useProviders, useCreditPacks } from "@/hooks/useConfiguration";
import { useSessionQuote } from "@/hooks/useSessionQuote";

/** Public pack estimates use the same catalog and quote endpoint as checkout and the court. */
export function LandingPricing({isSignedIn, signupBonus}: {isSignedIn:boolean; signupBonus:number | null}) {
  const {data:catalog} = useProviders();
  const {data:products = [], isPending:loadingPacks} = useCreditPacks();
  const [selection, setSelection] = useState("");
  const models = catalog?.providers.flatMap(provider => provider.models.map(model => ({
    ...model, provider:provider.name, providerLabel:provider.displayName,
  }))) ?? [];
  const defaultProvider = catalog?.providers[0];
  const selected = models.find(model => model.id === selection)
    ?? models.find(model => model.provider === defaultProvider?.name && model.id === defaultProvider.defaultModel)
    ?? models[0];
  const config = CourtConfigSchema.parse({
    provider:selected?.provider, model:selected?.id,
    litigantCount:3, maxIterations:2, responseMode:"balanced", maxCredits:100000,
  });
  const quote = useSessionQuote(config, !!selected);
  const sessionCredits = selected && quote.ready ? quote.data?.estimatedCredits : undefined;
  const plans = [
    {id:"trial", name:"Trial", price:"Free", credits:signupBonus, free:true},
    ...products.filter(product => product.active && product.metadata?.type === "credit_pack").flatMap(product => {
      const price = product.prices.find(price => price.active && !price.recurring && price.unit_amount !== null);
      const credits = Number(price?.metadata?.creditAmount ?? product.metadata.creditAmount);
      if (!price || !Number.isFinite(credits) || credits <= 0) return [];
      return [{id:product.id, name:product.name,
        price:new Intl.NumberFormat("en-US", {style:"currency", currency:price.currency}).format(price.unit_amount! / 100),
        credits, free:false}];
    }),
  ];

  return (
    <section id="pricing" className="section border-t border-white/[0.06]">
      <div className="row"><div className="max-w-3xl">
        <p className="text-xs font-mono text-amber-500/60 tracking-widest mb-3 uppercase">Pricing</p>
        <h2 className="font-['Playfair_Display'] text-3xl font-semibold text-white">Open a Case</h2>
        <p className="text-zinc-400 mt-3 text-sm">Credits never expire. No subscriptions or seat fees — pay for what you use.</p>
        <p className="text-zinc-400 mt-3 text-sm">{PAID_ACCESS_NOTE}</p>
        <div className="mt-5 space-y-2">
          <label htmlFor="pricing-model" className="block text-sm text-zinc-300">Model for session estimate</label>
          <select id="pricing-model" value={selected?.id ?? ""} onChange={event => setSelection(event.target.value)}
            disabled={!models.length} className="w-full max-w-md min-h-11 rounded border border-white/20 bg-zinc-950 px-3 text-sm text-white">
            {!models.length && <option value="">Models unavailable</option>}
            {models.map(model => <option key={model.id} value={model.id}>{model.providerLabel} — {model.label}</option>)}
          </select>
          <p className="text-sm text-zinc-400">Example court: 3 litigants · 2 rounds · Balanced responses.</p>
          <p className="text-sm text-zinc-300" aria-live="polite">
            {sessionCredits && sessionCredits > 0 ? `Estimated ${sessionCredits.toLocaleString()} credits per session.` : "Session estimate unavailable — check your court settings before starting."}
          </p>
          <p className="text-xs text-zinc-400">These are estimates, not guaranteed session counts. Actual use depends on your question, model, rounds, and output. Your own court shows its estimate before you start.</p>
        </div>
      </div></div>
      <div className="row">
        <div className="layout__split-4">
          {plans.map(plan => {
            const count = plan.credits !== null && sessionCredits && sessionCredits > 0 ? Math.floor(plan.credits / sessionCredits) : null;
            return (
              <div key={plan.id} data-testid={`pricing-${plan.id}`} className="border border-white/[0.08] p-6 flex flex-col">
                <div className="mb-4">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-2">{plan.name}</div>
                  <div className="text-3xl font-bold text-white">{plan.price}</div>
                  <div className="text-xs text-zinc-400 font-mono mt-1">{plan.credits === null ? "Signup offer unavailable" : `${plan.credits.toLocaleString()} credits${plan.free ? " on signup" : ""}`}</div>
                </div>
                <p className="text-sm text-zinc-300 mb-4" data-testid="session-count">
                  {count === null ? "Session estimate unavailable" : count === 0 ? "Below the estimated cost of one session at these settings" : `About ${count.toLocaleString()} ${count === 1 ? "session" : "sessions"} at these settings`}
                </p>
                <ul className="space-y-2 flex-1 mb-5 text-xs text-zinc-400">
                  <li>{plan.free ? "No card required" : "Credits never expire"}</li>
                  <li>Full access to the courtroom</li>
                  <li>Session history and exports</li>
                </ul>
                <Link href={isSignedIn ? "/billing" : "/register"}>
                  <button className="w-full min-h-11 text-xs font-medium border border-white/20 text-white hover:border-white/40">
                    {isSignedIn ? (plan.free ? "Go to Billing" : "Buy Credits") : (plan.free ? "Start Free" : "Get Started")}
                  </button>
                </Link>
              </div>
            );
          })}
        </div>
        {plans.length === 1 && <p className="text-sm text-zinc-400 mt-4">{loadingPacks ? "Loading credit packs…" : "Credit packs are unavailable right now. Check Billing before purchasing."}</p>}
      </div>
    </section>
  );
}
