import type { CourtConfig } from "@/data/templates";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api-server/api";

function getApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export interface BrainRunRequest {
  question: string;
  config: CourtConfig;
  templateId?: string;
  sessionId?: string;
  idToken?: string;
}

export type SSEEventType =
  | "start"
  | "role_start"
  | "content"
  | "role_end"
  | "confidence_update"
  | "round_start"
  | "round_end"
  | "done"
  | "error";

export interface SSEEvent {
  type: SSEEventType;
  role?: string;
  roleIndex?: number;
  round?: number;
  content?: string;
  fullContent?: string;
  confidence?: number;
  creditsUsed?: number;
  sessionId?: string;
  estimatedCredits?: number;
  finalAnswer?: string;
  debateNotes?: string;
  transcript?: string;
  caveats?: string;
  artifacts?: string;
  message?: string;
  guestLimitReached?: boolean;
}

export function runBrainSession(
  request: BrainRunRequest,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (request.idToken) {
        headers["Authorization"] = `Bearer ${request.idToken}`;
      }

      const response = await fetch(getApiUrl("/run-brain"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: request.question,
          config: request.config,
          templateId: request.templateId,
          sessionId: request.sessionId,
        }),
        signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Request failed" }));
        reject(new Error((err as any).message || `HTTP ${response.status}`));
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const raw = line.slice(6).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const event = JSON.parse(raw) as SSEEvent;
              onEvent(event);
              if (event.type === "done" || event.type === "error") {
                resolve();
                return;
              }
            } catch {
              // skip malformed
            }
          }
        }
      }

      resolve();
    } catch (err) {
      if ((err as any)?.name === "AbortError") {
        resolve();
      } else {
        reject(err);
      }
    }
  });
}

export interface SavedSession {
  id: string;
  title: string;
  question: string;
  templateId: string | null;
  confidence: number;
  creditsUsed: number;
  status: "complete" | "incomplete" | "error";
  starred?: boolean;
  archived?: boolean;
  shared?: boolean;
  shareId?: string;
  createdAt: string;
  updatedAt: string;
  finalAnswer?: string;
  debateNotes?: string;
  transcript?: string;
  caveats?: string;
  artifacts?: string;
}

export interface SessionsPage {
  sessions: SavedSession[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function getSessions(
  idToken?: string,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<SessionsPage> {
  const headers: Record<string, string> = {};
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(getApiUrl(`/sessions${qs}`), { headers });
  if (!res.ok) throw new Error("Failed to fetch sessions");
  // Handle both new paginated format {sessions,hasMore,nextCursor} and legacy plain array
  const data = await res.json();
  if (Array.isArray(data)) {
    return { sessions: data, hasMore: false, nextCursor: null };
  }
  return data as SessionsPage;
}

export async function deleteAccount(idToken?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const res = await fetch(getApiUrl("/account"), { method: "DELETE", headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Delete account failed (${res.status})`);
  }
}

export async function getSession(id: string, idToken?: string): Promise<SavedSession> {
  const headers: Record<string, string> = {};
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const res = await fetch(getApiUrl(`/sessions/${id}`), { headers });
  if (!res.ok) throw new Error("Session not found");
  return res.json();
}

export async function updateSession(
  id: string,
  data: { title?: string; starred?: boolean; archived?: boolean; shared?: boolean; shareId?: string },
  idToken?: string
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const res = await fetch(getApiUrl(`/sessions/${id}`), {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Update session failed (${res.status})`);
  }
}

export async function deleteSession(id: string, idToken?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
  const res = await fetch(getApiUrl(`/sessions/${id}`), { method: "DELETE", headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Delete session failed (${res.status})`);
  }
}

/** Fetch every session page by cursor until exhausted. Use for exports. */
export async function getAllSessions(idToken?: string): Promise<SavedSession[]> {
  const all: SavedSession[] = [];
  let cursor: string | null = null;
  do {
    const page = await getSessions(idToken, { limit: 100, cursor });
    all.push(...page.sessions);
    cursor = page.hasMore ? page.nextCursor : null;
  } while (cursor);
  return all;
}

export async function generateShareLink(id: string, idToken?: string): Promise<string> {
  const shareId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  await updateSession(id, { shared: true, shareId }, idToken);
  return `${window.location.origin}/report/${shareId}`;
}

export function exportSessionAsMarkdown(session: SavedSession): string {
  const lines = [
    `# AI Brain Session — ${session.title}`,
    ``,
    `**Question:** ${session.question}`,
    session.templateId ? `**Template:** ${session.templateId}` : null,
    `**Confidence:** ${session.confidence}%`,
    `**Credits Used:** ${session.creditsUsed}`,
    `**Date:** ${new Date(session.createdAt).toLocaleDateString()}`,
    `**Status:** ${session.status}`,
    ``,
    `---`,
    ``,
    `## Final Answer`,
    ``,
    session.finalAnswer || "_No final answer generated._",
    ``,
    session.artifacts
      ? [`---`, ``, `## Artifacts`, ``, session.artifacts, ``].join("\n")
      : null,
    `---`,
    ``,
    `## Debate Notes`,
    ``,
    session.debateNotes || "_No debate notes._",
    ``,
    `---`,
    ``,
    `## Sources & Caveats`,
    ``,
    session.caveats || "_No caveats._",
    ``,
    `---`,
    ``,
    `_Generated by AI Brain — Don't just ask AI. Put the question on trial._`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}
