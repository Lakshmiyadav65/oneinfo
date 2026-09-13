"use client";

import { useEffect, useState } from "react";
import { Copy, Download, Share2 } from "lucide-react";
import type { PosterOutput } from "@/lib/poster/export";
import { canSharePoster, copyImage, copyText, sharePoster } from "@/lib/poster/export";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";

/**
 * Getting the poster out.
 *
 * The download is a real `<a download>` bound to a blob that already exists,
 * not a button that renders one when clicked. On iOS, awaiting anything inside
 * a click handler spends the user-gesture window and the download is silently
 * refused - and a real anchor also gets keyboard, screen reader and
 * long-press-to-save for free.
 *
 * Instagram has no way to post from a browser. That is said in a sentence
 * rather than hidden behind a button that goes nowhere.
 */
export function ShareSheet({
  open,
  output,
  building,
  caption,
  hashtags,
  title,
  onOpenChange,
}: {
  open: boolean;
  output: PosterOutput | null;
  building: boolean;
  caption: string;
  hashtags: string[];
  title: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [href, setHref] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [sharing, setSharing] = useState(false);

  const fullCaption = [caption, hashtags.join(" ")].filter(Boolean).join("\n\n");

  // One object URL per blob, revoked when it is replaced or the sheet closes.
  useEffect(() => {
    if (!output) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHref(null);
      return;
    }
    // An external resource created here and torn down on cleanup; holding it
    // in state is how it reaches the anchor.
    const url = URL.createObjectURL(output.blob);
    setHref(url);
    return () => URL.revokeObjectURL(url);
  }, [output]);

  // Feature-detected in an effect, never during render: `navigator` does not
  // exist on the server, and reading it in render is a hydration mismatch.
  useEffect(() => {
    // Feature detection reads `navigator`, which does not exist on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(output ? canSharePoster(output) : false);
  }, [output]);

  const onShare = async () => {
    if (!output) return;
    setSharing(true);
    // Copied first and regardless. iOS drops the text when files are attached
    // in most targets, so without this the poster arrives with no caption.
    const copied = await copyText(fullCaption);
    const result = await sharePoster(output, fullCaption, title);
    setSharing(false);

    if (result === "shared") {
      toast({
        variant: "success",
        title: "Shared",
        description: copied ? "The caption is on your clipboard — paste it in the app." : undefined,
      });
    } else if (result === "failed") {
      toast({ variant: "destructive", title: "That couldn't be shared", description: "Download it instead." });
    }
    // "cancelled" says nothing: dismissing the sheet is the most common way it
    // ends, and a toast every time would be noise.
  };

  const onCopyCaption = async () => {
    const ok = await copyText(fullCaption);
    toast(
      ok
        ? { variant: "success", title: "Caption copied" }
        : {
            variant: "destructive",
            title: "Couldn't copy",
            description: "Select the caption below and copy it by hand.",
          }
    );
  };

  const onCopyImage = async () => {
    if (!output) return;
    const ok = await copyImage(output);
    toast(
      ok
        ? { variant: "success", title: "Poster copied", description: "Paste it straight into WhatsApp Web." }
        : { variant: "destructive", title: "This browser can't copy images", description: "Download it instead." }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Your poster is ready</DialogTitle>
          <DialogDescription>
            {output
              ? `${output.width} × ${output.height} · ${output.type.replace("image/", "").toUpperCase()}`
              : "Preparing the file…"}
          </DialogDescription>
        </DialogHeader>

        {building || !output || !href ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Drawing it at full size…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={href} download={output.filename}>
                  <Download aria-hidden="true" className="size-4" />
                  Download
                </a>
              </Button>

              {canShare && (
                <Button variant="secondary" onClick={() => void onShare()} isLoading={sharing}>
                  <Share2 aria-hidden="true" className="size-4" />
                  Share
                </Button>
              )}

              <Button variant="secondary" onClick={() => void onCopyCaption()}>
                <Copy aria-hidden="true" className="size-4" />
                Copy caption
              </Button>

              <Button variant="ghost" onClick={() => void onCopyImage()}>
                Copy image
              </Button>
            </div>

            {!canShare && (
              <p className="text-xs text-muted-foreground">
                Sharing straight to an app only works on a phone. Download the poster and
                the caption here, then post it from WhatsApp or Instagram.
              </p>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Caption</p>
              <Textarea readOnly rows={6} value={fullCaption} className="text-xs" />
            </div>

            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Instagram doesn&apos;t allow posting from a browser. Save the image, then open
              Instagram and paste the caption.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
