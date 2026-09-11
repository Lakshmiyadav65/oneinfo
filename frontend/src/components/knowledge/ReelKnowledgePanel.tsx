"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clapperboard, Link2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { addKnowledgeReels, uploadKnowledgeVideo } from "@/lib/api/knowledge";
import type { ReelQueued } from "@/types/knowledge";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "@/types/project";

/**
 * Building the knowledge layer out of what a creator already said on camera.
 *
 * The paste-a-chat path assumes a year of ChatGPT transcripts. Plenty of
 * creators have none of that and have instead been saying this material to
 * camera three times a week — this reads those, and the transcripts become
 * the same knowledge layer.
 */

// The same three the workflow header offers, from the same constant. A
// transcript is what the script agents later write from, so this is the
// same question Create Video asks — not a second one in different words.
//
// Tenglish by default: it reads back whatever was said, romanised, so an
// English reel is unchanged and a Telugu one stays readable.
const DEFAULT_LANGUAGE: ProjectLanguage = "tenglish";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

export function ReelKnowledgePanel({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [language, setLanguage] = useState<ProjectLanguage>(DEFAULT_LANGUAGE);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  // Per-link outcomes, shown in place. A batch where two links worked and
  // one needed a login is the normal result, and saying so here beats a
  // toast that names none of them.
  const [results, setResults] = useState<ReelQueued[] | null>(null);

  const urls = raw
    .split(/[\n\s]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  async function handleTranscribe() {
    setBusy(true);
    try {
      const response = await addKnowledgeReels(urls, language);
      setResults(response.reels);
      const queued = response.reels.filter((r) => r.document && !r.already_added).length;
      if (queued > 0) {
        setRaw("");
        onSaved();
      }
    } catch (err) {
      toast({ title: "Couldn't add those", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleVideo(file: File) {
    setBusy(true);
    try {
      await uploadKnowledgeVideo(file, language);
      toast({
        title: "Transcribing",
        description: `${file.name} will appear in your knowledge once it is read.`,
      });
      onSaved();
    } catch (err) {
      toast({ title: "Upload failed", description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      <Segmented
        label="Language"
        value={language}
        disabled={busy}
        onChange={setLanguage}
        options={PROJECT_LANGUAGES.map(({ value, label, hint }) => ({ value, label, hint }))}
      />

      <div className="space-y-2">
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={
            "Paste your reel links, one per line:\n" +
            "https://www.instagram.com/reel/XXXXXXXXX/\n" +
            "https://www.instagram.com/reel/YYYYYYYYY/"
          }
          className="min-h-28 resize-none font-mono text-xs"
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          Up to ten at a time. Each one is downloaded, transcribed and filed as its own
          document — so your own words become what OneInfo writes from. If a reel is
          private, upload the video below instead.
        </p>
        <Button onClick={handleTranscribe} disabled={busy || urls.length === 0}>
          {busy ? <Spinner className="size-4" /> : <Link2 className="size-4" />}
          Transcribe {urls.length > 0 ? urls.length : ""}{" "}
          {urls.length === 1 ? "reel" : "reels"}
        </Button>
      </div>

      {results && results.length > 0 && (
        <ul className="space-y-1.5 rounded-lg border border-border p-3">
          {results.map((result, index) => (
            <li key={index} className="flex items-start gap-2 text-xs">
              {result.error ? (
                <AlertCircle className="mt-px size-3.5 shrink-0 text-destructive" />
              ) : (
                <CheckCircle2 className="mt-px size-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{result.url}</p>
                <p className={result.error ? "text-destructive" : "text-muted-foreground"}>
                  {result.error
                    ? result.error
                    : result.already_added
                      ? "Already in your knowledge — nothing to redo."
                      : "Transcribing now. It will appear in the list below."}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/*
        Not a separate mode. Instagram serves private and some age-gated
        posts only to a signed-in account, so the link failing and the file
        working is one situation, not two — the way out of it belongs next to
        the thing that failed.
      */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">
          Or upload the video, if the link won&apos;t work
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleVideo(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:opacity-50"
        >
          {busy ? <Spinner className="size-5" /> : <Upload className="size-5" />}
          <span className="flex items-center gap-1.5">
            <Clapperboard className="size-4" />
            Choose an MP4, MOV or WEBM file
          </span>
        </button>
      </div>
    </div>
  );
}
