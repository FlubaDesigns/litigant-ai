/** Square amounts are minor units in the recorded currency, never credit units. */
export function formatPaymentAmount(amount: number | null, currency: string | null): string {
  if (amount === null || !currency || !Number.isSafeInteger(amount)) return "Amount unavailable";
  try {
    const format = new Intl.NumberFormat(undefined, { style: "currency", currency });
    return format.format(amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
  } catch { return "Amount unavailable"; }
}

export function BillingHistoryError({ error, onRetry }: {error: string; onRetry: () => void}) {
  if (!error) return null;
  return <p role="alert" className="p-4 text-sm text-amber-500">{error} <button className="underline" onClick={onRetry}>Retry</button></p>;
}
