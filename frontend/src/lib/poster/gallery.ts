/**
 * The designs an owner can start from.
 *
 * These follow what actually works for Indian shop posters - rows of diyas
 * and lights for Diwali, marigold torans for Ganesh Chaturthi and Ugadi,
 * kites for Sankranti, a huge discount on a loud background for a sale - but
 * every one is an original composition of our own art and palettes. Nothing
 * here is copied from Pinterest or a stock site: those designs belong to the
 * people who made them, and as flat images they could not be edited anyway,
 * because someone else's shop name and prices are painted into the pixels.
 *
 * A design is a *look* - palette, background treatment and art. It is not a
 * layout: whether the poster leads with an offer slab or a greeting still
 * follows from what the owner is actually posting (see templateIdFor). That is
 * what lets any design take any offer without a hole where the offer should be.
 */

import type { BackgroundLook } from "@/lib/poster/styles";
import {
  DEFAULT_OFFER,
  type DecorKind,
  type Offer,
  type OccasionKind,
  type PosterCta,
  type PosterStyle,
} from "@/types/poster";

export type GalleryTag = "diwali" | "ganesh" | "sankranti" | "eid" | "christmas" | "sale" | "everyday";

export const GALLERY_TAGS: { value: GalleryTag | "all"; label: string }[] = [
  { value: "all", label: "All designs" },
  { value: "sale", label: "Offers & sales" },
  { value: "diwali", label: "Diwali" },
  { value: "ganesh", label: "Ganesh Chaturthi" },
  { value: "sankranti", label: "Sankranti & Ugadi" },
  { value: "eid", label: "Eid" },
  { value: "christmas", label: "Christmas & New Year" },
  { value: "everyday", label: "Everyday" },
];

export type GallerySample = {
  kind: OccasionKind;
  occasionId: string | null;
  subject: string;
  headline: string;
  subline: string;
  offer: Offer;
  cta: PosterCta;
};

export type GalleryDesign = {
  id: string;
  name: string;
  description: string;
  tags: GalleryTag[];
  /** Occasions this design is the first suggestion for. */
  occasionIds: string[];
  styleId: PosterStyle;
  look: BackgroundLook;
  decor: DecorKind[];
  /** What the gallery thumbnail shows before the owner has typed anything. */
  sample: GallerySample;
};

const offer = (patch: Partial<Offer>): Offer => ({ ...DEFAULT_OFFER, ...patch });

export const GALLERY_DESIGNS: GalleryDesign[] = [
  {
    id: "diya-glow",
    name: "Diya Glow",
    description: "A row of lit lamps on royal purple",
    tags: ["diwali"],
    occasionIds: ["diwali", "karthika_pournami"],
    styleId: "royal_purple",
    look: "gradient",
    decor: ["bokeh", "sparkles", "diya_row"],
    sample: {
      kind: "festival",
      occasionId: "diwali",
      subject: "Diwali",
      headline: "Diwali Dhamaka",
      subline: "Sweets, gifts and more",
      offer: offer({ kind: "percent_off", value: "30" }),
      cta: "visit",
    },
  },
  {
    id: "marigold-toran",
    name: "Marigold Toran",
    description: "A hanging marigold garland on festive red",
    tags: ["ganesh", "sankranti"],
    occasionIds: [
      "ganesh_chaturthi",
      "ugadi",
      "dussehra",
      "sri_rama_navami",
      "krishna_janmashtami",
      "varalakshmi_vratam",
    ],
    styleId: "festive_gold",
    look: "rays",
    decor: ["marigold_toran", "sparkles"],
    sample: {
      kind: "festival",
      occasionId: "ganesh_chaturthi",
      subject: "Ganesh Chaturthi",
      headline: "Ganesh Chaturthi Special",
      subline: "Fresh modaks every morning",
      offer: offer({ kind: "bogo" }),
      cta: "order",
    },
  },
  {
    id: "mega-offer",
    name: "Mega Offer",
    description: "One huge number on a sunburst",
    tags: ["sale"],
    occasionIds: [],
    styleId: "bold_offer",
    look: "rays",
    decor: ["sparkles"],
    sample: {
      kind: "offer",
      occasionId: null,
      subject: "Mega offer",
      headline: "Mega Offer",
      subline: "Limited stock - hurry",
      offer: offer({ kind: "flat_price", value: "499" }),
      cta: "visit",
    },
  },
  {
    id: "kite-day",
    name: "Kite Day",
    description: "Kites across a deep blue sky",
    tags: ["sankranti"],
    occasionIds: ["sankranti"],
    styleId: "sky_blue",
    look: "gradient",
    decor: ["soft_circles", "kites"],
    sample: {
      kind: "festival",
      occasionId: "sankranti",
      subject: "Sankranti",
      headline: "Sankranti Offers",
      subline: "Fly high with savings",
      offer: offer({ kind: "combo_price", value: "299" }),
      cta: "visit",
    },
  },
  {
    id: "fireworks-night",
    name: "Fireworks Night",
    description: "Bursts of light over midnight",
    tags: ["diwali", "christmas"],
    occasionIds: ["new_year"],
    styleId: "modern_dark",
    look: "gradient",
    decor: ["fireworks", "sparkles"],
    sample: {
      kind: "festival",
      occasionId: "new_year",
      subject: "New Year",
      headline: "Festive Mega Sale",
      subline: "The biggest offers of the year",
      offer: offer({ kind: "percent_off", value: "50" }),
      cta: "visit",
    },
  },
  {
    id: "sale-bunting",
    name: "Sale Bunting",
    description: "Flags and confetti, loud and cheerful",
    tags: ["sale"],
    occasionIds: [],
    styleId: "bold_offer",
    look: "confetti",
    decor: ["bunting"],
    sample: {
      kind: "offer",
      occasionId: null,
      subject: "Weekend sale",
      headline: "Weekend Sale",
      subline: "On everything in store",
      offer: offer({ kind: "percent_off", value: "25" }),
      cta: "visit",
    },
  },
  {
    id: "rangoli-corners",
    name: "Rangoli",
    description: "Traditional rangoli on warm cream",
    tags: ["sankranti", "diwali"],
    occasionIds: ["bathukamma", "holi"],
    styleId: "warm_traditional",
    look: "solid",
    decor: ["rangoli_corners"],
    sample: {
      kind: "festival",
      occasionId: "sankranti",
      subject: "Sankranti",
      headline: "Happy Sankranti",
      subline: "Pongal specials are here",
      offer: offer({ kind: "flat_off", value: "100" }),
      cta: "visit",
    },
  },
  {
    id: "golden-frame",
    name: "Golden Frame",
    description: "A fine gold border, for anything premium",
    tags: ["everyday", "diwali"],
    occasionIds: ["akshaya_tritiya"],
    styleId: "modern_dark",
    look: "gradient",
    decor: ["gold_frame"],
    sample: {
      kind: "festival",
      occasionId: "akshaya_tritiya",
      subject: "Akshaya Tritiya",
      headline: "Akshaya Tritiya",
      subline: "On making charges, this week only",
      offer: offer({ kind: "percent_off", value: "15" }),
      cta: "book",
    },
  },
  {
    id: "crescent-nights",
    name: "Crescent Nights",
    description: "Crescent moon and glowing lanterns",
    tags: ["eid"],
    occasionIds: ["eid_al_fitr", "eid_al_adha"],
    styleId: "emerald_gold",
    look: "gradient",
    decor: ["sparkles", "crescent_lanterns"],
    sample: {
      kind: "festival",
      occasionId: "eid_al_fitr",
      subject: "Eid",
      headline: "Eid Mubarak",
      subline: "Celebrate with our Eid collection",
      offer: offer({ kind: "percent_off", value: "20" }),
      cta: "visit",
    },
  },
  {
    id: "party-lights",
    name: "Party Lights",
    description: "Strings of glowing bulbs",
    tags: ["christmas", "sale"],
    occasionIds: ["christmas", "childrens_day"],
    styleId: "playful_bright",
    look: "gradient",
    decor: ["bokeh", "string_lights"],
    sample: {
      kind: "festival",
      occasionId: "christmas",
      subject: "Christmas",
      headline: "Year-End Party Offer",
      subline: "Bring your friends along",
      offer: offer({ kind: "buy_x_get_y", value: "2", value2: "1" }),
      cta: "book",
    },
  },
  {
    id: "flower-corners",
    name: "Flower Corners",
    description: "Soft blooms on deep rose",
    tags: ["everyday"],
    occasionIds: ["womens_day", "raksha_bandhan"],
    styleId: "rose_pink",
    look: "gradient",
    decor: ["floral_corners"],
    sample: {
      kind: "festival",
      occasionId: "womens_day",
      subject: "Women's Day",
      headline: "Women's Day Special",
      subline: "Pamper yourself this week",
      offer: offer({ kind: "first_visit", value: "30" }),
      cta: "book",
    },
  },
  {
    id: "clean-simple",
    name: "Clean & Simple",
    description: "White, calm, easy to read",
    tags: ["everyday"],
    occasionIds: [
      "independence_day",
      "republic_day",
      "gandhi_jayanti",
      "teachers_day",
      "telangana_formation_day",
      "ap_formation_day",
    ],
    styleId: "clean_minimal",
    look: "solid",
    decor: ["soft_circles"],
    sample: {
      kind: "announcement",
      occasionId: null,
      subject: "Now open on Sundays",
      headline: "Now Open on Sundays",
      subline: "9 AM to 9 PM, every day of the week",
      offer: offer({}),
      cta: "call",
    },
  },
];

export function galleryDesignById(id: string | null | undefined): GalleryDesign | null {
  if (!id) return null;
  return GALLERY_DESIGNS.find((d) => d.id === id) ?? null;
}

/**
 * The design to open with, so nobody starts from a blank page.
 *
 * An occasion with a design of its own gets that one. Otherwise it follows what
 * is being posted: a plain offer gets the loudest design, news gets the
 * calmest, and an unmapped festival gets the garland, which suits most of them.
 */
export function suggestDesign(occasionId: string | null, kind: OccasionKind): GalleryDesign {
  const byOccasion = occasionId
    ? GALLERY_DESIGNS.find((d) => d.occasionIds.includes(occasionId))
    : undefined;
  if (byOccasion) return byOccasion;

  const fallbackId =
    kind === "announcement" ? "clean-simple" : kind === "festival" ? "marigold-toran" : "mega-offer";
  return galleryDesignById(fallbackId) ?? GALLERY_DESIGNS[0];
}

/** Designs for this occasion first, then everything else in gallery order. */
export function designsFor(occasionId: string | null): GalleryDesign[] {
  if (!occasionId) return GALLERY_DESIGNS;
  const matching = GALLERY_DESIGNS.filter((d) => d.occasionIds.includes(occasionId));
  const rest = GALLERY_DESIGNS.filter((d) => !d.occasionIds.includes(occasionId));
  return [...matching, ...rest];
}
