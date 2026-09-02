import { env, isApiConfigured } from "@/config/env";

/**
 * The only path allowed to reach external AI providers or the database is
 * the backend. This client only ever talks to the OneInfo application API
 * (`NEXT_PUBLIC_API_URL`) — never to Gemini/Groq/OpenAI/Veo/Supabase directly.
 */

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Thrown when NEXT_PUBLIC_API_URL is not set yet (Phase 02+ stands up the
 * backend). Feature API modules should catch this and fall back to an
 * empty/mock result so Phase 01 screens can render their placeholder states
 * instead of surfacing a scary error for something that isn't wired up yet.
 */
export class ApiNotConfiguredError extends Error {
  constructor() {
    super("OneInfo API is not configured yet.");
    this.name = "ApiNotConfiguredError";
  }
}

type RequestOptions = {
  signal?: AbortSignal;
};

async function request<T>(
  path: string,
  init: RequestInit & RequestOptions = {}
): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiNotConfiguredError();
  }

  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const message = await res
      .json()
      .then((body: { message?: string }) => body?.message)
      .catch(() => undefined);
    throw new ApiError(message ?? `Request failed (${res.status})`, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: "GET", ...options }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: "DELETE", ...options }),
};
