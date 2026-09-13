"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Download, MoreVertical, Trash2 } from "lucide-react";
import { sizeLabel, summarizePost, type PosterPost } from "@/types/poster";
import { renderPosterToBlob } from "@/lib/poster/export";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";

/**
 * One saved poster.
 *
 * The thumbnail is the stored JPEG when there is one, and a plain card when
 * there is not - a missing thumbnail means the quota was tight when it was
 * saved, which is a reason to show less, not to fail.
 */
export function PosterTile({
  post,
  onDelete,
  onDuplicate,
}: {
  post: PosterPost;
  onDelete: (id: string) => void;
  onDuplicate: (post: PosterPost) => void;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const output = await renderPosterToBlob(post.design);
      const url = URL.createObjectURL(output.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = output.filename;
      anchor.rel = "noopener";
      // Firefox ignores a click on an anchor that is not in the document.
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Not revoked immediately: the download starts asynchronously, and
      // browsers have cancelled downloads whose object URL died first.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast({ variant: "destructive", title: "That poster couldn't be downloaded" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card">
      <Link href={`/posters/${post.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {post.thumbnail_data_url ? (
          // A data URL rendered by us at 320px: there is nothing for next/image
          // to optimise, and it cannot take one anyway.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnail_data_url}
            alt={summarizePost(post)}
            className="aspect-square w-full bg-muted object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-muted/50 p-4 text-center">
            <span className="text-xs text-muted-foreground">
              {post.design.content.headline || "Poster"}
            </span>
          </div>
        )}
      </Link>

      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">
            {post.design.content.headline || post.brief.subject || "Poster"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {summarizePost(post)}
          </p>
        </div>
        <Badge>{sizeLabel(post.size)}</Badge>
      </div>

      <div className="absolute right-2 top-2">
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="Poster actions">
              <MoreVertical aria-hidden="true" className="size-4" />
            </Button>
          </DropdownTrigger>
          <DropdownContent align="end">
            <DropdownItem onSelect={() => void download()} disabled={downloading}>
              <Download aria-hidden="true" className="size-4" />
              Download
            </DropdownItem>
            <DropdownItem onSelect={() => onDuplicate(post)}>
              <Copy aria-hidden="true" className="size-4" />
              Make another like this
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={() => setConfirming(true)}>
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>

      {/* Confirmed, because this is kept on one device with no undo and the
          downloaded file may be the only other copy. */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this poster?</DialogTitle>
            <DialogDescription>
              It is only saved on this device, so this cannot be undone. Any file you
              already downloaded is unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                onDelete(post.id);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
