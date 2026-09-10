"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  // The newest read wins, and unmounting invalidates whatever is in flight.
  // A background refresh and a dependency change can otherwise be running at
  // the same time, and the slower of the two would put the older data back.
  const requestId = useRef(0);
  const latestFetcher = useRef(fetcher);
  useEffect(() => {
    latestFetcher.current = fetcher;
  });

  useEffect(() => {
    const id = (requestId.current += 1);
    // Reset to loading whenever the fetcher/deps change, before the async
    // call resolves — this can't be computed during render since it must
    // fire once per dependency change, not once per render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });

    fetcher()
      .then((data) => {
        if (requestId.current === id) setState({ status: "success", data });
      })
      .catch((err: unknown) => {
        if (requestId.current === id) {
          setState({ status: "error", message: humanizeError(err) });
        }
      });

    return () => {
      requestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  /**
   * Re-reads in the background, leaving what is on screen until the new data
   * arrives.
   *
   * `retry` drops back to loading, which is right when the creator is
   * waiting on this read and wrong when they are waiting on something else.
   * A page gated on the query blanks at exactly the moment a run they just
   * paid for should be reporting progress, and whatever was doing that
   * reporting is unmounted along with it.
   */
  const refresh = useCallback(async () => {
    const id = (requestId.current += 1);
    try {
      const data = await latestFetcher.current();
      if (requestId.current === id) setState({ status: "success", data });
    } catch (err) {
      if (requestId.current === id) {
        setState({ status: "error", message: humanizeError(err) });
      }
    }
  }, []);

  return { ...state, retry: () => setReloadKey((k) => k + 1), refresh };
}
