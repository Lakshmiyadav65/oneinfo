"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Save, Share2 } from "lucide-react";
import {
  DEFAULT_BRIEF,
  type PosterBrief,
  type PosterCopy,
  type PosterPost,
  type PosterSize,
  type PosterStyle,
} from "@/types/poster";
import { occasionById, occasionDate } from "@/lib/poster/occasions";
import { captionFor, hashtagsFor, writeCopy, type CopyOption } from "@/lib/poster/copy";
import { buildDesign } from "@/lib/poster/design";
import { renderPosterToBlob, renderThumbnail, type PosterOutput } from "@/lib/poster/export";
import { loadDraft, saveDraft } from "@/lib/poster/storage";
import { useBrandProfile } from "@/hooks/useBrandProfile";
import { usePosterLibrary } from "@/hooks/usePosterLibrary";
import { BriefForm } from "@/components/poster/BriefForm";
import { BrandKitForm } from "@/components/poster/BrandKitForm";
import { CopyVariantPicker } from "@/components/poster/CopyVariantPicker";
import { PosterPreview } from "@/components/poster/PosterPreview";
import { ShareSheet } from "@/components/poster/ShareSheet";
import { StyleSizePicker } from "@/components/poster/StyleSizePicker";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";

type Draft = {
  brief: PosterBrief;
  style: PosterStyle;
  size: PosterSize;
  edits: { headline?: string; subline?: string };
  variantId: string | null;
};

const DEFAULT_DRAFT: Draft = {
  brief: DEFAULT_BRIEF,
  style: "bold_offer",
  size: "square",
  edits: {},
  variantId: null,
};

/**
 * Making a poster: one screen, two columns.
 *
 * Deliberately not a wizard. The video flow is stepped because each step there
 * costs a model call that cannot be taken back; here every input is instant
 * and free, so steps would only hide the preview that makes the choices mean
 * anything. Someone should be able to type an offer and watch the poster
 * change as they do.
 */
export function PosterComposer({
  postId,
  prefill,
}: {
  /** Set when reopening a saved poster; null while it is still a draft. */
  postId: string | null;
  prefill?: Partial<PosterBrief> & { style?: PosterStyle };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { brand, setBrand, save: saveBrand, loaded: brandLoaded, hasBrand } = useBrandProfile();
  const library = usePosterLibrary();

  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("");
  const [options, setOptions] = useState<CopyOption[]>([]);
  const [writing, setWriting] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(postId);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [output, setOutput] = useState<PosterOutput | null>(null);
  const [building, setBuilding] = useState(false);

  // Read once, on mount. Storage does not exist on the server and reading it
  // during render would make the first client render disagree with the HTML.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));

    if (postId) {
      const post = library.status === "success" ? library.data.find((p) => p.id === postId) : null;
      if (post) {
        setDraft({
          brief: post.brief,
          style: post.style,
          size: post.size,
          edits: { headline: post.copy.headline, subline: post.copy.subline },
          variantId: post.copy_variant_id,
        });
        setReady(true);
      }
      return;
    }

    const stored = loadDraft<Draft>();
    setDraft({
      ...DEFAULT_DRAFT,
      ...(stored ?? {}),
      brief: { ...DEFAULT_BRIEF, ...(stored?.brief ?? {}), ...(prefill ?? {}) },
      ...(prefill?.style ? { style: prefill.style } : {}),
    });
    setReady(true);
    // Runs once. `library` settles after this and is read again below when a
    // saved poster is being reopened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A saved poster may not be in the library yet on the first pass.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!postId || ready || library.status !== "success") return;
    const post = library.data.find((p) => p.id === postId);
    if (!post) return;
    setDraft({
      brief: post.brief,
      style: post.style,
      size: post.size,
      edits: { headline: post.copy.headline, subline: post.copy.subline },
      variantId: post.copy_variant_id,
    });
    setReady(true);
  }, [postId, ready, library]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const occasion = draft.brief.occasion_id ? occasionById(draft.brief.occasion_id) : null;

  // What the copywriter actually reads. Serialised so the effect fires on a
  // real change rather than on every render of a new object identity.
  const copyKey = JSON.stringify([
    draft.brief.occasion_id,
    draft.brief.kind,
    draft.brief.subject,
    draft.brief.details,
    draft.brief.offer,
    draft.brief.valid_until,
    draft.brief.cta,
    draft.brief.headline_input,
    brand.shop_name,
    brand.category,
    brand.language,
    draft.size,
    nonce,
  ]);

  useEffect(() => {
    if (!ready || !brandLoaded) return;
    const controller = new AbortController();
    // Writing copy is an async call to something outside React - local today,
    // a model later. The spinner has to be raised before it starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWriting(true);
    writeCopy({
      brief: draft.brief,
      occasion,
      brand,
      language: brand.language,
      size: draft.size,
      seed: String(nonce),
      signal: controller.signal,
    })
      .then((next) => {
        if (controller.signal.aborted) return;
        setOptions(next);
        setDraft((d) => ({
          ...d,
          variantId: next.some((o) => o.id === d.variantId) ? d.variantId : (next[0]?.id ?? null),
        }));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          toast({ variant: "destructive", title: "We couldn't write the words for this one" });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setWriting(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyKey, ready, brandLoaded]);

  // Autosaved so a refresh does not lose typing - but kept out of the library,
  // because a grid of abandoned drafts is worse than losing them.
  useEffect(() => {
    if (!ready || postId) return;
    const timer = setTimeout(() => saveDraft(draft), 500);
    return () => clearTimeout(timer);
  }, [draft, ready, postId]);

  const selected = options.find((o) => o.id === draft.variantId) ?? options[0] ?? null;

  const copy: PosterCopy | null = useMemo(() => {
    if (!selected) return null;
    const headline = draft.edits.headline ?? selected.headline;
    const subline = draft.edits.subline ?? selected.subline;
    return {
      headline,
      subline,
      cta_label: selected.cta_label,
      // Rebuilt from the edited words rather than reused, so a headline they
      // changed by hand is the one that ends up in the caption too.
      caption: captionFor({ headline, subline }, brand, draft.brief),
      hashtags: hashtagsFor(occasion, brand),
    };
  }, [selected, draft.edits, draft.brief, brand, occasion]);

  const design = useMemo(() => {
    if (!copy) return null;
    return buildDesign({
      brief: draft.brief,
      copy,
      brand,
      style: draft.style,
      size: draft.size,
      language: brand.language,
      occasion,
    });
  }, [copy, draft.brief, draft.style, draft.size, brand, occasion]);

  // Set once a draft has been written under a real id, so the URL can be
  // swapped over at a moment that does not tear the screen down.
  const pendingNavigation = useRef<string | null>(null);

  const persist = useCallback(
    async (opts: { navigate?: boolean } = {}): Promise<string | null> => {
      if (!design || !copy) return null;
      const id = savedId ?? crypto.randomUUID();
      const now = new Date().toISOString();
      const existing = library.status === "success" ? library.data.find((p) => p.id === id) : null;

      const post: PosterPost = {
        id,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        occasion_date: occasion && today ? occasionDate(occasion, Number(today.slice(0, 4))) : null,
        brief: draft.brief,
        style: draft.style,
        size: draft.size,
        language: brand.language,
        copy,
        copy_variant_id: draft.variantId ?? "",
        design,
        thumbnail_data_url: await renderThumbnail(design),
      };

      const result = library.save(post);
      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "This poster couldn't be saved",
          description:
            result.reason === "quota"
              ? "Your browser is out of space. Delete a few older posters and try again."
              : "You can still download it — it just won't be kept on this device.",
        });
        return null;
      }

      if (!savedId) {
        setSavedId(id);
        saveDraft(null);
        // The URL becomes the identity from here on, so a refresh reopens the
        // saved poster rather than a draft of it. But /posters/new and
        // /posters/<id> are different routes, so replacing the URL unmounts
        // this component - and anything it is currently showing. Doing that
        // the instant the poster finishes rendering would yank the share sheet
        // off the screen just as the Download button appeared in it.
        if (opts.navigate === false) pendingNavigation.current = id;
        else router.replace(`/posters/${id}`);
      }
      return id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design, copy, savedId, library, draft, brand, occasion, today]
  );

  const buildingRef = useRef(false);
  const openShare = async () => {
    if (!design || buildingRef.current) return;
    // The dialog opens on the click itself. Everything slow happens behind it,
    // and the download is then a real anchor the owner clicks separately -
    // which is what keeps it working on iOS, where an await inside a click
    // handler spends the gesture and the download is refused.
    setSheetOpen(true);
    setBuilding(true);
    buildingRef.current = true;
    setOutput(null);
    try {
      const built = await renderPosterToBlob(design);
      setOutput(built);
      // Saved now, but the URL waits until the sheet is closed.
      void persist({ navigate: false });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "The poster couldn't be saved as an image",
        description: err instanceof Error ? err.message : undefined,
      });
      setSheetOpen(false);
    } finally {
      setBuilding(false);
      buildingRef.current = false;
    }
  };

  if (!ready || !brandLoaded) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-96 w-full rounded-xl" />
        <Skeleton className="aspect-square w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Preview first in the DOM on small screens, so it is visible above the
          form while typing rather than a scroll away below it. */}
      <div className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-4 lg:self-start">
        <PosterPreview design={design} />

        <CopyVariantPicker
          options={options}
          selectedId={draft.variantId}
          size={draft.size}
          loading={writing}
          onSelect={(id) => setDraft((d) => ({ ...d, variantId: id, edits: {} }))}
          onEdit={(patch) => setDraft((d) => ({ ...d, edits: { ...d.edits, ...patch } }))}
          onReshuffle={() => {
            setDraft((d) => ({ ...d, edits: {} }));
            setNonce((n) => n + 1);
          }}
        />
      </div>

      <div className="order-2 space-y-6 lg:order-1">
        <Card>
          <CardContent className="pt-5">
            <BriefForm
              brief={draft.brief}
              category={brand.category}
              today={today}
              onChange={(brief) => setDraft((d) => ({ ...d, brief }))}
            />
          </CardContent>
        </Card>

        {hasBrand ? (
          <Disclosure
            title="Your shop details"
            summary={`${brand.shop_name}${brand.phone ? ` · ${brand.phone}` : ""}`}
          >
            <BrandKitForm brand={brand} onChange={setBrand} onSave={saveBrand} />
          </Disclosure>
        ) : (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Your shop</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Asked once. Every poster after this one carries it automatically.
                </p>
              </div>
              <BrandKitForm brand={brand} onChange={setBrand} onSave={saveBrand} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-5">
            <StyleSizePicker
              style={draft.style}
              size={draft.size}
              onStyle={(style) => setDraft((d) => ({ ...d, style }))}
              onSize={(size) => setDraft((d) => ({ ...d, size }))}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {hasBrand ? (
            <Button onClick={() => void openShare()} disabled={!design}>
              <Download aria-hidden="true" className="size-4" />
              Download or share
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A span, because a disabled button does not fire the hover
                    that opens the tooltip explaining why it is disabled. */}
                <span className="inline-flex">
                  <Button disabled>
                    <Share2 aria-hidden="true" className="size-4" />
                    Download or share
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Add your shop name first</TooltipContent>
            </Tooltip>
          )}

          <Button
            variant="secondary"
            disabled={!design}
            onClick={async () => {
              const id = await persist();
              if (id) toast({ variant: "success", title: "Saved to your posters" });
            }}
          >
            <Save aria-hidden="true" className="size-4" />
            Save for later
          </Button>
        </div>
      </div>

      <ShareSheet
        open={sheetOpen}
        output={output}
        building={building}
        caption={copy?.caption ?? ""}
        hashtags={copy?.hashtags ?? []}
        title={copy?.headline ?? "Poster"}
        onOpenChange={(next) => {
          setSheetOpen(next);
          if (!next && pendingNavigation.current) {
            const id = pendingNavigation.current;
            pendingNavigation.current = null;
            router.replace(`/posters/${id}`);
          }
        }}
      />
    </div>
  );
}
