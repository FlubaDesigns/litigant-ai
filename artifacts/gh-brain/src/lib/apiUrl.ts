export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api-server/api";

export function getApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
