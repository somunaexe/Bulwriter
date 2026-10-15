import { getFreshToken } from "./clerk.js";

const BASE_URL = process.env["BULWRITER_API_URL"] || "https://bulwriter-production.up.railway.app/api";

export class BulwriterApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Bulwriter API returned ${status}: ${body}`);
  }
}

/** Calls Bulwriter's real REST API as the signed-in user behind
 *  CLERK_SESSION_ID — the exact same endpoints the web app itself calls. */
export async function callApi<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const token = await getFreshToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BulwriterApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
