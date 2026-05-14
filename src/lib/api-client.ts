import type { ZodType } from "zod";

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not json */
  }
  const message =
    (body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
      ? (body as { error: string }).error
      : null) ?? `요청 실패 (${res.status})`;
  return new ApiError(message, res.status, body);
}

/**
 * AbortSignal 지원 — React Query 의 queryFn({ signal }) 에서 받아 그대로 전달하면
 * 컴포넌트 unmount / refetch 시 in-flight 요청이 깨끗하게 cancel 됨 (ECONNRESET 노이즈 방지).
 */
export async function apiGet<T>(
  url: string,
  schema?: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw await parseError(res);
  const data = (await res.json()) as unknown;
  if (!schema) return data as T;
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError("응답 형식 오류", 500, parsed.error.flatten());
  }
  return parsed.data;
}

type Method = "POST" | "PUT" | "PATCH" | "DELETE";

export async function apiMutate<T = unknown>(
  url: string,
  method: Method,
  body?: unknown,
  schema?: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as unknown;
  if (!schema) return data as T;
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError("응답 형식 오류", 500, parsed.error.flatten());
  }
  return parsed.data;
}

/**
 * AbortError 식별 — 사용자가 페이지를 떠나 fetch 가 cancel 된 경우.
 * React Query 안에서 자동 처리되지만 polling 등 직접 호출처는 silently swallow 가능.
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}
