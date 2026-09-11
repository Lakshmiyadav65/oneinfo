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
import { Disclosure } from "@/components/ui/Disclosure";
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
 * The layout is built around one judgement: they opened this to read the
 * words, not to audit the plumbing. So the words get the room, the
 * provenance is a compact labelled row above them, and the prompt summary —
 * which for a reel is largely the same sentences over again — is folded
 * away rather than printed twice down the page.
 */

const SOURCE_LABEL: Record<KnowledgeItem["source_type"], string> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  text: "Text",
  reel: "Transcribed reel",
  video: "Transcribed video",
};

const STATUS_VARIANT = {
  processing: "default",
  ready: "success",
  failed: "destructive",
} as const;

/**
 * Splits off the provenance header the ingester writes above the body.
 *
 * Those lines are stored on purpose — a retrieved chunk that says which
 * video it came from is worth more than one that doesn't — but reading them
 * as the opening paragraph of a transcript is not what they are for. Pulled
 * out here and shown as fields instead.
 *
 * Falls back to the whole text unchanged: a document written before this
 * format, or by something else entirely, is shown exactly as it is rather
 * than half-parsed.
 */
const MARKER = "--- What was said ---";

// Splits before each label the ingester writes, rather than on newlines.
// A document filed before the text was kept whole reaches here with its line
// breaks already chunked away — one long run of "Video: x Source: y Posted
// by: z" — and this recovers the same fields from either shape.
const HEADER_BOUNDARY = /\s*(?=(?:Video|Source|Posted by|Spoken in):\s)/;

// These two repeat the dialog's own title and link, so they would be said
// twice on the same screen.
const REDUNDANT = /^(Video|Source)$/;

function splitHeader(content: string): { fields: [string, string][]; body: string } {
  const marker = content.indexOf(MARKER);
  if (marker === -1) return { fields: [], body: content };

  const fields: [string, string][] = [];
  for (const line of content.slice(0, marker).split(HEADER_BOUNDARY)) {
    const at = line.indexOf(": ");
    if (at > 0 && !REDUNDANT.test(line.slice(0, at))) {
      fields.push([line.slice(0, at), line.slice(at + 2).trim()]);
    }
  }

  return { fields, body: content.slice(marker + MARKER.length).trim() };
}

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
  const { fields, body } = splitHeader(detail?.content ?? "");

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0 border-b border-border pb-3">
          <DialogTitle className="pr-8 leading-snug">{item?.title}</DialogTitle>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {item && <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>}
            {item && <span>{SOURCE_LABEL[item.source_type] ?? item.source_type}</span>}
            {detail && detail.chunk_count > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {detail.chunk_count} searchable{" "}
                  {detail.chunk_count === 1 ? "piece" : "pieces"}
                </span>
              </>
            )}
          </div>

          {item?.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex max-w-full items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.source_url}</span>
            </a>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {item?.status === "failed" && item.error_message && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {item.error_message}
            </p>
          )}

          {!detail && !error && item?.status !== "failed" && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Loading…
            </div>
          )}

          {error && <ErrorState description={error} />}

          {detail && (
            <>
              {/*
                A two-column grid rather than the raw "Key: value" lines as
                they are stored — the labels line up, so the eye runs down
                them instead of re-reading each one to find where the value
                starts.
              */}
              {fields.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  {fields.map(([label, value]) => (
                    <div key={label} className="contents">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="min-w-0 break-words text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {body ? (
                <div>
                  <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item?.source_type === "reel" || item?.source_type === "video"
                      ? "Transcript"
                      : "Content"}
                  </h3>
                  {/*
                    Prose, not monospace. This is speech, and a proportional
                    face at a readable size is how you tell whether a
                    transcript came out right — the fixed-width block it used
                    to be read like log output and invited nobody to check it.
                    whitespace-pre-wrap keeps the line breaks the text was
                    stored with.
                  */}
                  <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-4 text-sm leading-7 text-foreground">
                    {body}
                  </p>
                </div>
              ) : (
                <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                  {item?.status === "processing"
                    ? "Still being read. This fills in once it is ready."
                    : "Nothing was stored for this document."}
                </p>
              )}

              {/*
                Folded. For a reel this is the transcript again with a
                provenance header, and printing the same sentences twice down
                one dialog is how you make a creator distrust both copies.
                Still reachable, because it is what a prompt is handed as
                fact and that is worth being able to check.
              */}
              {detail.summary && (
                <Disclosure
                  title="Summary given to the AI"
                  summary="What gets quoted as fact when this source is used"
                >
                  <p className="whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                    {detail.summary}
                  </p>
                </Disclosure>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
