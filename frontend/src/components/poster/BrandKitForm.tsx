"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import {
  BUSINESS_CATEGORIES,
  type BrandProfile,
  type BusinessCategory,
} from "@/types/poster";
import { PROJECT_LANGUAGES, type ProjectLanguage } from "@/types/project";
import { fileToLogoDataUrl } from "@/lib/poster/images";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";

/**
 * The shop, asked for once.
 *
 * This lives inline on the screen where it is first needed rather than behind
 * a link to Settings. Sending someone away to fill in a form and find their
 * way back is how a first poster stops being made at all.
 *
 * Only the shop name is required. Everything else improves the poster and
 * nothing else blocks it.
 */
export function BrandKitForm({
  brand,
  onChange,
  onSave,
}: {
  brand: BrandProfile;
  onChange: (brand: BrandProfile) => void;
  onSave?: (brand: BrandProfile) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const set = (patch: Partial<BrandProfile>) => {
    const next = { ...brand, ...patch };
    onChange(next);
    onSave?.(next);
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      set({ logo_data_url: dataUrl });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "That logo couldn't be added",
        description: err instanceof Error ? err.message : "Please try another image.",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="shop-name">Shop name</Label>
          <Input
            id="shop-name"
            value={brand.shop_name}
            placeholder="Sri Lakshmi Sweets"
            onChange={(e) => set({ shop_name: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="shop-phone">Phone / WhatsApp</Label>
          <Input
            id="shop-phone"
            inputMode="tel"
            value={brand.phone}
            placeholder="98480 12345"
            onChange={(e) =>
              // Most shops give out one number. Kept in step unless the
              // WhatsApp number has been set to something else on purpose.
              set({
                phone: e.target.value,
                whatsapp: brand.whatsapp === brand.phone ? e.target.value : brand.whatsapp,
              })
            }
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="shop-tagline">Tagline (optional)</Label>
          <Input
            id="shop-tagline"
            value={brand.tagline}
            placeholder="Fresh sweets since 1994"
            onChange={(e) => set({ tagline: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">What do you sell?</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Business type">
          {BUSINESS_CATEGORIES.map((category) => (
            <CategoryChip
              key={category.value}
              label={category.label}
              selected={category.value === brand.category}
              onSelect={() => set({ category: category.value as BusinessCategory })}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          This decides which festivals we suggest and how the captions are written.
        </p>
      </div>

      <Segmented<ProjectLanguage>
        label="Write captions in"
        value={brand.language}
        options={PROJECT_LANGUAGES.map((l) => ({ value: l.value, label: l.label, hint: l.hint }))}
        onChange={(language) => set({ language })}
      />

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Logo (optional)</p>
        <div className="flex items-center gap-3">
          {brand.logo_data_url ? (
            <div className="flex items-center gap-3">
              {/* A data URL from the owner's own file: next/image cannot take
                  one, and there is nothing to optimise at 512px. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brand.logo_data_url}
                alt="Your logo"
                className="size-14 rounded-lg border border-border bg-card object-contain p-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set({ logo_data_url: null })}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Remove
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" className="size-4" />
              Add your logo
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => void pickLogo(e.target.files?.[0])}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Your colour (optional)</p>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Brand colour"
            value={brand.brand_color}
            onChange={(e) => set({ brand_color: e.target.value })}
            className="size-9 cursor-pointer rounded-md border border-border bg-card"
          />
          <input
            type="color"
            aria-label="Highlight colour"
            value={brand.accent_color}
            onChange={(e) => set({ accent_color: e.target.value })}
            className="size-9 cursor-pointer rounded-md border border-border bg-card"
          />
          <p className="text-xs text-muted-foreground">
            Used for the offer badge. Leave these alone and each style uses its own.
          </p>
        </div>
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:border-ring hover:bg-muted/50"
      )}
    >
      {label}
    </button>
  );
}
