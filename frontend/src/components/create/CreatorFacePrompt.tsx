"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  getFaceSetup,
  grantFaceConsent,
  uploadFaceImage,
} from "@/lib/api/creator-face";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { FaceSetup } from "@/types/creator-face";

/**
 * Asks for the creator's photo where the video actually gets made, instead
 * of sending them to Settings to find it.
 *
 * Deliberately renders in every state, including "already set up". Hiding it
 * once configured leaves no way to tell whether you're going to be in the
 * video, and no way to change your mind without leaving the flow.
 */
export function CreatorFacePrompt({ onChange }: { onChange?: () => void }) {
  const { toast } = useToast();
  const query = useAsyncData(() => getFaceSetup(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState<FaceSetup | null>(null);
  const [busy, setBusy] = useState(false);

  const data = local ?? (query.status === "success" ? query.data : null);

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await action();
      setLocal(await getFaceSetup());
      onChange?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: failure,
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(() => uploadFaceImage(file), "Couldn't add that photo");
  }

  if (query.status === "loading") return <Skeleton className="h-28 w-full" />;
  // A failure here shouldn't block making a video — this is an optional extra.
  if (query.status === "error" || !data) return null;

  const hasPhotos = data.images.length > 0;
  const ready = data.ready_for_generation;

  return (
    <Card className={ready ? "border-border" : "border-primary/25 bg-primary/5"}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                {ready ? "You can appear in this video" : "Want to be in this video?"}
              </p>
              {ready && <Badge variant="success">Ready</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {ready
                ? `${data.images.length} reference photo${data.images.length === 1 ? "" : "s"} on file. Choose which scenes you're on camera in at the storyboard step.`
                : hasPhotos
                  ? "Your photo is uploaded — just confirm you're happy for it to be used."
                  : "Add a photo of yourself and you can present the video, instead of a stranger."}
            </p>
          </div>
        </div>

        {!hasPhotos && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy}
              isLoading={busy}
              onClick={() => fileInput.current?.click()}
            >
              Upload a photo
            </Button>
            <span className="text-xs text-muted-foreground">
              Front-facing, well lit, just you. JPEG or PNG.
            </span>
          </div>
        )}

        {hasPhotos && !data.consent_granted && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy}
              isLoading={busy}
              onClick={() => void run(grantFaceConsent, "Couldn't save that")}
            >
              I agree to my likeness being used
            </Button>
            <span className="text-xs text-muted-foreground">
              Required before you can appear on camera.
            </span>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(event) => void handleFile(event)}
        />

        <p className="text-xs text-muted-foreground">
          {ready
            ? "Add more photos or withdraw consent in "
            : "You can add up to 3 photos — two or three give a much better likeness. Manage them in "}
          <Link href="/settings" className="underline hover:text-foreground">
            Settings
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
