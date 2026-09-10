"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
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
 * Reading starts on its own. Pasting the link was already the creator saying
 * what the video is about, and a button asking whether we may read it has
 * only one sensible answer - so it was a step that existed to be clicked
 * through rather than decided.
 *
 * The takeaways are still shown before anything is generated, because the
 * creator is the only one who can tell whether the page we read is the page
 * they meant.
 */

/**
 * How long typing has to stop before a link is read. A URL typed out by hand
 * is a different address at every keystroke, and each one would otherwise be
 * its own page fetch. A pasted link arrives whole and waits this out once.
 */
const SETTLE_MS = 700;

/**
 * Keyed by the address the creator actually pasted, not by the one that came
 * back. A link often redirects, and matching on the final URL would leave the
 * original looking unread for as long as it stayed in the idea box.
 */
type Result = { requested: string; page: LinkRead };

export function LinkReader({
  idea,
  onRead,
}: {
  idea: string;
  /** Fired after a successful read, so the caller can refresh knowledge. */
  onRead?: (pages: LinkRead[]) => void;
}) {
  const { toast } = useToast();
  const [results, setResults] = useState<Result[]>([]);
  const [reading, setReading] = useState<string[]>([]);

  // Every address already sent, whether or not it came back. A link that
  // failed is not sent again on the next keystroke; the Try again button
  // below is what puts one back in the queue.
  const [attempted, setAttempted] = useState<string[]>([]);

  const urls = findUrls(idea);
  const queue = urls.filter((url) => !attempted.includes(url)).join("\n");

  // Kept current in an effect rather than read out of the closure below, so
  // that a parent re-render cannot restart the wait and leave a link unread
  // while the creator keeps typing.
  const onReadRef = useRef(onRead);
  const toastRef = useRef(toast);
  useEffect(() => {
    onReadRef.current = onRead;
    toastRef.current = toast;
  });

  const run = useRef(async (targets: string[]) => {
    setAttempted((current) => [...current, ...targets]);
    setReading((current) => [...current, ...targets]);
    try {
      const pages = await readLinks(targets);
      // The backend answers in the order it was asked, one entry per link,
      // reporting a page it could not read rather than dropping it.
      setResults((current) => [
        ...current,
        ...targets.flatMap((requested, index) =>
          pages[index] ? [{ requested, page: pages[index] }] : []
        ),
      ]);
      onReadRef.current?.(pages);

      const failed = pages.filter((page) => page.error);
      if (pages.length > 0 && failed.length === pages.length) {
        toastRef.current({
          variant: "destructive",
          title:
            pages.length === 1 ? "Couldn't read that link" : "Couldn't read those links",
          description: failed[0]?.error ?? undefined,
        });
      }
    } catch (err) {
      // The request itself never landed, so there is no page to show it
      // against. Reported inline all the same: a toast is gone by the time
      // the creator looks back at the link.
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setResults((current) => [
        ...current,
        ...targets.map((requested) => ({
          requested,
          page: {
            url: requested,
            title: requested,
            topic: null,
            audience: null,
            takeaways: [],
            call_to_action: null,
            characters: 0,
            saved_as_knowledge: false,
            error: message,
          },
        })),
      ]);
    } finally {
      setReading((current) => current.filter((url) => !targets.includes(url)));
    }
  });

  useEffect(() => {
    if (!queue) return;
    const targets = queue.split("\n");
    // Only the wait is called off when the idea changes. A read already in
    // flight is left to finish: it is still the page the creator pasted, and
    // a slow site can take most of twenty seconds to answer.
    const timer = setTimeout(() => void run.current(targets), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [queue]);

  if (urls.length === 0) return null;

  function readAgain(requested: string) {
    setAttempted((current) => current.filter((url) => url !== requested));
    setResults((current) => current.filter((result) => result.requested !== requested));
  }

  return (
    <div className="space-y-3">
      {reading.map((url) => (
        <Card key={url} className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 p-4" role="status">
            <Spinner className="size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Reading this page</p>
              <p className="truncate text-xs text-muted-foreground">{url}</p>
            </div>
          </CardContent>
        </Card>
      ))}

      {results
        .filter((result) => urls.includes(result.requested))
        .map(({ requested, page }) => (
          <Card key={requested}>
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
                <div className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-2">
                    <AlertTriangle
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-foreground">{page.error}</p>
                  </div>
                  {/*
                    The one button worth keeping. It is not asking permission
                    to read the link - it is the only way back from a site
                    that did not answer the first time.
                  */}
                  <Button
                    className="shrink-0"
                    variant="secondary"
                    size="sm"
                    onClick={() => readAgain(requested)}
                  >
                    <RotateCw className="size-3" aria-hidden="true" />
                    Try again
                  </Button>
                </div>
              ) : (
                <>
                  {page.topic && <p className="text-sm text-foreground">{page.topic}</p>}
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
