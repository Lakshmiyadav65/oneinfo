"use client";

import { useEffect, useRef, useState } from "react";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  deleteFaceImage,
  getFaceSetup,
  grantFaceConsent,
  revokeFaceConsent,
  uploadFaceImage,
} from "@/lib/api/creator-face";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import type { FaceSetup } from "@/types/creator-face";

/**
 * Asks for the creator's photos in the create flow, and handles the whole
 * thing here: upload, remove, consent. No trip to Settings — being asked
 * for a photo and then sent somewhere else to provide it is not being
 * asked for a photo.
 *
 * Renders in every state, including failure. An earlier version returned
 * null when the fetch failed, which made the entire feature disappear with
 * no explanation — the worst possible outcome for the one component whose
 * job is to be noticed.
 */

/**
 * Reference photos need the auth header, so a bare <img src> can't fetch
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
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      {/* Object URL from an authed fetch: next/image can't handle a blob
          URL, and there is nothing to optimise for a 64px local preview. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={alt} className="h-full w-full object-cover" />}
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

  const setup = local ?? (query.status === "success" ? query.data : null);
  const loading = query.status === "loading" && local === null;

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
    // Cleared straight away so re-picking the same file still fires onChange.
    event.target.value = "";
    if (!file) return;
    await run(() => uploadFaceImage(file), "Couldn't add that photo");
  }

  const images = setup?.images ?? [];
  const maxImages = setup?.max_images ?? 3;
  const consent = setup?.consent_granted ?? false;
  const ready = setup?.ready_for_generation ?? false;
  const canAddMore = images.length < maxImages;

  return (
    <Card className={ready ? "border-border" : "border-primary/25 bg-primary/5"}>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">
            {ready ? "You'll be able to appear in this video" : "Want to be in this video?"}
          </p>
          {ready && <Badge variant="success">Ready</Badge>}
          {loading && <Spinner className="h-3.5 w-3.5" />}
        </div>

        <p className="text-sm text-muted-foreground">
          {images.length === 0
            ? "Upload a photo of yourself and you can present the video, instead of a stranger."
            : `${images.length} of ${maxImages} photos added. Two or three give a much better likeness than one.`}
        </p>

        <div className="flex flex-wrap items-start gap-3">
          {images.map((image) => (
            <div key={image.id} className="space-y-1">
              <FaceThumb
                faceId={image.id}
                alt={image.position === 0 ? "Your primary reference photo" : "Reference photo"}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => deleteFaceImage(image.id), "Couldn't remove that photo")
                }
                className="block w-16 text-center text-[11px] text-muted-foreground underline hover:text-destructive disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}

          {canAddMore && (
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-xl text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-50"
              aria-label="Add a photo"
            >
              +
            </button>
          )}
        </div>

        {canAddMore && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} isLoading={busy} onClick={() => fileInput.current?.click()}>
              {images.length === 0 ? "Upload a photo" : "Add another photo"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Front-facing, well lit, just you. JPEG or PNG. Wear what you want to
              appear in — your outfit is copied into the video.
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

        {images.length > 0 && (
          <label className="flex items-start gap-2.5 border-t border-border pt-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={consent}
              disabled={busy}
              onChange={(event) =>
                void run(
                  () => (event.target.checked ? grantFaceConsent() : revokeFaceConsent()),
                  "Couldn't update that"
                )
              }
            />
            <span className="text-xs text-foreground">
              I agree to my likeness being used to generate videos of me, and confirm
              these photos are of me.
            </span>
          </label>
        )}
      </CardContent>
    </Card>
  );
}
