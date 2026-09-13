/**
 * Turning what the owner filled in into what the renderer draws.
 *
 * This is the only file outside lib/poster that knows the shape of a
 * `PosterDesign`, which keeps the renderer's contract to one seam: if it
 * changes, this file changes and the composer does not.
 */

import {
  hasOffer,
  offerLines,
  type BrandProfile,
  type PosterBrief,
  type PosterCopy,
  type PosterDesign,
  type PosterSize,
  type PosterStyle,
  type PosterTemplateId,
} from "@/types/poster";
import type { ProjectLanguage } from "@/types/project";
import type { BusinessBeat, Occasion } from "@/lib/poster/occasions";
import { validityPhrase } from "@/lib/poster/copy";
import { defaultBackgroundFor } from "@/lib/poster/styles";

export type DesignInput = {
  brief: PosterBrief;
  copy: PosterCopy;
  brand: BrandProfile;
  style: PosterStyle;
  size: PosterSize;
  language: ProjectLanguage;
  occasion: Occasion | BusinessBeat | null;
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
  if (input.occasion && !offering) return "festival-panel";
  if (!offering) return "festival-panel";
  return "offer-slab";
}

function termsFor(brief: PosterBrief): string {
  const min = brief.offer.min_purchase.trim();
  if (!min) return "";
  // Typed as a bare number by most people; the glyph is ours to add.
  return /^\d/.test(min) ? `Above ₹${min} only` : min;
}

export function buildDesign(input: DesignInput): PosterDesign {
  const { brief, copy, brand, style, size, language, occasion } = input;
  const offering = hasOffer(brief.offer);
  const lines = offering ? offerLines(brief.offer) : { big: "", small: "" };

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
      // Only overrides the preset when the shop actually set a colour of its
      // own; the presets are balanced against their own backgrounds.
      accentColor: brand.brand_color && brand.brand_color !== "#C2410C" ? brand.accent_color : null,
    },
    background: defaultBackgroundFor(style),
    photo: null,
  };
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}
