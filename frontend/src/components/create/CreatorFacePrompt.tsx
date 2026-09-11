"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Video } from "lucide-react";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  deleteFaceImage,
  getFaceSetup,
  grantFaceConsent,
  uploadFaceImage,
} from "@/lib/api/creator-face";
import { api } from "@/lib/api/client";
import { AvatarCaptureDialog } from "@/components/create/AvatarCaptureDialog";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import type { FaceSetup } from "@/types/creator-face";

/**
 * The offer to appear in your own video, made where it matters.
 *
 * This is the single entry point to building an avatar. It deliberately does
 * not live in Settings: a creator who is about to make a video is the only
 * person who cares, and a feature this good is wasted behind a gear icon.
 *
 * Renders in every state, including failure. An earlier version returned
 * null when the fetch failed, which made the entire feature disappear with
 * no explanation - the worst possible outcome for the one component whose
 * job is to be noticed.
 */

/**
 * Reference frames need the auth header, so a bare <img src> can't fetch
 * them. Pull the bytes and hand the tag an object URL instead.
 */
function FaceThumb({ faceId, alt }: { faceId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    api
      .getBlob(`/creators/me/face/${faceId}/file`)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [faceId]);

  return (
    <div className="size-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      {/* Object URL from an authed fetch: next/image can't handle a blob
          URL, and there is nothing to optimise for a 64px local preview. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={alt} className="size-full object-cover" />}
    </div>
  );
}

export function CreatorFacePrompt({ onChange }: { onChange?: () => void }) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const query = useAsyncData(() => getFaceSetup(), []);
  // Local copy wins after a change, so the card updates without a refetch
  // round trip and without losing what it already had on a failed reload.
  const [local, setLocal] = useState<FaceSetup | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const setup = local ?? (query.status === "success" ? query.data : null);
  const loading = query.status === "loading" && local === null;

  async function refresh() {
    setLocal(await getFaceSetup());
    onChange?.();
  }

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await action();
      await refresh();
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
    // Cleared straight away so re-picking the same file still fires onChange.
    event.target.value = "";
    if (!file) return;
    await run(async () => {
      await uploadFaceImage(file);
      // A photo is no use without the agreement, and someone who just picked
      // a picture of themselves has already made the decision. Asking for it
      // as a separate tick afterwards is asking twice.
      if (!setup?.consent_granted) await grantFaceConsent();
    }, "Couldn't add that photo");
  }

  const images = setup?.images ?? [];
  const ready = setup?.ready_for_generation ?? false;
  const recorded = images.some((image) => image.angle !== null);

  return (
    <Card className={ready ? "border-border" : "border-primary/30 bg-primary/5"}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="size-4.5" />
            </span>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {ready ? "You can appear in this video" : "Put yourself in this video"}
                {ready && <Badge variant="success">Ready</Badge>}
                {loading && <Spinner className="size-3.5" />}
              </p>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                {recorded
                  ? "Your avatar is recorded. Scenes you mark as on-camera will show you, not a stranger."
                  : "Record yourself once, turning your head, and the video model can put you on camera in any scene. It takes about twenty seconds."}
              </p>
            </div>
          </div>
        </div>

        {images.length > 0 && (
          <div className="flex flex-wrap items-start gap-3">
            {images.map((image) => (
              <div key={image.id} className="space-y-1">
                <FaceThumb
                  faceId={image.id}
                  alt={image.angle ? `Your ${image.angle} reference frame` : "Reference photo"}
                />
                <p className="w-16 text-center text-[11px] capitalize text-muted-foreground">
                  {image.angle ?? (image.position === 0 ? "Primary" : "Photo")}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => deleteFaceImage(image.id), "Couldn't remove that")}
                  className="block w-16 text-center text-[11px] text-muted-foreground underline hover:text-destructive disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={busy} onClick={() => setCapturing(true)}>
            <Video className="size-4" />
            {recorded ? "Record again" : "Record your avatar"}
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
          >
            No camera? Upload a photo instead
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(event) => void handleFile(event)}
        />

        <AvatarCaptureDialog
          open={capturing}
          onOpenChange={setCapturing}
          consentGranted={setup?.consent_granted ?? false}
          onSaved={() => void refresh()}
        />
      </CardContent>
    </Card>
  );
}
