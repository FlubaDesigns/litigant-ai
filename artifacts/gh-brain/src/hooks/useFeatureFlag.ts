import { useEffect, useState } from "react";
import { getFeatureFlags } from "@/services/adminService";

let _cache: Record<string, boolean> | null = null;
let _promise: Promise<Record<string, boolean>> | null = null;

async function loadFlags(): Promise<Record<string, boolean>> {
  if (_cache) return _cache;
  if (!_promise) {
    _promise = getFeatureFlags().then((flags) => {
      _cache = flags;
      return flags;
    });
  }
  return _promise;
}

/**
 * Read a feature flag from `config/featureFlags` in Firestore (via API).
 * Flags are cached in-memory after first load.
 * Returns `false` while loading or if the flag is not found.
 */
export function useFeatureFlag(name: string): boolean {
  const [flags, setFlags] = useState<Record<string, boolean>>(_cache ?? {});

  useEffect(() => {
    let cancelled = false;
    loadFlags().then((loaded) => {
      if (!cancelled) setFlags(loaded);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return flags[name] ?? false;
}

/** Invalidate the cache (call after toggling a flag in the admin UI) */
export function invalidateFeatureFlagCache(): void {
  _cache = null;
  _promise = null;
}
