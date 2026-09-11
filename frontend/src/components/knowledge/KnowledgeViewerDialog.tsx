"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { getKnowledge } from "@/lib/api/knowledge";
import type { KnowledgeDetail, KnowledgeItem } from "@/types/knowledge";

/**
 * What one knowledge document actually says.
 *
 * The list can only show a title, and a title is not enough to tell two
 * documents apart — three pages read from the same link look identical in a
 * row, and a transcript could say anything. This is how a creator checks.
 *
 * Deliberately shows the text rebuilt from the stored chunks rather than
 * whatever was submitted: the chunks are what retrieval searches, so this is
 * what the agents will find.
 */

const SOURCE_LABEL: Record<KnowledgeItem["source_type"], string> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  text: "Text",
  reel: "Transcribed reel",
  video: "Transcribed video",
};

export function KnowledgeViewerDialog({
  item,
  onOpenChange,
}: {
  /** The row that was clicked, or null when nothing is open. */
  item: KnowledgeItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  // What was loaded, stamped with the document it belongs to. Keeping the id
  // alongside the result is what makes showing the wrong text impossible
  // rather than merely unlikely: open a second document while the first is
  // still arriving and the stamp no longer matches, so nothing stale can
  // render under the new title — which is the exact mistake this dialog
  // exists to help a creator avoid making.
  const [loaded, setLoaded] = useState<{
    id: string;
    detail: KnowledgeDetail | null;
    error: string | null;
  } | null>(null);

  const id = item?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    void getKnowledge(id)
      .then((detail) => {
        if (!cancelled) setLoaded({ id, detail, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded({
            id,
            detail: null,
            error: err instanceof Error ? err.message : "Couldn't load this document.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const current = loaded && loaded.id === id ? loaded : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="pr-6">{item?.title}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
            {item && <span>{SOURCE_LABEL[item.source_type] ?? item.source_type}</span>}
            {detail && detail.chunk_count > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {detail.chunk_count} {detail.chunk_count === 1 ? "piece" : "pieces"} for
                  search
                </span>
              </>
            )}
            {item?.status === "failed" && <Badge variant="destructive">failed</Badge>}
          </div>
          {item?.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 pt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.source_url}</span>
            </a>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {item?.status === "failed" && item.error_message && (
            <p className="mb-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              {item.error_message}
            </p>
          )}

          {!detail && !error && item?.status !== "failed" && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Loading…
            </div>
          )}

          {error && <ErrorState description={error} />}

          {detail && (
            <>
              {/*
                The takeaways first, where a link was read — they are what a
                prompt is handed as fact, so seeing them apart from the page
                text is the point rather than a flourish.
              */}
              {detail.summary && (
                <div className="mb-4">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Summary used in prompts
                  </p>
                  <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs text-foreground">
                    {detail.summary}
                  </pre>
                </div>
              )}

              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Content
              </p>
              {detail.content ? (
                <pre className="whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs leading-relaxed text-foreground">
                  {detail.content}
                </pre>
              ) : (
                <p className="rounded border border-border p-3 text-sm text-muted-foreground">
                  {item?.status === "processing"
                    ? "Still being read. This fills in once it is ready."
                    : "Nothing was stored for this document."}
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
