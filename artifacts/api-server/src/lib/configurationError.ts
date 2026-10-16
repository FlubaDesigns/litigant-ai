/** Safe, actionable error for an unavailable authoritative configuration source. */
export class ConfigurationUnavailableError extends Error {
  readonly status = 503;
  constructor(source: string) {
    super(`${source} could not be loaded. Please retry; if this continues, ask the administrator to check the saved configuration.`);
    this.name = "ConfigurationUnavailableError";
  }
}

/** Bound a required configuration read and expose only the affected source. */
export async function loadConfiguration<T>(source: string, read: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ConfigurationUnavailableError(source)), 3000);
      }),
    ]);
  } catch {
    throw new ConfigurationUnavailableError(source);
  } finally { clearTimeout(timer); }
}
