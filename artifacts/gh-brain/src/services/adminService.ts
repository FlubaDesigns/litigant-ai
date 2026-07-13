import { auth } from "@/lib/firebase";

const API_BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api-server/api";

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth?.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = await authHeaders();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

export interface AdminUser {
  id: string;
  email?: string;
  displayName?: string;
  plan?: string;
  creditBalance?: number;
  subscriptionStatus?: string;
  createdAt?: string;
  banned?: boolean;
  bannedReason?: string;
}

export interface AdminSession {
  id: string;
  userId?: string;
  title?: string;
  question?: string;
  status?: string;
  confidence?: number;
  creditsUsed?: number;
  templateId?: string;
  shared?: boolean;
  finalAnswer?: string;
  createdAt?: string;
}

export interface AdminTransaction {
  id: string;
  userId?: string;
  type?: string;
  amount?: number;
  balanceAfter?: number;
  source?: string;
  sessionId?: string;
  createdAt?: string;
}

export interface AdminStats {
  userCount: number;
  sessionCount: number;
  txCount: number;
  recentSessions: number;
}

export interface SessionTurn {
  id: string;
  role?: string;
  round?: number;
  content?: string;
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await adminFetch("/admin/stats");
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json();
}

export async function listAdminUsers(params?: {
  search?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ users: AdminUser[]; hasMore: boolean; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.cursor) q.set("cursor", params.cursor);
  const res = await adminFetch(`/admin/users?${q}`);
  if (!res.ok) throw new Error("Failed to load users");
  return res.json();
}

export async function getAdminUser(uid: string): Promise<{
  user: AdminUser;
  recentTransactions: AdminTransaction[];
  recentSessions: AdminSession[];
}> {
  const res = await adminFetch(`/admin/users/${uid}`);
  if (!res.ok) throw new Error("Failed to load user");
  return res.json();
}

export async function adjustUserCredits(
  uid: string,
  amount: number,
  reason: string
): Promise<{ newBalance: number }> {
  const res = await adminFetch(`/admin/users/${uid}/credits`, {
    method: "POST",
    body: JSON.stringify({ amount, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to adjust credits");
  }
  return res.json();
}

export async function banUser(
  uid: string,
  banned: boolean,
  reason?: string
): Promise<{ success: boolean; banned: boolean; authWarning?: string }> {
  const res = await adminFetch(`/admin/users/${uid}/ban`, {
    method: "POST",
    body: JSON.stringify({ banned, reason }),
  });
  if (!res.ok) throw new Error("Failed to update ban status");
  return res.json();
}

export async function listAdminSessions(params?: {
  userId?: string;
  templateId?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ sessions: AdminSession[]; hasMore: boolean; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (params?.userId) q.set("userId", params.userId);
  if (params?.templateId) q.set("templateId", params.templateId);
  if (params?.status) q.set("status", params.status);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.cursor) q.set("cursor", params.cursor);
  const res = await adminFetch(`/admin/sessions?${q}`);
  if (!res.ok) throw new Error("Failed to load sessions");
  return res.json();
}

export async function getAdminSession(
  id: string
): Promise<{ session: AdminSession; turns: SessionTurn[] }> {
  const res = await adminFetch(`/admin/sessions/${id}`);
  if (!res.ok) throw new Error("Failed to load session");
  return res.json();
}

export async function listAdminTransactions(params?: {
  userId?: string;
  type?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ transactions: AdminTransaction[]; hasMore: boolean; nextCursor: string | null }> {
  const q = new URLSearchParams();
  if (params?.userId) q.set("userId", params.userId);
  if (params?.type) q.set("type", params.type);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.cursor) q.set("cursor", params.cursor);
  const res = await adminFetch(`/admin/transactions?${q}`);
  if (!res.ok) throw new Error("Failed to load transactions");
  return res.json();
}

export async function issueRefund(
  userId: string,
  amount: number,
  reason: string
): Promise<{ newBalance: number }> {
  const res = await adminFetch("/admin/credits/refund", {
    method: "POST",
    body: JSON.stringify({ userId, amount, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to issue refund");
  }
  return res.json();
}

export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  const res = await fetch(`${API_BASE}/feature-flags`);
  if (!res.ok) return {};
  const data = await res.json();
  return data.flags ?? {};
}

export async function setFeatureFlag(name: string, value: boolean | string): Promise<void> {
  const res = await adminFetch(`/admin/feature-flags/${name}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error("Failed to update feature flag");
}

export interface ChecklistItem {
  id: string;
  section: "agent" | "owner";
  text: string;
  note?: string;
  steps?: string[];
  checked: boolean;
}

export async function getChecklist(): Promise<ChecklistItem[]> {
  const res = await adminFetch("/admin/checklist");
  if (!res.ok) throw new Error("Failed to load checklist");
  const data = await res.json();
  return data.items ?? [];
}

export async function setChecklistItemChecked(id: string, checked: boolean): Promise<void> {
  const res = await adminFetch(`/admin/checklist/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ checked }),
  });
  if (!res.ok) throw new Error("Failed to update checklist item");
}

export async function getAdminLimits(): Promise<Record<string, number>> {
  const res = await fetch(`${API_BASE}/limits`);
  if (!res.ok) return { maxLitigants: 10 };
  const data = await res.json();
  return data.limits ?? { maxLitigants: 10 };
}

export async function setAdminLimit(name: string, value: number): Promise<void> {
  const res = await adminFetch(`/admin/limits/${name}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to update limit");
  }
}

// ── Credit Packs ───────────────────────────────────────────────────────────────

export interface AdminCreditPackPrice {
  id: string;
  product: string;
  unit_amount: number;
  currency: string;
  recurring: null;
  active: boolean;
  metadata: { creditAmount: string; [k: string]: string };
}

export interface AdminCreditPack {
  id: string;
  name: string;
  description: string;
  active: boolean;
  metadata: { type: string; creditAmount: string; [k: string]: string };
  prices: AdminCreditPackPrice[];
}

export interface CreditPackBounds {
  MIN_UNIT_AMOUNT_CENTS: number;
  MAX_UNIT_AMOUNT_CENTS: number;
  MIN_CREDIT_AMOUNT: number;
  MAX_CREDIT_AMOUNT: number;
}

export async function getCreditPacks(): Promise<{ packs: AdminCreditPack[]; bounds: CreditPackBounds }> {
  const res = await adminFetch("/admin/credit-packs");
  if (!res.ok) throw new Error("Failed to load credit packs");
  return res.json();
}

export async function createCreditPack(input: {
  id: string;
  name: string;
  description?: string;
  unitAmountCents: number;
  creditAmount: number;
}): Promise<void> {
  const res = await adminFetch("/admin/credit-packs", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to create credit pack");
  }
}

export async function updateCreditPack(
  id: string,
  updates: {
    name?: string;
    description?: string;
    active?: boolean;
    unitAmountCents?: number;
    creditAmount?: number;
  }
): Promise<AdminCreditPack> {
  const res = await adminFetch(`/admin/credit-packs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to update credit pack");
  }
  return res.json().then((r: any) => r.pack);
}

export async function deactivateCreditPack(id: string): Promise<void> {
  const res = await adminFetch(`/admin/credit-packs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to deactivate credit pack");
}

export async function updateAdminTemplate(
  id: string,
  data: {
    title?: string;
    description?: string;
    isActive?: boolean;
    systemPrompt?: string;
    defaultSettings?: Record<string, unknown>;
  }
): Promise<void> {
  const res = await adminFetch(`/admin/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update template");
}

export interface SystemHealth {
  status: string;
  serverTime?: string;
  collections?: Record<string, number>;
  last24h?: Record<string, number>;
  last7d?: Record<string, number | string>;
}

export interface ApiUsageDay {
  date: string;
  sessions: number;
  creditsUsed: number;
}

export interface AbuseFlag {
  id: string;
  userId?: string;
  sessionId?: string;
  turnId?: string;
  role?: string;
  rating?: string;
  reason?: string;
  notes?: string;
  createdAt?: string;
}

export interface ErrorLogEntry {
  id: string;
  status?: string;
  message?: string;
  model?: string;
  userId?: string;
  sessionId?: string;
  _type?: string;
  title?: string;
  question?: string;
  createdAt?: string;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const res = await adminFetch("/admin/system-health");
  if (!res.ok) throw new Error("Failed to load system health");
  return res.json();
}

export async function getApiUsage(): Promise<{
  byDay: ApiUsageDay[];
  totalSessions: number;
  totalCreditsUsed: number;
  apiLogs: Record<string, unknown>[];
}> {
  const res = await adminFetch("/admin/api-usage");
  if (!res.ok) throw new Error("Failed to load API usage");
  return res.json();
}

export async function getErrorLogs(): Promise<{
  logs: ErrorLogEntry[];
  failedSessions: ErrorLogEntry[];
}> {
  const res = await adminFetch("/admin/error-logs");
  if (!res.ok) throw new Error("Failed to load error logs");
  return res.json();
}

export async function getAbuseFlags(): Promise<{
  flags: AbuseFlag[];
  totalCount: number;
}> {
  const res = await adminFetch("/admin/abuse-flags");
  if (!res.ok) throw new Error("Failed to load abuse flags");
  return res.json();
}

export async function setAdminClaim(
  secret: string,
  opts: { email?: string; uid?: string }
): Promise<{ success: boolean; uid?: string; email?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/admin/set-claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, ...opts }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to set admin claim");
  }
  return res.json();
}

export async function listAdminTemplates(): Promise<any[]> {
  const res = await adminFetch("/admin/templates");
  if (!res.ok) return [];
  const data = await res.json();
  return data.templates ?? [];
}

// ── Pricing ───────────────────────────────────────────────────────────────────

export interface PricingModel {
  model: string;
  provider: string;
  label: string;
  inputRatePer1k: number;
  outputRatePer1k: number;
  defaultMultiplier: number;
  effectiveMultiplier: number;
  isOverridden: boolean;
  exampleCostUsd: number;
  exampleCredits: number;
}

export interface PricingConfig {
  creditValueUsd: number;
  models: PricingModel[];
}

export async function getPricingConfig(): Promise<PricingConfig> {
  const res = await adminFetch("/admin/pricing");
  if (!res.ok) throw new Error("Failed to load pricing config");
  return res.json();
}

export async function updateModelMultiplier(
  model: string,
  multiplier: number
): Promise<void> {
  const res = await adminFetch(`/admin/pricing/${encodeURIComponent(model)}`, {
    method: "PUT",
    body: JSON.stringify({ multiplier }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to update multiplier");
  }
}

export async function resetModelMultiplier(model: string): Promise<void> {
  const res = await adminFetch(`/admin/pricing/${encodeURIComponent(model)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to reset multiplier");
}

// ── API Key Management ────────────────────────────────────────────────────────

export interface ProviderKeyInfo {
  id: string;
  label: string;
  maskedKey: string;
  baseUrl?: string;
  source: "firestore" | "env";
  updatedAt?: string;
}

export async function getApiKeys(): Promise<ProviderKeyInfo[]> {
  const res = await adminFetch("/admin/api-keys");
  if (!res.ok) throw new Error("Failed to load API keys");
  const data = await res.json();
  return data.providers as ProviderKeyInfo[];
}

export async function saveApiKey(
  providerId: string,
  key: string,
  label: string,
  baseUrl?: string
): Promise<void> {
  const res = await adminFetch(`/admin/api-keys/${encodeURIComponent(providerId)}`, {
    method: "PUT",
    body: JSON.stringify({ key, label, baseUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to save API key");
  }
}

export async function deleteApiKey(providerId: string): Promise<void> {
  const res = await adminFetch(`/admin/api-keys/${encodeURIComponent(providerId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete API key");
}

export interface BillingDefaults {
  autoRefillAmounts: number[];
  defaultAutoRefillAmount: number;
  defaultThresholdCredits: number;
  defaultWarningThresholdCredits: number;
  signupBonusCredits: number;
}

export interface AiStudioModel {
  id: string;
  label: string;
  provider: string;
  providerLabel: string;
  inputRatePer1k: number;
  outputRatePer1k: number;
  multiplier: number;
  userInputPer1k: number;
  userOutputPer1k: number;
  exampleCredits: number;
  enabled: boolean;
  custom: boolean;
  /** 0–100 quality score used by the intelligence slider */
  qualityScore?: number;
}

export interface AiStudioCustomModel {
  id: string;
  label: string;
  inputRatePer1k: number;
  outputRatePer1k: number;
  multiplier: number;
}

export interface AiStudioCustomProvider {
  id: string;
  label: string;
  models: AiStudioCustomModel[];
}

export interface AiStudioData {
  models: AiStudioModel[];
  disabledProviders: string[];
  customProviders: AiStudioCustomProvider[];
}

export async function getAiStudioModels(): Promise<AiStudioData> {
  const res = await adminFetch("/admin/ai-studio/models");
  if (!res.ok) throw new Error("Failed to load AI Studio models");
  return res.json() as Promise<AiStudioData>;
}

export async function toggleAiStudioModel(modelId: string, enabled: boolean): Promise<void> {
  const res = await adminFetch(`/admin/ai-studio/models/${encodeURIComponent(modelId)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to update model");
  }
}

export async function toggleAiStudioProvider(providerId: string, enabled: boolean): Promise<void> {
  const res = await adminFetch(`/admin/ai-studio/providers/${encodeURIComponent(providerId)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to update provider");
  }
}

export async function addAiStudioProvider(provider: AiStudioCustomProvider): Promise<void> {
  const res = await adminFetch("/admin/ai-studio/providers", {
    method: "POST",
    body: JSON.stringify(provider),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to add provider");
  }
}

export async function setModelQualityScore(modelId: string, qualityScore: number): Promise<void> {
  const res = await adminFetch(`/admin/model-scores/${encodeURIComponent(modelId)}`, {
    method: "PATCH",
    body: JSON.stringify({ qualityScore }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to update quality score");
  }
}

export async function deleteAiStudioProvider(providerId: string): Promise<void> {
  const res = await adminFetch(`/admin/ai-studio/providers/${encodeURIComponent(providerId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to delete provider");
  }
}

export async function getAdminBillingDefaults(): Promise<BillingDefaults> {
  const res = await adminFetch("/admin/billing-defaults");
  if (!res.ok) throw new Error("Failed to load billing defaults");
  return res.json();
}

export async function saveAdminBillingDefaults(
  updates: Partial<BillingDefaults>
): Promise<BillingDefaults> {
  const res = await adminFetch("/admin/billing-defaults", {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? "Failed to save billing defaults");
  }
  return res.json();
}

