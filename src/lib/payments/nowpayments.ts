import { createHmac, timingSafeEqual } from "node:crypto";
import { ProxyAgent, fetch } from "undici";

const API_BASE = "https://api.nowpayments.io/v1";
export const NOWPAYMENTS_CURRENCY = "usdttrc20";
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

export type NowPaymentsPayment = {
  payment_id: string | number;
  parent_payment_id?: string | number | null;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid?: number;
  pay_currency: string;
  order_id?: string | null;
  outcome_amount?: number;
  outcome_currency?: string;
  expiration_estimate_date?: string;
};

export class NowPaymentsConfigurationError extends Error {}
export class NowPaymentsApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

type ApiRequestInit = {
  method?: "POST";
  body?: string;
};

function apiKey(): string {
  const value = process.env.NOWPAYMENTS_API_KEY?.trim();
  if (!value) throw new NowPaymentsConfigurationError("NOWPayments API 尚未配置");
  return value;
}

async function apiRequest<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const requestInit = {
    ...init,
    headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
    cache: "no-store" as const,
    signal: AbortSignal.timeout(15_000),
  };
  const response = dispatcher
    ? await fetch(url, { ...requestInit, dispatcher })
    : await globalThis.fetch(url, requestInit);
  const body = await response.json().catch(() => null) as T | { message?: string; code?: string } | null;
  const errorMessage = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : null;
  const errorCode = body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : undefined;
  if (!response.ok) throw new NowPaymentsApiError(errorMessage ?? `NOWPayments 请求失败 (${response.status})`, response.status, errorCode);
  return body as T;
}

export async function getNowPaymentsMinimumAmount(): Promise<number> {
  const query = new URLSearchParams({ currency_from: NOWPAYMENTS_CURRENCY, currency_to: NOWPAYMENTS_CURRENCY, is_fixed_rate: "false", is_fee_paid_by_user: "false" });
  const result = await apiRequest<{ min_amount: number }>(`/min-amount?${query}`);
  if (!Number.isFinite(result.min_amount) || result.min_amount <= 0) throw new NowPaymentsApiError("NOWPayments 返回了无效的最低充值金额", 502);
  return result.min_amount;
}

export async function createNowPaymentsPayment(orderId: string, amount: number): Promise<NowPaymentsPayment> {
  const configuredCallback = process.env.NOWPAYMENTS_IPN_CALLBACK_URL?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const callback = configuredCallback || (siteUrl ? new URL("/api/payments/nowpayments/ipn", siteUrl).toString() : "");
  if (!callback) throw new NowPaymentsConfigurationError("缺少 NOWPayments IPN 回调地址");
  if (process.env.NODE_ENV === "production" && !callback.startsWith("https://")) throw new NowPaymentsConfigurationError("生产环境 IPN 回调地址必须使用 HTTPS");
  return apiRequest<NowPaymentsPayment>("/payment", {
    method: "POST",
    body: JSON.stringify({
      price_amount: amount,
      price_currency: NOWPAYMENTS_CURRENCY,
      pay_currency: NOWPAYMENTS_CURRENCY,
      order_id: orderId,
      order_description: "Sigma Bot Gas recharge",
      ipn_callback_url: callback,
      is_fixed_rate: false,
      is_fee_paid_by_user: false,
    }),
  });
}

export function getNowPaymentsPayment(paymentId: string): Promise<NowPaymentsPayment> {
  return apiRequest<NowPaymentsPayment>(`/payment/${encodeURIComponent(paymentId)}`);
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortObject((value as Record<string, unknown>)[key]);
      return result;
    }, {});
  }
  return value;
}

export function canonicalizeNowPaymentsPayload(payload: unknown): string {
  return JSON.stringify(sortObject(payload));
}

export function verifyNowPaymentsSignature(payload: unknown, receivedSignature: string | null): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET?.trim();
  if (!secret || !receivedSignature || !/^[a-f0-9]{128}$/i.test(receivedSignature)) return false;
  const expected = createHmac("sha512", secret).update(canonicalizeNowPaymentsPayload(payload)).digest();
  const received = Buffer.from(receivedSignature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}