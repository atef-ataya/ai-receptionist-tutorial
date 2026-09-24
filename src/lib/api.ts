import type { ApiErrorBody, BookingReceipt, Business, Proposal, ToolRequest } from "../../shared/contracts";
import { ensureAnonymousUser } from "./firebase";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

async function authHeaders(): Promise<Record<string, string>> {
  if ((import.meta.env.VITE_APP_MODE ?? "demo") === "demo") return { "Content-Type": "application/json" };
  const user = await ensureAnonymousUser();
  return { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(await authHeaders());
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json() as T | ApiErrorBody;
  if (!response.ok || (typeof payload === "object" && payload !== null && "ok" in payload && payload.ok === false)) {
    const error = payload as ApiErrorBody;
    throw new ApiError(response.status, error.error?.code ?? "SERVICE_UNAVAILABLE", error.error?.message ?? "The request failed.", error.error?.details);
  }
  return payload as T;
}

export async function getBusiness() { return request<{ ok: true; business: Business }>("/api/business"); }
export async function getLiveToken() { return request<{ ok: true; token: string; model: string }>("/api/live-token", { method: "POST", body: "{}" }); }
export async function runTool(tool: ToolRequest) { return request<{ ok: true; callId: string; result: unknown }>("/api/tools", { method: "POST", body: JSON.stringify(tool) }); }
export async function confirmBooking(proposalId: string, idempotencyKey: string) { return request<{ ok: true; booking: BookingReceipt }>("/api/bookings/confirm", { method: "POST", body: JSON.stringify({ proposalId, idempotencyKey }) }); }
export async function getBooking(id: string) { return request<{ ok: true; booking: BookingReceipt }>(`/api/bookings/${encodeURIComponent(id)}`); }
export function asProposal(value: unknown) { return value as Proposal; }
