const SQUARE_BASE_URL =
  process.env["SQUARE_ENVIRONMENT"] === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

export function isSquareConfigured(): boolean {
  return !!(process.env["SQUARE_ACCESS_TOKEN"] && process.env["SQUARE_LOCATION_ID"]);
}

export function getSquareLocationId(): string {
  const id = process.env["SQUARE_LOCATION_ID"];
  if (!id) throw new Error("SQUARE_LOCATION_ID not set");
  return id;
}

async function squareFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = process.env["SQUARE_ACCESS_TOKEN"];
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN not set");

  const res = await fetch(`${SQUARE_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-11-20",
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  const body = await res.json();
  if (!res.ok) {
    const errMsg =
      (body as any)?.errors?.[0]?.detail ?? `Square API error ${res.status}`;
    throw new Error(errMsg);
  }
  return body as T;
}

export interface SquarePaymentLink {
  id: string;
  url: string;
  order_id: string;
}

export async function createPaymentLink(opts: {
  name: string;
  amountCents: number;
  note: string;
  redirectUrl: string;
  buyerEmail?: string;
  idempotencyKey: string;
}): Promise<SquarePaymentLink> {
  const locationId = getSquareLocationId();

  const payload: Record<string, unknown> = {
    idempotency_key: opts.idempotencyKey,
    quick_pay: {
      name: opts.name,
      price_money: {
        amount: opts.amountCents,
        currency: "USD",
      },
      location_id: locationId,
    },
    checkout_options: {
      redirect_url: opts.redirectUrl,
      ask_for_shipping_address: false,
    },
    payment_note: opts.note,
  };

  if (opts.buyerEmail) {
    payload["pre_populated_data"] = { buyer_email: opts.buyerEmail };
  }

  const data = await squareFetch<{ payment_link: SquarePaymentLink }>(
    "/v2/online-checkout/payment-links",
    { method: "POST", body: JSON.stringify(payload) }
  );

  return data.payment_link;
}

export async function listPayments(limit = 20): Promise<any[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const data = await squareFetch<{ payments?: any[] }>(`/v2/payments?${params}`);
  return data.payments ?? [];
}
