"use client";

import { useCallback, useEffect, useState } from "react";
import type { PosterPost } from "@/types/poster";
import {
  deletePost as removePost,
  isEphemeral,
  loadPosts,
  savePost as writePost,
  type StorageResult,
} from "@/lib/poster/storage";

type LibraryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: PosterPost[] };

/**
 * Every poster saved on this device.
 *
 * The returned shape mirrors `useAsyncData` deliberately, so the pages here
 * render through the same loading / error / empty / content ladder as the rest
 * of the app rather than inventing a second one for local data.
 */
export function usePosterLibrary() {
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [ephemeral, setEphemeral] = useState(false);

  const read = useCallback(() => {
    const { posts, unreadable } = loadPosts();
    setEphemeral(isEphemeral());
    setState(
      unreadable
        ? {
            status: "error",
            message:
              "We couldn't read the posters saved on this device. They may have been made in a newer version.",
          }
        : { status: "success", data: posts }
    );
  }, []);

  useEffect(() => {
    // Storage only exists in the browser, so the first read has to happen
    // after mount. See the note in lib/poster/storage.ts on why it cannot
    // happen during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    read();
  }, [read]);

  const save = useCallback(
    (post: PosterPost): StorageResult => {
      const result = writePost(post);
      if (result.ok) read();
      return result;
    },
    [read]
  );

  const remove = useCallback(
    (id: string): StorageResult => {
      const result = removePost(id);
      if (result.ok) read();
      return result;
    },
    [read]
  );

  return { ...state, retry: read, save, remove, ephemeral };
}
