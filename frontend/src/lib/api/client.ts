import { env, isApiConfigured } from "@/config/env";
import { getAuthProvider } from "@/lib/auth/provider";

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

/**
 * Builds the auth header from the active auth provider (dev-mock token or,
 * once implemented, a real Supabase access token). Only ever called from
 * client components, matching how every API module in this app is used.
 */
function buildHeaders(hasBody: boolean): HeadersInit {
  const token = getAuthProvider().getAuthToken();
  return {
    Accept: "application/json",
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseErrorMessage(res: Response): Promise<string | undefined> {
  return res
    .json()
    .then((body: { error?: { message?: string; code?: string } }) => body?.error?.message)
    .catch(() => undefined);
}

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
      ...buildHeaders(Boolean(init.body)),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const message = await parseErrorMessage(res);
    throw new ApiError(message ?? `Request failed (${res.status})`, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  if (!isApiConfigured) {
    throw new ApiNotConfiguredError();
  }

  const res = await fetch(`${env.apiUrl}${path}`, {
    credentials: "include",
    headers: buildHeaders(false),
    signal: options.signal,
  });

  if (!res.ok) {
    const message = await parseErrorMessage(res);
    throw new ApiError(message ?? `Request failed (${res.status})`, res.status);
  }

  return res.blob();
}

/**
 * Multipart upload. Deliberately does not go through `request`: setting a
 * Content-Type by hand on a FormData body drops the multipart boundary the
 * browser generates, and the request fails on the server as unparseable.
 */
async function requestForm<T>(
  path: string,
  form: FormData,
  options: RequestOptions = {}
): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiNotConfiguredError();
  }

  const res = await fetch(`${env.apiUrl}${path}`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: buildHeaders(false),
    signal: options.signal,
  });

  if (!res.ok) {
    const message = await parseErrorMessage(res);
    throw new ApiError(message ?? `Request failed (${res.status})`, res.status);
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
  getBlob: (path: string, options?: RequestOptions) => requestBlob(path, options),
  postForm: <T>(path: string, form: FormData, options?: RequestOptions) =>
    requestForm<T>(path, form, options),
};
