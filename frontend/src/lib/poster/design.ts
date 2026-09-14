/**
 * Turning what the owner filled in into what the renderer draws.
 *
 * This is the only file outside lib/poster that knows the shape of a
 * `PosterDesign`, which keeps the renderer's contract to one seam: if it
 * changes, this file changes and the composer does not.
 *
 * Three independent choices meet here, and are kept independent on purpose:
 *
 *   What is being posted   decides the layout (offer slab, greeting, news).
 *   The gallery design     decides the look (palette treatment and art).
 *   The owner's photo      replaces the background, keeping the art on top.
 *
 * So any design takes any offer, and any photo sits under any design.
 */

import {
  DEFAULT_BRIEF,
  PHOTO_STRENGTHS,
  hasOffer,
  offerLines,
  type BrandProfile,
  type PosterBackground,
  type PosterBrief,
  type PosterCopy,
  type PosterDesign,
  type PosterPhoto,
  type PosterSize,
  type PosterStyle,
  type PosterTemplateId,
} from "@/types/poster";
import type { ProjectLanguage } from "@/types/project";
import { occasionById, type BusinessBeat, type Occasion } from "@/lib/poster/occasions";
import type { GalleryDesign } from "@/lib/poster/gallery";
import { ctaLabel, validityPhrase } from "@/lib/poster/copy";
import { backgroundFor, paletteContrast } from "@/lib/poster/styles";

export type DesignInput = {
  brief: PosterBrief;
  copy: PosterCopy;
  brand: BrandProfile;
  style: PosterStyle;
  size: PosterSize;
  language: ProjectLanguage;
  occasion: Occasion | BusinessBeat | null;
  /** The gallery design picked, or null for the plain look. */
  gallery?: GalleryDesign | null;
  photo?: PosterPhoto | null;
};

/**
 * Which layout this poster wants.
 *
 * Chosen rather than asked, because "festival offer or offer slab" is not a
 * decision a shop owner has any reason to hold an opinion about - it follows
 * entirely from whether there is a festival and whether there is an offer.
 */
export function templateIdFor(input: {
  brief: PosterBrief;
  occasion: Occasion | BusinessBeat | null;
}): PosterTemplateId {
  const offering = hasOffer(input.brief.offer);
  if (input.brief.kind === "announcement") return "announcement-clean";
  if (input.occasion && offering) return "festival-offer";
  if (!offering) return "festival-panel";
  return "offer-slab";
}

function termsFor(brief: PosterBrief): string {
  const min = brief.offer.min_purchase.trim();
  if (!min) return "";
  // Typed as a bare number by most people; the glyph is ours to add.
  return /^\d/.test(min) ? `Above ₹${min} only` : min;
}

/**
 * The owner's photo, dimmed toward the palette's own ground.
 *
 * Dark palettes darken the photo and light palettes lighten it, so the
 * palette's text colour keeps working on top of a picture nobody chose for
 * its contrast. The strength is the owner's call: a clear product shot wants
 * less dimming than a busy shopfront.
 */
export function photoBackground(photo: PosterPhoto, style: PosterStyle): PosterBackground {
  const alpha = PHOTO_STRENGTHS.find((s) => s.value === photo.strength)?.alpha ?? 0.5;
  return {
    kind: "image",
    image: {
      slot: "background",
      src: photo.src,
      focus: photo.focus,
      provenance: { source: "upload" },
    },
    overlay: {
      kind: "tint",
      color: paletteContrast(style) === "light" ? "#FFFFFF" : "#000000",
      alpha,
    },
  };
}

export function buildDesign(input: DesignInput): PosterDesign {
  const { brief, copy, brand, style, size, language, occasion, gallery, photo } = input;
  const offering = hasOffer(brief.offer);
  const lines = offering ? offerLines(brief.offer) : { big: "", small: "" };

  const background = photo
    ? photoBackground(photo, style)
    : backgroundFor(style, gallery?.look);

  return {
    v: 1,
    templateId: templateIdFor({ brief, occasion }),
    sizeId: size,
    styleId: style,
    language,
    content: {
      headline: copy.headline,
      subline: copy.subline,
      offerBig: lines.big,
      offerSmall: lines.small,
      terms: termsFor(brief),
      cta: copy.cta_label,
      occasion: occasion?.name ?? brief.subject,
      validity: offering ? capitalize(validityPhrase(brief.valid_until)) : "",
    },
    brand: {
      name: brand.shop_name.trim(),
      phone: brand.phone.trim(),
      tagline: brand.tagline.trim(),
      logo: brand.logo_data_url
        ? { slot: "logo", src: brand.logo_data_url, provenance: { source: "upload" } }
        : null,
      // Only overrides the palette when the shop actually set a colour of its
      // own; the palettes are balanced against their own backgrounds.
      accentColor: brand.brand_color && brand.brand_color !== "#C2410C" ? brand.accent_color : null,
    },
    background,
    decor: (gallery?.decor ?? []).map((kind) => ({ kind })),
    photo: null,
  };
}

/**
 * A gallery design filled with its own example content, for browsing.
 *
 * The owner's real shop name goes on it when they have one, so the gallery
 * already looks like their poster. Before they have told us anything, a
 * placeholder name and number stand in - a thumbnail with an empty brand bar
 * reads as a broken design rather than as room for their details.
 */
export function sampleDesign(
  gallery: GalleryDesign,
  brand: BrandProfile,
  size: PosterSize = "square"
): PosterDesign {
  const s = gallery.sample;
  const shown: BrandProfile = brand.shop_name.trim()
    ? brand
    : { ...brand, shop_name: "Your Shop Name", phone: brand.phone || "98765 43210" };

  return buildDesign({
    brief: {
      ...DEFAULT_BRIEF,
      kind: s.kind,
      occasion_id: s.occasionId,
      subject: s.subject,
      offer: s.offer,
      cta: s.cta,
    },
    copy: {
      headline: s.headline,
      subline: s.subline,
      cta_label: ctaLabel(s.cta, "english"),
      caption: "",
      hashtags: [],
    },
    brand: shown,
    style: gallery.styleId,
    size,
    language: "english",
    occasion: s.occasionId ? occasionById(s.occasionId) : null,
    gallery,
  });
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}
