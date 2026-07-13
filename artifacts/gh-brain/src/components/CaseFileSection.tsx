import { useState, useRef } from "react";
import { Paperclip, Link2, Upload, X, FileText, Globe, Loader2 } from "lucide-react";
import { getApiUrl } from "@/lib/apiUrl";
import type { CaseFileItem } from "@/hooks/useBrainSession";

interface Props {
  items: CaseFileItem[];
  onAdd: (item: CaseFileItem) => void;
  onRemove: (id: string) => void;
  getIdToken?: () => Promise<string | undefined>;
}

function uid() {
  return `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function CaseFileSection({ items, onAdd, onRemove, getIdToken }: Props) {
  const [mode, setMode] = useState<"idle" | "url" | "file">("idle");
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getIdToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function handleAddUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const hdrs = await authHeaders();
      const res = await fetch(getApiUrl("/case-file/fetch-url"), {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch URL");
      onAdd({ id: uid(), type: "url", name: data.title || url, content: data.content, url });
      setUrlInput("");
      setMode("idle");
    } catch (e: any) {
      setError(e.message || "Could not fetch URL");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const hdrs = await authHeaders();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(getApiUrl("/case-file/upload"), {
        method: "POST",
        headers: hdrs,
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      onAdd({ id: uid(), type: "file", name: data.name || file.name, content: data.content });
      setMode("idle");
    } catch (e: any) {
      setError(e.message || "Could not extract file");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Existing items */}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: "rgba(0,200,83,.06)",
                border: "1px solid rgba(0,200,83,.2)",
                borderRadius: 8,
              }}
            >
              {item.type === "url" ? (
                <Globe style={{ width: 13, height: 13, color: "#39f70a", flexShrink: 0 }} />
              ) : (
                <FileText style={{ width: 13, height: 13, color: "#39f70a", flexShrink: 0 }} />
              )}
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: "#9aaa9a",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={item.name}
              >
                {item.name}
              </span>
              <span style={{ fontSize: 10, color: "#3a5a3a", flexShrink: 0 }}>
                {Math.round(item.content.length / 1000)}k chars
              </span>
              <button
                onClick={() => onRemove(item.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 2,
                  cursor: "pointer",
                  color: "#3a5a3a",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
                title="Remove"
              >
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: "#c84040", padding: "4px 8px", background: "rgba(200,64,64,.07)", borderRadius: 6, border: "1px solid rgba(200,64,64,.2)" }}>
          {error}
        </div>
      )}

      {/* URL input row */}
      {mode === "url" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            autoFocus
            type="url"
            placeholder="https://example.com/document"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAddUrl(); if (e.key === "Escape") { setMode("idle"); setError(null); } }}
            style={{
              flex: 1,
              background: "#070f07",
              border: "1px solid rgba(0,200,83,.3)",
              borderRadius: 7,
              color: "#eef7ee",
              fontSize: 12,
              padding: "6px 10px",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => void handleAddUrl()}
            disabled={loading || !urlInput.trim()}
            style={{
              padding: "6px 12px",
              background: urlInput.trim() && !loading ? "rgba(0,200,83,.15)" : "transparent",
              border: "1px solid rgba(0,200,83,.3)",
              borderRadius: 7,
              color: "#39f70a",
              fontSize: 11,
              fontWeight: 700,
              cursor: loading || !urlInput.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
            }}
          >
            {loading ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> : "Add"}
          </button>
          <button
            onClick={() => { setMode("idle"); setError(null); setUrlInput(""); }}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#3a5a3a", fontSize: 12, padding: "4px 6px" }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add buttons */}
      {mode === "idle" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#3a5a3a",
            }}
          >
            <Paperclip style={{ width: 11, height: 11 }} />
            Case File
          </div>
          <button
            onClick={() => { setMode("url"); setError(null); }}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              background: "transparent",
              border: "1px solid #1d331d",
              borderRadius: 7,
              color: "#7ab87a",
              fontSize: 11,
              cursor: "pointer",
              transition: "border-color .15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(0,200,83,.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1d331d"; }}
          >
            <Link2 style={{ width: 11, height: 11 }} />
            Add URL
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              background: "transparent",
              border: "1px solid #1d331d",
              borderRadius: 7,
              color: "#7ab87a",
              fontSize: 11,
              cursor: "pointer",
              transition: "border-color .15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(0,200,83,.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1d331d"; }}
          >
            {loading ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} /> : <Upload style={{ width: 11, height: 11 }} />}
            Upload File
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.json,.csv,.xml"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      )}
    </div>
  );
}
