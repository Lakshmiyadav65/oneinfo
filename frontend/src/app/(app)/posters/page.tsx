"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Pencil, Sparkles, Tag } from "lucide-react";
import { categoryLabel, type PosterPost } from "@/types/poster";
import { daysUntilLabel, shortDate, upcomingOccasions } from "@/lib/poster/occasions";
import { saveDraft } from "@/lib/poster/storage";
import { useBrandProfile } from "@/hooks/useBrandProfile";
import { usePosterLibrary } from "@/hooks/usePosterLibrary";
import { BrandKitForm } from "@/components/poster/BrandKitForm";
import { PosterTabs } from "@/components/poster/PosterTabs";
import { PosterTile } from "@/components/poster/PosterTile";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

/**
 * Everything the shop has made, and the quickest way to make the next one.
 *
 * "Make a post" sits above the grid rather than below it, because it is what
 * someone came here to do - an entry point under an empty grid is an entry
 * point nobody finds. The next few festivals sit beside it so the value of the
 * calendar is visible on the first visit, before anyone has opened it.
 */
export default function PostersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const library = usePosterLibrary();
  const { brand, setBrand, save: saveBrand, loaded, hasBrand } = useBrandProfile();
  const [editingBrand, setEditingBrand] = useState(false);
  const [today, setToday] = useState("");

  // Read after mount: the viewer's clock is the only one that matters here,
  // and the server does not have it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(new Date().toISOString().slice(0, 10));
  }, []);

  const upcoming = today ? upcomingOccasions(today, brand.category, 3) : [];
  const posts = library.status === "success" ? library.data : [];

  /** Opens the composer pre-loaded with a copy of an existing poster. */
  const duplicate = (post: PosterPost) => {
    saveDraft({
      brief: post.brief,
      style: post.style,
      size: post.size,
      edits: {},
      variantId: null,
    });
    router.push("/posters/new");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Posters</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Offers, festival specials and announcements — ready to send to WhatsApp and
          Instagram in about a minute.
        </p>
      </div>

      <PosterTabs />

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/posters/new?kind=offer">
                <Tag aria-hidden="true" className="size-4" />
                An offer
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/posters/new?kind=festival">
                <Sparkles aria-hidden="true" className="size-4" />
                A festival offer
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/posters/new?kind=announcement">
                <Pencil aria-hidden="true" className="size-4" />
                An announcement
              </Link>
            </Button>
          </div>

          {upcoming.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Coming up</p>
              <div className="flex flex-wrap gap-1.5">
                {upcoming.map(({ occasion, date }) => (
                  <Button key={occasion.id} variant="ghost" size="sm" asChild>
                    <Link href={`/posters/new?occasion=${occasion.id}&date=${date}`}>
                      {occasion.name}
                      <span className="text-muted-foreground">
                        {shortDate(date)} · {daysUntilLabel(today, date)}
                      </span>
                    </Link>
                  </Button>
                ))}
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/posters/calendar">
                    <CalendarDays aria-hidden="true" className="size-4" />
                    See the month
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loaded &&
        (hasBrand ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
            <span className="text-sm text-foreground">{brand.shop_name}</span>
            <Badge>{categoryLabel(brand.category)}</Badge>
            {brand.phone && (
              <span className="text-xs text-muted-foreground">{brand.phone}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setEditingBrand(true)}
            >
              Edit
            </Button>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 pt-5">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-foreground">Add your shop details</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Name, number and logo — asked once, then every poster carries them.
                </p>
              </div>
              <Button onClick={() => setEditingBrand(true)}>Add details</Button>
            </CardContent>
          </Card>
        ))}

      {library.ephemeral && (
        <p className="text-xs text-muted-foreground">
          This browser isn&apos;t saving site data, so posters will only last until you
          close the tab. Downloads still work normally.
        </p>
      )}

      {library.status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-xl" />
          ))}
        </div>
      )}

      {library.status === "error" && (
        <ErrorState description={library.message} onRetry={library.retry} />
      )}

      {library.status === "success" && posts.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="No posters yet"
          description="Pick a festival or type your offer — you'll have one in about a minute."
          action={
            <Button asChild>
              <Link href="/posters/new">Make a poster</Link>
            </Button>
          }
        />
      )}

      {posts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {posts.map((post) => (
            <PosterTile
              key={post.id}
              post={post}
              onDuplicate={duplicate}
              onDelete={(id) => {
                const result = library.remove(id);
                if (!result.ok) {
                  toast({ variant: "destructive", title: "That poster couldn't be deleted" });
                }
              }}
            />
          ))}
        </div>
      )}

      {/* The same form the composer shows inline. Never a trip to Settings. */}
      <Dialog open={editingBrand} onOpenChange={setEditingBrand}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your shop</DialogTitle>
            <DialogDescription>
              This goes on every poster. Only the name is required.
            </DialogDescription>
          </DialogHeader>
          <BrandKitForm brand={brand} onChange={setBrand} onSave={saveBrand} />
          <div className="flex justify-end pt-2">
            <Button onClick={() => setEditingBrand(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
