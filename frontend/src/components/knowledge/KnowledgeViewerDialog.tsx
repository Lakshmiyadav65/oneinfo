"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Languages, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { Segmented } from "@/components/ui/Segmented";
import { KnowledgeEditor } from "@/components/knowledge/KnowledgeEditor";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  getKnowledge,
  retranscribeKnowledge,
  updateKnowledgeContent,
} from "@/lib/api/knowledge";
import type { CorrectionDraft, KnowledgeDetail, KnowledgeItem } from "@/types/knowledge";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "@/types/project";

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
  onChanged,
}: {
  /** The row that was clicked, or null when nothing is open. */
  item: KnowledgeItem | null;
  onOpenChange: (open: boolean) => void;
  /** Called after an edit or a re-read, so the list can pick up the new status. */
  onChanged: () => void;
}) {
  const { toast } = useToast();
  // Non-null while editing, holding the draft. Separate from the loaded
  // document so cancelling is just dropping it.
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The language a re-read would use. Defaults to the app's own default
  // rather than to whatever this transcript happens to be in — the reason
  // to open this fold is usually that the current one is wrong.
  const [target, setTarget] = useState<ProjectLanguage>("tenglish");
  // Every substitution made in this editing session, saved alongside the
  // text so the same mishearing is fixed before it reaches the next reel.
  const [learned, setLearned] = useState<CorrectionDraft[]>([]);
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

  // Opening a different row must not carry a half-finished correction
  // across to it. Keyed the same way the loaded content is.
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const editing = draft !== null && draftFor === id;

  const current = loaded && loaded.id === id ? loaded : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;
  const { fields, body } = splitHeader(detail?.content ?? "");

  const canRetranscribe = item?.source_type === "reel" && Boolean(item.source_url);

  function startEditing() {
    if (!detail || !id) return;
    // The whole stored text, header included. The header is part of what
    // gets embedded, so hiding it from the editor would mean a correction
    // to a misheard name in the title line could not be made at all.
    setDraft(detail.content);
    setDraftFor(id);
  }

  function stopEditing() {
    setDraft(null);
    setDraftFor(null);
    setLearned([]);
  }

  async function save() {
    if (!id || draft === null) return;
    setBusy(true);
    try {
      await updateKnowledgeContent(id, draft, learned);
      // Dropped rather than kept: the document is now being re-chunked, and
      // what comes back from the server is the thing to trust.
      setLoaded(null);
      stopEditing();
      onChanged();
      toast({
        title: "Correction saved",
        description: learned.length
          ? `It is being re-read now, and ${learned.length === 1 ? "that fix" : "those fixes"} ` +
            "will be applied to future transcripts automatically."
          : "It is being re-read now, and the AI will use the corrected version.",
      });
    } catch (err) {
      toast({
        title: "Couldn't save",
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function retranscribe(language: ProjectLanguage) {
    if (!id) return;
    setBusy(true);
    try {
      await retranscribeKnowledge(id, language);
      setLoaded(null);
      stopEditing();
      onChanged();
      toast({
        title: "Reading it again",
        description: "The reel is being downloaded and transcribed in the new language.",
      });
    } catch (err) {
      toast({
        title: "Couldn't re-read that",
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

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

              {editing ? (
                <KnowledgeEditor
                  value={draft}
                  onChange={setDraft}
                  disabled={busy}
                  onReplaced={(heard, corrected) =>
                    setLearned((current) => [
                      // Last one wins for the same word: a creator who
                      // corrects, looks at it, and corrects again meant the
                      // second answer.
                      ...current.filter((c) => c.heard.toLowerCase() !== heard.toLowerCase()),
                      { heard, corrected },
                    ])
                  }
                />
              ) : body ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {item?.source_type === "reel" || item?.source_type === "video"
                        ? "Transcript"
                        : "Content"}
                    </h3>
                    <Button size="sm" variant="ghost" onClick={startEditing} disabled={busy}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  </div>
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
              {!editing && detail.summary && (
                <Disclosure
                  title="Summary given to the AI"
                  summary="What gets quoted as fact when this source is used"
                >
                  <p className="whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                    {detail.summary}
                  </p>
                </Disclosure>
              )}

              {/*
                Reading the reel again, rather than correcting this text.
                Kept below the editor and behind its own fold because it
                throws away every correction made so far and costs another
                download and another transcription — it is the answer to "I
                picked the wrong language", not to "this word is wrong".
              */}
              {!editing && canRetranscribe && (
                <Disclosure
                  title="Read it again in another language"
                  summary="Replaces this transcript"
                >
                  {/*
                    Picking a language and re-reading are two actions on
                    purpose. One click here costs a download and a paid
                    transcription and discards every correction already
                    saved, which is far too much to hang off brushing past a
                    segmented control.
                  */}
                  <Segmented
                    label="Transcribe the reel as"
                    value={target}
                    disabled={busy}
                    onChange={setTarget}
                    options={PROJECT_LANGUAGES.map(({ value, label, hint }) => ({
                      value,
                      label,
                      hint,
                    }))}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    This downloads and transcribes the reel again, and replaces what is
                    here — including any corrections you have saved.
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    disabled={busy}
                    onClick={() => void retranscribe(target)}
                  >
                    {busy ? <Spinner className="size-4" /> : <Languages className="size-3.5" />}
                    Read it again in {PROJECT_LANGUAGES.find((l) => l.value === target)?.label}
                  </Button>
                </Disclosure>
              )}
            </>
          )}
        </div>

        {editing && (
          <div className="flex shrink-0 items-center gap-2 border-t border-border pt-3">
            <Button onClick={() => void save()} disabled={busy || !draft.trim()}>
              {busy && <Spinner className="size-4" />}
              Save correction
            </Button>
            <Button variant="ghost" onClick={stopEditing} disabled={busy}>
              Cancel
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Saved edits are what the AI writes from
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
