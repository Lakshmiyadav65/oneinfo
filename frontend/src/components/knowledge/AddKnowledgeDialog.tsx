"use client";

import { useRef, useState } from "react";
import { FileUp, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import {
  addKnowledgeText,
  saveKnowledgeSections,
  structureKnowledge,
  uploadKnowledgeFile,
} from "@/lib/api/knowledge";
import type { KnowledgeSection } from "@/types/knowledge";

type Mode = "paste" | "upload";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after anything is saved, so the list can refresh. */
  onSaved: () => void;
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

export function AddKnowledgeDialog({ open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("paste");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  // null until the creator has asked for a split; the review step renders
  // only once there is a proposal to review.
  const [sections, setSections] = useState<KnowledgeSection[] | null>(null);
  const [truncated, setTruncated] = useState(false);

  function reset() {
    setRaw("");
    setSections(null);
    setTruncated(false);
    setBusy(false);
    setMode("paste");
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  async function handleOrganise() {
    setBusy(true);
    try {
      const result = await structureKnowledge(raw);
      setSections(result.sections);
      setTruncated(result.truncated);
    } catch (err) {
      toast({ title: "Couldn't organise that", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSections() {
    if (!sections?.length) return;
    setBusy(true);
    try {
      await saveKnowledgeSections(sections);
      toast({
        title: `Added ${sections.length} document${sections.length === 1 ? "" : "s"}`,
        description: "They will be ready to use in a moment.",
      });
      onSaved();
      close();
    } catch (err) {
      toast({ title: "Couldn't save", description: errorMessage(err) });
      setBusy(false);
    }
  }

  /** Escape hatch: keep the paste exactly as written, no splitting. */
  async function handleSaveWhole() {
    setBusy(true);
    try {
      const firstLine = raw.trim().split("\n")[0]?.slice(0, 80) || "Pasted note";
      await addKnowledgeText(firstLine, raw);
      toast({ title: "Added 1 document" });
      onSaved();
      close();
    } catch (err) {
      toast({ title: "Couldn't save", description: errorMessage(err) });
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      await uploadKnowledgeFile(file);
      toast({ title: "Uploaded", description: `${file.name} is being processed.` });
      onSaved();
      close();
    } catch (err) {
      toast({ title: "Upload failed", description: errorMessage(err) });
      setBusy(false);
    }
  }

  function updateSection(index: number, patch: Partial<KnowledgeSection>) {
    setSections((current) =>
      current ? current.map((s, i) => (i === index ? { ...s, ...patch } : s)) : current
    );
  }

  function removeSection(index: number) {
    setSections((current) => (current ? current.filter((_, i) => i !== index) : current));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      {/*
        Three bands: a fixed header, one scrolling body, and a pinned footer.
        Scrolling the whole dialog instead would carry the title and the save
        button off-screen — on a short viewport the primary action ends up
        below the fold, reachable only by scrolling past everything else.
      */}
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add knowledge</DialogTitle>
          <DialogDescription>
            Paste a chat, script or notes, or upload a file. OneInfo uses this to write in
            your style.
          </DialogDescription>
        </DialogHeader>

        {sections === null && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-4 flex shrink-0 gap-2">
              <Button
                variant={mode === "paste" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setMode("paste")}
              >
                Paste text
              </Button>
              <Button
                variant={mode === "upload" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setMode("upload")}
              >
                Upload a file
              </Button>
            </div>

            {mode === "paste" ? (
              // The textarea is the scroll surface here — it grows to fill the
              // dialog so a long paste scrolls inside the field, rather than
              // the field growing and pushing the buttons out of reach.
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <Textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder="Paste your whole ChatGPT or Claude conversation here: hooks, scripts, captions, anything you have written."
                  className="min-h-40 flex-1 resize-none font-mono text-xs"
                  disabled={busy}
                />
                <p className="shrink-0 text-xs text-muted-foreground">
                  A long chat usually covers several topics. OneInfo will split it into
                  separate documents and drop the back-and-forth, so each one can be found on
                  its own later. You will see the split before anything is saved.
                </p>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button onClick={handleOrganise} disabled={busy || !raw.trim()}>
                    {busy ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
                    Organise and preview
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleSaveWhole}
                    disabled={busy || !raw.trim()}
                  >
                    Save as one document
                  </Button>
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                  className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:opacity-50"
                >
                  {busy ? <Spinner className="size-5" /> : <FileUp className="size-5" />}
                  <span>Choose a PDF, DOCX or TXT file</span>
                </button>
              </div>
            )}
          </div>
        )}

        {sections !== null && (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="shrink-0">
              <p className="text-sm font-medium text-foreground">
                {sections.length} document{sections.length === 1 ? "" : "s"} found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Edit a title, or remove anything you do not want. Nothing is saved until you
                confirm.
              </p>
              {truncated && (
                <p className="mt-2 text-xs text-destructive">
                  That paste was very long, so only the first part was organised. Add the rest
                  as a second paste.
                </p>
              )}
            </div>

            {sections.length === 0 && (
              <p className="shrink-0 rounded-md border border-border p-4 text-sm text-muted-foreground">
                Nothing left to save. Go back and try again.
              </p>
            )}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {sections.map((section, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`section-${index}`} className="sr-only">
                      Document title
                    </Label>
                    <Input
                      id={`section-${index}`}
                      value={section.title}
                      onChange={(e) => updateSection(index, { title: e.target.value })}
                      className="font-medium"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSection(index)}
                      aria-label={`Remove ${section.title}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {/*
                    The labels show collapsed, so the shape of a document —
                    hook, body, CTA — is readable without opening every one.
                  */}
                  {section.parts && section.parts.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {section.parts.map((part, partIndex) => (
                        <span
                          key={partIndex}
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        >
                          {part.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Preview content
                    </summary>
                    {/*
                      No inner scroller: a second scrollable box inside the
                      list means the wheel gets captured by whichever one the
                      cursor happens to be over. The preview expands in place
                      and the list scrolls it.
                    */}
                    {section.parts && section.parts.length > 0 ? (
                      <div className="mt-2 space-y-3">
                        {section.parts.map((part, partIndex) => (
                          <div key={partIndex}>
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {part.label}
                            </p>
                            <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs text-foreground">
                              {part.text}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs text-foreground">
                        {section.content}
                      </pre>
                    )}
                  </details>
                </div>
              ))}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 border-t border-border pt-3">
              <Button onClick={handleSaveSections} disabled={busy || sections.length === 0}>
                {busy && <Spinner className="size-4" />}
                Save {sections.length} document{sections.length === 1 ? "" : "s"}
              </Button>
              <Button variant="ghost" onClick={() => setSections(null)} disabled={busy}>
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
