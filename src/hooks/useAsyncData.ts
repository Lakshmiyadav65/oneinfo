"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";

type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: T };

function humanizeError(err: unknown): string {
  if (err instanceof ApiError) {
    return "We couldn't load this right now. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Reset to loading whenever the fetcher/deps change, before the async
    // call resolves — this can't be computed during render since it must
    // fire once per dependency change, not once per render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });

    fetcher()
      .then((data) => {
        if (!cancelled) setState({ status: "success", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", message: humanizeError(err) });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  return { ...state, retry: () => setReloadKey((k) => k + 1) };
}
