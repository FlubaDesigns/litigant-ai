import { Button } from "@/components/ui/button";

// Shared by the billing shortcuts and API-key editor.
export const KNOWN_PROVIDERS = [
  { id: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", billingUrl: "https://platform.openai.com/account/billing" },
  { id: "anthropic", label: "Anthropic (Claude)", keyUrl: "https://platform.claude.com/settings/keys", billingUrl: "https://platform.claude.com/settings/billing" },
  { id: "grok", label: "xAI Grok", keyUrl: "https://console.x.ai/team/default/api-keys", billingUrl: "https://console.x.ai/team/default/billing" },
  { id: "gemini", label: "Google Gemini", keyUrl: "https://aistudio.google.com/apikey", billingUrl: "https://aistudio.google.com/billing" },
];

export function AiBillingTab() {
  return <section aria-label="AI provider billing" className="space-y-4">
    <p className="text-sm text-muted-foreground">Add funds and manage spending in your provider account.</p>
    <div className="row layout__split-2">{KNOWN_PROVIDERS.map(provider =>
      <article key={provider.id} className="lgt-card lgt-card--compact space-y-4">
        <h3 className="text-lg font-semibold">{provider.label}</h3>
        <Button asChild className="w-full min-h-11"><a href={provider.billingUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${provider.label} billing`}>Billing / Add funds ↗</a></Button>
      </article>
    )}</div>
  </section>;
}
