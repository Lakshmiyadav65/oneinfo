"use client";

import { useState } from "react";
import { AlertTriangle, BookOpen, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { findUrls, readLinks } from "@/lib/api/links";
import type { LinkRead } from "@/types/link";

/**
 * Reads the pages a creator pasted into their idea.
 *
 * A link in the idea box used to be treated as prose: the model saw the
 * characters of the URL and wrote a script from whatever it happened to
 * remember about that site. For an event page that is the difference between
 * a video with the real deadline in it and a video with a plausible one.
 *
 * The takeaways are shown before anything is generated, because the creator
 * is the only one who can tell whether the page we read is the page they
 * meant.
 */
export function LinkReader({
  idea,
  onRead,
}: {
  idea: string;
  /** Fired after a successful read, so the caller can refresh knowledge. */
  onRead?: (pages: LinkRead[]) => void;
}) {
  const { toast } = useToast();
  const urls = findUrls(idea);
  const [pages, setPages] = useState<LinkRead[]>([]);
  const [busy, setBusy] = useState(false);

  // Which URLs have already been read, so pasting a second link offers to
  // read only that one rather than re-reading and re-filing the first.
  const read = new Set(pages.map((page) => page.url));
  const unread = urls.filter((url) => !read.has(url));

  if (urls.length === 0) return null;

  async function handleRead() {
    setBusy(true);
    try {
      const result = await readLinks(unread);
      setPages((current) => [...current, ...result]);
      onRead?.(result);

      const failed = result.filter((page) => page.error);
      if (failed.length === result.length) {
        toast({
          variant: "destructive",
          title:
            result.length === 1 ? "Couldn't read that link" : "Couldn't read those links",
          description: failed[0]?.error ?? undefined,
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't read the link",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {unread.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Link2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {unread.length === 1
                    ? "There's a link in your idea"
                    : `There are ${unread.length} links in your idea`}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Read {unread.length === 1 ? "it" : "them"} first and the script is
                  built on what the page actually says, not on what the model
                  remembers about it.
                </p>
              </div>
            </div>
            <Button
              className="shrink-0"
              disabled={busy}
              isLoading={busy}
              onClick={() => void handleRead()}
            >
              {unread.length === 1 ? "Read this page" : "Read these pages"}
            </Button>
          </CardContent>
        </Card>
      )}

      {pages.map((page) => (
        <Card key={page.url}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {page.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">{page.url}</p>
              </div>
              {page.saved_as_knowledge && (
                <Badge variant="success">
                  <BookOpen className="mr-1 size-3" aria-hidden="true" />
                  Saved to your knowledge
                </Badge>
              )}
            </div>

            {page.error ? (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <p className="text-sm text-foreground">{page.error}</p>
              </div>
            ) : (
              <>
                {page.topic && (
                  <p className="text-sm text-foreground">{page.topic}</p>
                )}
                {page.audience && (
                  <p className="text-xs text-muted-foreground">For: {page.audience}</p>
                )}

                {/*
                  Labelled facts rather than a summary paragraph. A viewer acts
                  on the date and the eligibility, and a paragraph is exactly
                  what rounds those off.
                */}
                <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[auto_1fr]">
                  {page.takeaways.map((takeaway) => (
                    <div key={takeaway.label} className="contents">
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {takeaway.label}
                      </dt>
                      <dd className="text-sm text-foreground">{takeaway.detail}</dd>
                    </div>
                  ))}
                </dl>

                {page.call_to_action && (
                  <p className="rounded-md border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-sm text-foreground">
                    {page.call_to_action}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
