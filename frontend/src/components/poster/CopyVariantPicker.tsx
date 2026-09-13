"use client";

import { RefreshCw } from "lucide-react";
import type { PosterSize } from "@/types/poster";
import type { CopyOption } from "@/lib/poster/copy";
import { fitsPoster } from "@/lib/poster/copy";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils/cn";

/**
 * Three ways to say it, and the one they picked stays editable.
 *
 * Generated copy is a starting point, not an answer - the owner knows their
 * shop and will want to change a word. So the selected option is editable in
 * place rather than behind a "customise" step, and an overlong headline gets a
 * quiet note instead of being blocked or silently cut (cutting mid-word can
 * split a Telugu conjunct and render a broken glyph).
 */
export function CopyVariantPicker({
  options,
  selectedId,
  size,
  loading,
  onSelect,
  onEdit,
  onReshuffle,
}: {
  options: CopyOption[];
  selectedId: string | null;
  size: PosterSize;
  loading: boolean;
  onSelect: (id: string) => void;
  onEdit: (patch: { headline?: string; subline?: string }) => void;
  onReshuffle: () => void;
}) {
  const selected = options.find((o) => o.id === selectedId) ?? options[0] ?? null;

  if (loading && options.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        Writing a few options…
      </div>
    );
  }

  if (!selected) return null;

  const tooLong = !fitsPoster(selected.headline, size);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">The words</p>
        <Button type="button" variant="ghost" size="sm" onClick={onReshuffle} isLoading={loading}>
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Try other words
        </Button>
      </div>

      <div className="grid gap-2" role="radiogroup" aria-label="Choose the wording">
        {options.map((option) => {
          const active = option.id === selected.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(option.id)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-ring hover:bg-muted/50"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{option.headline}</span>
                <Badge variant={active ? "info" : "default"}>{option.angle_label}</Badge>
                {option.fallback_language && (
                  <Badge variant="warning">In English</Badge>
                )}
              </span>
              {option.subline && (
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.subline}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <div className="space-y-1.5">
          <Label htmlFor="copy-headline">Headline</Label>
          <Input
            id="copy-headline"
            value={selected.headline}
            invalid={tooLong}
            onChange={(e) => onEdit({ headline: e.target.value })}
          />
          {tooLong && (
            <p className="text-xs text-warning">
              This is long for a {size === "story" ? "status" : "post"} — it will be set smaller to
              fit.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="copy-subline">Second line</Label>
          <Input
            id="copy-subline"
            value={selected.subline}
            onChange={(e) => onEdit({ subline: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
