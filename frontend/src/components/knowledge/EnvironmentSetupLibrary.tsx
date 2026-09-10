"use client";

import { Camera, Star, Trash2 } from "lucide-react";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  deleteEnvironmentSetup,
  listEnvironmentSetups,
  updateEnvironmentSetup,
} from "@/lib/api/environment-setups";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { presetLabel } from "@/types/environment";
import type { EnvironmentSetupRecord } from "@/types/environment-setup";

/**
 * The creator's saved filming setups, listed under My Knowledge.
 *
 * Read-only on this page by design. A setup is built in the storyboard,
 * where its effect is visible on the scenes it applies to; editing camera
 * angles here, with nothing to see them against, would be guesswork. What
 * this page is for is seeing what you have, choosing the one new videos
 * start from, and throwing away the ones you don't use.
 */
export function EnvironmentSetupLibrary() {
  const { toast } = useToast();
  const setups = useAsyncData(listEnvironmentSetups);

  async function handleMakeDefault(setup: EnvironmentSetupRecord) {
    try {
      await updateEnvironmentSetup(setup.id, { isDefault: !setup.is_default });
      toast({
        title: setup.is_default ? `"${setup.name}" is no longer your usual` : `Using "${setup.name}"`,
        description: setup.is_default
          ? "New videos will start from the built-in default."
          : "New videos will start from this setup.",
      });
      setups.retry();
    } catch {
      toast({ variant: "destructive", title: "Couldn't change that", description: "Please try again." });
    }
  }

  async function handleDelete(setup: EnvironmentSetupRecord) {
    try {
      await deleteEnvironmentSetup(setup.id);
      // Said explicitly because removing something from a library reads as
      // destructive, and the videos built from it genuinely are not touched.
      toast({
        title: `Removed "${setup.name}"`,
        description: "Videos already using it are unchanged.",
      });
      setups.retry();
    } catch {
      toast({ variant: "destructive", title: "Couldn't remove that", description: "Please try again." });
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">Environment Setup</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Looks you&apos;ve saved: the set, camera, lighting and style a video is filmed
          with. Save one from the Storyboard step, then reuse it on any video.
        </p>
      </div>

      {setups.status === "loading" && <Skeleton className="h-14 w-full" />}

      {setups.status === "success" && setups.data.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Camera className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No setups saved yet. Build one in a video&apos;s Storyboard step and save it there.
            </p>
          </CardContent>
        </Card>
      )}

      {setups.status === "success" &&
        setups.data.map((setup) => (
          <Card key={setup.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{setup.name}</p>
                <p className="text-xs text-muted-foreground">
                  {presetLabel(setup.environment.preset)}
                  {setup.description ? ` — ${setup.description}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {setup.is_default && <Badge variant="success">Used for new videos</Badge>}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleMakeDefault(setup)}
                  aria-label={
                    setup.is_default
                      ? `Stop using ${setup.name} for new videos`
                      : `Use ${setup.name} for new videos`
                  }
                >
                  <Star className={setup.is_default ? "size-4 fill-current" : "size-4"} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDelete(setup)}
                  aria-label={`Remove ${setup.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
    </section>
  );
}
