import { parseDemoRecord, type DemoRecord } from "../domain/contracts";

async function boundedFetch(input: string, init: RequestInit, signal?: AbortSignal) {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 15_000);
  const abort = () => timeout.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(input, { ...init, signal: timeout.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json() as Promise<unknown>;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function recommend(payload: unknown, signal?: AbortSignal) {
  return boundedFetch(
    "/api/v1/recommend",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    signal,
  );
}

export async function loadDemo(
  state: "day1" | "day1_rejected" | "day2" = "day1",
  signal?: AbortSignal,
): Promise<DemoRecord> {
  return parseDemoRecord(await boundedFetch(`/demo/${state}.json`, { method: "GET" }, signal));
}
