/**
 * A poster: what a shop owner puts on WhatsApp Status when Ganesh Chaturthi
 * comes around, or when they have an offer on.
 *
 * Two things are kept apart here on purpose.
 *
 * `PosterDesign` is the renderer's input - the finished thing, every word and
 * colour already decided. It is plain JSON with no DOM types in it, so it
 * round-trips through localStorage today and through a backend row later
 * without changing shape.
 *
 * Everything else (`PosterBrief`, `BrandProfile`, `PosterCopy`) is what the
 * owner actually filled in. A design is derived from those by
 * lib/poster/design.ts, never edited directly.
 *
 * Deliberately absent from `PosterDesign`: per-element x/y/rotation, and
 * per-field font size or family. This is a template product, not a canvas
 * editor. The moment positions live in a saved design, no template can ever be
 * improved without breaking posters people already made, and "the preview is
 * exactly the file you download" degrades to "exact until you drag something".
 */

import type { ProjectLanguage } from "@/types/project";

/* ------------------------------------------------------------------ *
 * The business
 * ------------------------------------------------------------------ */

/**
 * What the shop sells. This is not decoration: it picks the vocabulary the
 * copywriter reaches for, and filters which occasions are worth suggesting.
 * A gym has no use for Akshaya Tritiya; a jeweller builds its year around it.
 */
export type BusinessCategory =
  | "sweets_bakery"
  | "salon_spa"
  | "gym_fitness"
  | "clinic_pharmacy"
  | "boutique_clothing"
  | "restaurant_cafe"
  | "grocery_kirana"
  | "electronics_mobile"
  | "tuition_coaching"
  | "jewellery"
  | "other";

export const BUSINESS_CATEGORIES: { value: BusinessCategory; label: string; hint: string }[] = [
  { value: "sweets_bakery", label: "Sweets & bakery", hint: "Sweets, cakes, snacks" },
  { value: "salon_spa", label: "Salon & spa", hint: "Hair, beauty, grooming" },
  { value: "gym_fitness", label: "Gym & fitness", hint: "Gym, yoga, training" },
  { value: "clinic_pharmacy", label: "Clinic & pharmacy", hint: "Doctor, dental, medicals" },
  { value: "boutique_clothing", label: "Clothing & boutique", hint: "Sarees, readymade, tailoring" },
  { value: "restaurant_cafe", label: "Restaurant & cafe", hint: "Hotel, tiffin, cafe" },
  { value: "grocery_kirana", label: "Grocery & kirana", hint: "Provisions, supermarket" },
  { value: "electronics_mobile", label: "Electronics & mobile", hint: "Phones, repairs, appliances" },
  { value: "tuition_coaching", label: "Tuition & coaching", hint: "Classes, institute" },
  { value: "jewellery", label: "Jewellery", hint: "Gold, silver, imitation" },
  { value: "other", label: "Something else", hint: "Anything not listed" },
];

/**
 * Asked once, stamped on every poster afterwards.
 *
 * The logo is held as a data URL rather than as a link to a file. Two reasons:
 * a design stays one self-contained JSON object, and a cross-origin image
 * would taint the canvas and make `toBlob` throw at exactly the moment the
 * owner hits Download.
 */
export type BrandProfile = {
  shop_name: string;
  category: BusinessCategory;
  tagline: string;
  phone: string;
  /** Usually the same number as `phone`; the form offers to copy it across. */
  whatsapp: string;
  address: string;
  /** Data URL, downscaled to 512px on capture. Null until they upload one. */
  logo_data_url: string | null;
  brand_color: string;
  accent_color: string;
  /** What the captions get written in. */
  language: ProjectLanguage;
};

export const DEFAULT_BRAND: BrandProfile = {
  shop_name: "",
  category: "other",
  tagline: "",
  phone: "",
  whatsapp: "",
  address: "",
  logo_data_url: null,
  // A warm orange reads as festive across most of the occasions in this
  // calendar, and is the safest thing to show someone before they have told
  // us anything at all about their shop.
  brand_color: "#C2410C",
  accent_color: "#F59E0B",
  language: "tenglish",
};

/* ------------------------------------------------------------------ *
 * The brief
 * ------------------------------------------------------------------ */

export type OccasionKind =
  | "festival"
  | "civil_day"
  | "offer"
  | "announcement"
  | "business_beat";

/**
 * Offer first, deliberately.
 *
 * The reason a shop posts is almost always that it wants people to come in
 * this week. A festival is one of the reasons an offer goes out - "Ganesh
 * Chaturthi special, buy one get one" - not a separate kind of post. So the
 * offer is the default, and the festival is a frame you can put around it.
 */
export const OCCASION_KINDS: { value: OccasionKind; label: string; hint: string }[] = [
  { value: "offer", label: "Offer", hint: "Discount, 1+1, combo" },
  { value: "festival", label: "Festival offer", hint: "An offer tied to Diwali, Ugadi" },
  { value: "announcement", label: "Announcement", hint: "New item, timings, opening" },
];

/* ------------------------------------------------------------------ *
 * The offer - the hero of most posters
 * ------------------------------------------------------------------ */

/**
 * Offers are structured rather than a line of free text, because the poster
 * has to *lay them out*: "BUY 1 GET 1" wants two stacked words at enormous
 * size, "20% OFF" wants one number and a small suffix, and "Combo at 299"
 * wants a rupee glyph the owner should not have to type. Free text can only
 * ever be set in one size and one shape, which is how every generic tool
 * produces a poster that reads like a notice.
 *
 * `custom` is still there for the offer nobody anticipated - it just loses the
 * tailored layout and gets set as a plain line.
 */
export type OfferKind =
  | "percent_off"
  | "flat_off"
  | "bogo"
  | "buy_x_get_y"
  | "combo_price"
  | "flat_price"
  | "free_gift"
  | "first_visit"
  | "custom";

export const OFFER_KINDS: {
  value: OfferKind;
  label: string;
  hint: string;
  /** Which inputs the form shows for this kind. */
  fields: ("value" | "value2" | "item" | "text")[];
}[] = [
  { value: "percent_off", label: "% off", hint: "20% OFF", fields: ["value", "item"] },
  { value: "flat_off", label: "Flat ₹ off", hint: "₹200 OFF", fields: ["value", "item"] },
  { value: "bogo", label: "Buy 1 get 1", hint: "1 + 1 free", fields: ["item"] },
  { value: "buy_x_get_y", label: "Buy X get Y", hint: "Buy 2 get 1 free", fields: ["value", "value2", "item"] },
  { value: "combo_price", label: "Combo price", hint: "Combo at ₹299", fields: ["value", "item"] },
  { value: "flat_price", label: "Everything at", hint: "All items ₹499", fields: ["value", "item"] },
  { value: "free_gift", label: "Free gift", hint: "Free gift on every purchase", fields: ["item", "value"] },
  { value: "first_visit", label: "First visit", hint: "15% off your first visit", fields: ["value"] },
  { value: "custom", label: "Something else", hint: "Write it yourself", fields: ["text"] },
];

export type Offer = {
  kind: OfferKind;
  /** The main number: 20 for "20% off", 200 for "₹200 off", 299 for a combo. */
  value: string;
  /** The second number, for "buy 2 get 1". */
  value2: string;
  /** What the offer is on: "all sweets", "haircuts", "every purchase above ₹999". */
  item: string;
  /** Used only by `custom`. */
  text: string;
  /** ₹1000 and up - shown as small print under the offer. */
  min_purchase: string;
};

export const DEFAULT_OFFER: Offer = {
  kind: "percent_off",
  value: "",
  value2: "",
  item: "",
  text: "",
  min_purchase: "",
};

/** True when there is enough here to actually draw an offer. */
export function hasOffer(offer: Offer): boolean {
  if (offer.kind === "custom") return offer.text.trim().length > 0;
  if (offer.kind === "bogo") return true;
  return offer.value.trim().length > 0;
}

/**
 * The big words, ready to set: "20%", "BUY 1", "₹200".
 *
 * Returned as lines rather than one string so a template can stack them at
 * different sizes - which is the entire reason offers are structured.
 *
 * Deliberately not translated. "20% OFF" and "1 + 1" are how offers are
 * written on shopfronts in Telugu-speaking markets too; the headline and the
 * caption carry the language, the number does not need to.
 */
export function offerLines(offer: Offer): { big: string; small: string } {
  const v = offer.value.trim();
  const v2 = offer.value2.trim();
  switch (offer.kind) {
    case "percent_off":
      return { big: `${v}%`, small: "OFF" };
    case "flat_off":
      return { big: `₹${v}`, small: "OFF" };
    case "bogo":
      return { big: "1 + 1", small: "BUY 1 GET 1 FREE" };
    case "buy_x_get_y":
      return { big: `${v} + ${v2}`, small: `BUY ${v} GET ${v2} FREE` };
    case "combo_price":
      return { big: `₹${v}`, small: "COMBO" };
    case "flat_price":
      return { big: `₹${v}`, small: "EVERYTHING AT" };
    case "free_gift":
      return { big: "FREE", small: "GIFT INSIDE" };
    case "first_visit":
      return { big: `${v}%`, small: "FIRST VISIT" };
    case "custom":
      return { big: offer.text.trim(), small: "" };
  }
}

/** One line for a caption or an alt-text clause: "20% off all sweets". */
export function offerSentence(offer: Offer): string {
  const v = offer.value.trim();
  const v2 = offer.value2.trim();
  const on = offer.item.trim() ? ` on ${offer.item.trim()}` : "";
  switch (offer.kind) {
    case "percent_off":
      return `${v}% off${on}`;
    case "flat_off":
      return `₹${v} off${on}`;
    case "bogo":
      return `buy one get one free${on}`;
    case "buy_x_get_y":
      return `buy ${v} get ${v2} free${on}`;
    case "combo_price":
      return `combo at ₹${v}${on}`;
    case "flat_price":
      return `everything at ₹${v}${on}`;
    case "free_gift":
      return `a free gift${on || " with every purchase"}`;
    case "first_visit":
      return `${v}% off your first visit`;
    case "custom":
      return offer.text.trim();
  }
}

/** What the copywriter is being asked to do. Picks which fragment bank it reads. */
export type CopyAngle =
  | "wish"
  | "offer"
  | "announce"
  | "invite"
  | "gratitude"
  | "new_arrival"
  | "social_proof";

export type PosterCta = "visit" | "call" | "whatsapp" | "order" | "book" | "none";

export const POSTER_CTAS: { value: PosterCta; label: string }[] = [
  { value: "visit", label: "Visit us" },
  { value: "call", label: "Call now" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "order", label: "Order now" },
  { value: "book", label: "Book a slot" },
  { value: "none", label: "No button" },
];

export type PosterBrief = {
  /** Null when the owner described the occasion themselves. */
  occasion_id: string | null;
  kind: OccasionKind;
  /** Free text, used when no occasion in the calendar fits. */
  subject: string;
  /** Optional. When set, it wins over anything the copywriter came up with. */
  headline_input: string;
  details: string;
  /** The hero of most posters. `hasOffer()` decides whether it gets drawn. */
  offer: Offer;
  /** ISO date, or null. Printed on the poster as "Till 30 Sep". */
  valid_until: string | null;
  cta: PosterCta;
};

export const DEFAULT_BRIEF: PosterBrief = {
  occasion_id: null,
  // An offer is what a shop most often has to say, so that is where the form
  // opens. Festivals are reached for deliberately, from the calendar.
  kind: "offer",
  subject: "",
  headline_input: "",
  details: "",
  offer: DEFAULT_OFFER,
  valid_until: null,
  cta: "visit",
};

/* ------------------------------------------------------------------ *
 * The words
 * ------------------------------------------------------------------ */

export type PosterCopy = {
  headline: string;
  subline: string;
  cta_label: string;
  /** What gets pasted under the picture. Longer, and written in sentences. */
  caption: string;
  hashtags: string[];
};

/* ------------------------------------------------------------------ *
 * Look and shape
 * ------------------------------------------------------------------ */

export type PosterStyle =
  | "festive_gold"
  | "bold_offer"
  | "clean_minimal"
  | "warm_traditional"
  | "modern_dark"
  | "playful_bright";

export const POSTER_STYLES: { value: PosterStyle; label: string; hint: string }[] = [
  { value: "festive_gold", label: "Festive", hint: "Gold on deep red" },
  { value: "bold_offer", label: "Bold", hint: "Big number, loud" },
  { value: "clean_minimal", label: "Clean", hint: "White, lots of air" },
  { value: "warm_traditional", label: "Traditional", hint: "Turmeric and maroon" },
  { value: "modern_dark", label: "Dark", hint: "Charcoal, understated" },
  { value: "playful_bright", label: "Playful", hint: "Bright, rounded" },
];

/**
 * Named by where it gets posted rather than by pixels, because that is the
 * choice actually being made. The pixel size is the hint underneath.
 */
export type PosterSize = "square" | "story" | "landscape";

export const POSTER_SIZES: {
  value: PosterSize;
  label: string;
  hint: string;
  width: number;
  height: number;
}[] = [
  { value: "square", label: "Post", hint: "1080x1080 - Instagram, Facebook", width: 1080, height: 1080 },
  { value: "story", label: "Status", hint: "1080x1920 - WhatsApp, Stories", width: 1080, height: 1920 },
  { value: "landscape", label: "Wide", hint: "1200x630 - Facebook, Google", width: 1200, height: 630 },
];

export function sizePixels(size: PosterSize): { width: number; height: number } {
  const found = POSTER_SIZES.find((s) => s.value === size);
  return found ? { width: found.width, height: found.height } : { width: 1080, height: 1080 };
}

export function sizeLabel(size: PosterSize): string {
  return POSTER_SIZES.find((s) => s.value === size)?.label ?? "Post";
}

export function styleLabel(style: PosterStyle): string {
  return POSTER_STYLES.find((s) => s.value === style)?.label ?? "Festive";
}

export function categoryLabel(category: BusinessCategory): string {
  return BUSINESS_CATEGORIES.find((c) => c.value === category)?.label ?? "Business";
}

/* ------------------------------------------------------------------ *
 * The design - the renderer's input
 * ------------------------------------------------------------------ */

/**
 * Declared as a plain union rather than derived from the template map, so this
 * file stays at the bottom of the import graph the way every other types/ file
 * does. templates/index.ts asserts the other direction with `satisfies`, which
 * catches a missing or misspelled template at compile time just as well.
 */
export type PosterTemplateId =
  /** The offer is the whole poster: one enormous number, everything else small. */
  | "offer-slab"
  /** A festival frame around an offer - the combination this module exists for. */
  | "festival-offer"
  /** A greeting with no offer in it. */
  | "festival-panel"
  | "announcement-clean";

export type PosterImageSlot = "logo" | "photo" | "background";

export type PosterImageRef = {
  slot: PosterImageSlot;
  /**
   * Opaque to everything except the loader, which branches on the scheme. A
   * data URL today; an https URL the day backgrounds are generated rather than
   * uploaded.
   */
  src: string;
  /** Where to aim when the image has to be cropped to fill. 0..1, centre by default. */
  focus?: { x: number; y: number };
  /**
   * Unused today. It is here so that a generated background - and the "make
   * another one like this" button that follows it - needs no migration of
   * designs saved before either existed.
   */
  provenance?: { source: "upload" | "generated"; prompt?: string; model?: string };
};

export type PosterOverlay =
  | { kind: "none" }
  | { kind: "scrim"; color: string; from: number; to: number; direction: "up" | "down" }
  | { kind: "tint"; color: string; alpha: number };

export type PosterPatternId = "rays" | "mandala" | "confetti" | "diagonal" | "plain";

/**
 * A union from day one, painted by paintBackground() before any template
 * draws, so no template ever touches the background itself. That is what lets
 * a generated image arrive later as just another `kind` with nothing else
 * rewritten.
 */
export type PosterBackground =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "pattern"; patternId: PosterPatternId; color: string; accent: string }
  | { kind: "image"; image: PosterImageRef; overlay: PosterOverlay };

export type PosterDesign = {
  /** Bumped only when a stored design can no longer be read as it stands. */
  v: 1;
  templateId: PosterTemplateId;
  sizeId: PosterSize;
  styleId: PosterStyle;
  language: ProjectLanguage;
  content: {
    headline: string;
    subline: string;
    /**
     * The offer, already split for setting: "20%" over "OFF", "1 + 1" over
     * "BUY 1 GET 1 FREE". An empty `offerBig` is how a template knows there is
     * no offer and it should fall back to its greeting layout.
     */
    offerBig: string;
    offerSmall: string;
    /** "Above ₹1000 only" - small print under the offer. */
    terms: string;
    cta: string;
    /** "Ganesh Chaturthi". Feeds the alt text and the caption, not the poster. */
    occasion: string;
    /** "Till 30 Sep", already formatted. Empty when there is no end date. */
    validity: string;
  };
  brand: {
    name: string;
    phone: string;
    tagline: string;
    logo: PosterImageRef | null;
    /** Overrides the style preset's accent when the shop has its own colour. */
    accentColor: string | null;
  };
  background: PosterBackground;
  photo: PosterImageRef | null;
};

/* ------------------------------------------------------------------ *
 * The saved record
 * ------------------------------------------------------------------ */

export type PosterPost = {
  id: string;
  created_at: string;
  updated_at: string;
  /**
   * The date the post is *for*, not the day it was made. This is what the
   * calendar reads to put a dot on a cell.
   */
  occasion_date: string | null;
  brief: PosterBrief;
  style: PosterStyle;
  size: PosterSize;
  language: ProjectLanguage;
  copy: PosterCopy;
  /** Which of the three offered options was picked, so reopening restores it. */
  copy_variant_id: string;
  /**
   * The renderer's input, snapshotted rather than recomputed on open. Changing
   * the brand colour next month must not silently repaint a poster that was
   * already downloaded and posted.
   */
  design: PosterDesign;
  /** ~320px JPEG, for the library grid only. Nullable - it is regenerable. */
  thumbnail_data_url: string | null;
};

/**
 * "20% OFF · Ganesh Chaturthi · Status". The tile caption and the share line.
 *
 * The offer leads, because that is what distinguishes two posters made for the
 * same festival a week apart - which is the case a library of these actually
 * has to help someone tell apart.
 */
export function summarizePost(post: PosterPost): string {
  const offer = hasOffer(post.brief.offer) ? offerSentence(post.brief.offer) : "";
  const parts = [
    offer,
    post.design.content.occasion || post.brief.subject || "Poster",
    sizeLabel(post.size),
  ];
  return parts.filter(Boolean).join(" · ");
}
