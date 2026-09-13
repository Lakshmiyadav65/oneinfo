/**
 * The words on the poster, written without a model.
 *
 * There is no backend yet, so this composes copy locally. The shape of the
 * export is the point: `writeCopy` is async, takes one options object and
 * takes an AbortSignal, so the day it becomes a call to a real model, the
 * spinner, the cancellation and the error toast in the composer are already
 * written and nothing in the UI changes. Swapping is one line at the bottom
 * of this file.
 *
 * Three things keep it from reading like a mail merge:
 *
 *   Angle    Where the post is coming from - an offer, a greeting, a thank
 *            you. Each has its own bank. A Diwali wish and a weekend discount
 *            never draw from the same pool.
 *   Voice    Fixed per option rather than drawn at random, so the three
 *            options offered are reliably *different* from each other. Three
 *            draws from one bag give you three near-identical lines; three
 *            voices give a real choice.
 *   Decline  Every fragment can return null. One that needs an offer returns
 *            null when there is no offer, and the composer drops it and fixes
 *            the spacing. This is what prevents "Get  % off this !".
 *
 * The offer itself is not written here. It is laid out by the template from
 * the structured `Offer`, because "1 + 1" set enormous is a layout decision,
 * not a sentence.
 */

import type { ProjectLanguage } from "@/types/project";
import {
  hasOffer,
  offerSentence,
  type BusinessCategory,
  type BrandProfile,
  type CopyAngle,
  type Offer,
  type PosterBrief,
  type PosterCopy,
  type PosterCta,
  type PosterSize,
} from "@/types/poster";
import type { BusinessBeat, Occasion } from "@/lib/poster/occasions";

/* ------------------------------------------------------------------ *
 * The contract
 * ------------------------------------------------------------------ */

export type CopyRequest = {
  brief: PosterBrief;
  occasion: Occasion | BusinessBeat | null;
  brand: BrandProfile;
  language: ProjectLanguage;
  size: PosterSize;
  count?: number;
  /** Stable seed: the same brief yields the same options across reloads. */
  seed?: string;
  signal?: AbortSignal;
};

export type CopyOption = PosterCopy & {
  id: string;
  /** Why this one reads differently: "Warm", "Straight to the point", "Short". */
  angle_label: string;
  /** True when this language had no bank for the angle and English was used. */
  fallback_language: boolean;
};

export type CopyWriter = (request: CopyRequest) => Promise<CopyOption[]>;

/* ------------------------------------------------------------------ *
 * Deterministic randomness
 * ------------------------------------------------------------------ */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates against a seeded source, so ordering is reproducible. */
function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * What the shop sells, in words
 * ------------------------------------------------------------------ */

type CategoryVocab = {
  /** Plural, what they sell: "sweets", "haircuts". */
  goods: string;
  /** Singular treat: "a box of fresh sweets". */
  treat: string;
  /** The verb: "order", "book", "drop in". */
  action: string;
  /** What new stock is called: "this week's fresh batch". */
  arrivals: string;
};

/**
 * Without this table every business gets the same sentence with a different
 * name dropped into it, which is exactly the tell that gives away generated
 * copy. A salon reaching for "a fresh look before the festival" and a sweet
 * shop reaching for "boxes packed this morning" is most of the difference
 * between written and generated.
 */
const CATEGORY_VOCAB: Record<BusinessCategory, CategoryVocab> = {
  sweets_bakery: {
    goods: "sweets",
    treat: "a box packed fresh this morning",
    action: "order",
    arrivals: "this week's fresh batch",
  },
  salon_spa: {
    goods: "salon services",
    treat: "a fresh look",
    action: "book",
    arrivals: "our new treatments",
  },
  gym_fitness: {
    goods: "memberships",
    treat: "a proper start",
    action: "join",
    arrivals: "the new batch",
  },
  clinic_pharmacy: {
    goods: "consultations",
    treat: "a check-up you keep putting off",
    action: "book",
    arrivals: "our new timings",
  },
  boutique_clothing: {
    goods: "our collection",
    treat: "something new to wear",
    action: "come see",
    arrivals: "the new collection",
  },
  restaurant_cafe: {
    goods: "our menu",
    treat: "a table for the family",
    action: "order",
    arrivals: "the new menu",
  },
  grocery_kirana: {
    goods: "provisions",
    treat: "the month's shopping",
    action: "stock up",
    arrivals: "this week's stock",
  },
  electronics_mobile: {
    goods: "phones and accessories",
    treat: "the upgrade you have been waiting on",
    action: "come see",
    arrivals: "the new models",
  },
  tuition_coaching: {
    goods: "our classes",
    treat: "a strong start",
    action: "enrol",
    arrivals: "the new batch",
  },
  jewellery: {
    goods: "our collection",
    treat: "something worth keeping",
    action: "come see",
    arrivals: "the new designs",
  },
  other: {
    goods: "what we do",
    treat: "something good",
    action: "come in",
    arrivals: "what is new",
  },
};

/* ------------------------------------------------------------------ *
 * Composing
 * ------------------------------------------------------------------ */

type Voice = "warm" | "direct" | "short";

const VOICE_LABELS: Record<Voice, string> = {
  warm: "Warm",
  direct: "Straight to the point",
  short: "Short",
};

type Ctx = {
  occasionName: string;
  shopName: string;
  offer: Offer;
  offering: boolean;
  offerText: string;
  details: string;
  subject: string;
  validity: string;
  vocab: CategoryVocab;
};

type Frag = (c: Ctx) => string | null;

/** Picks the first fragment that has what it needs, in a seeded order. */
function pick(bank: Frag[], c: Ctx, rand: () => number): string {
  for (const frag of shuffled(bank, rand)) {
    const out = frag(c);
    if (out && out.trim()) return tidy(out);
  }
  return "";
}

/**
 * Collapses the holes a declined fragment leaves behind: doubled spaces, a
 * space before punctuation, a trailing comma.
 */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/[,\s]+$/g, "")
    .trim();
}

/* ------------------------------------------------------------------ *
 * The banks
 *
 * Telugu is written in Telugu script and Tenglish in the Latin script people
 * actually type in - neither is a transliteration of the English bank, because
 * transliterating English sentence shapes produces text no shopkeeper would
 * write. Where a language has no bank for an angle it falls back to English
 * and says so, rather than silently showing the wrong language.
 * ------------------------------------------------------------------ */

type Bank = { headline: Frag[]; subline: Frag[] };
type AngleBank = Partial<Record<CopyAngle, Record<Voice, Bank>>>;

const EN: AngleBank = {
  offer: {
    warm: {
      headline: [
        (c) => (c.occasionName ? `${c.occasionName} special` : null),
        () => "Just for this week",
        (c) => (c.shopName ? `A little something from ${c.shopName}` : null),
      ],
      subline: [
        (c) => (c.offerText ? `${cap(c.offerText)}${c.validity ? `, ${c.validity}` : ""}` : null),
        (c) => `${cap(c.vocab.action)} ${c.vocab.goods} before it runs out`,
      ],
    },
    direct: {
      headline: [
        (c) => (c.offerText ? cap(c.offerText) : null),
        (c) => (c.occasionName ? `${c.occasionName} offer` : null),
        () => "Offer on now",
      ],
      subline: [
        (c) => (c.validity ? cap(c.validity) : null),
        (c) => (c.details ? c.details : null),
        (c) => `On all ${c.vocab.goods}`,
      ],
    },
    short: {
      headline: [
        (c) => (c.occasionName ? `${c.occasionName} offer` : null),
        () => "This week only",
        () => "Offer on",
      ],
      subline: [
        (c) => (c.validity ? cap(c.validity) : null),
        (c) => (c.shopName ? `At ${c.shopName}` : null),
      ],
    },
  },
  wish: {
    warm: {
      headline: [
        (c) => (c.occasionName ? `Happy ${c.occasionName}` : null),
        (c) => (c.subject ? `Happy ${c.subject}` : null),
      ],
      subline: [
        (c) => (c.shopName ? `From all of us at ${c.shopName}` : null),
        () => "Wishing you and your family a good one",
      ],
    },
    direct: {
      headline: [
        (c) => (c.occasionName ? `${c.occasionName} wishes` : null),
        (c) => (c.subject ? `${c.subject} wishes` : null),
      ],
      subline: [
        (c) => (c.shopName ? `${c.shopName}` : null),
        (c) => (c.details ? c.details : null),
      ],
    },
    short: {
      headline: [
        (c) => (c.occasionName ? `Happy ${c.occasionName}` : null),
        () => "Best wishes",
      ],
      subline: [(c) => (c.shopName ? c.shopName : null)],
    },
  },
  announce: {
    warm: {
      headline: [
        (c) => (c.subject ? cap(c.subject) : null),
        (c) => `${cap(c.vocab.arrivals)} is in`,
      ],
      subline: [
        (c) => (c.details ? c.details : null),
        () => "Come and have a look",
      ],
    },
    direct: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "Now open"],
      subline: [(c) => (c.details ? c.details : null), (c) => (c.shopName ? c.shopName : null)],
    },
    short: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "News"],
      subline: [(c) => (c.details ? c.details : null)],
    },
  },
  new_arrival: {
    warm: {
      headline: [(c) => `${cap(c.vocab.arrivals)} is here`, () => "Just arrived"],
      subline: [
        (c) => (c.details ? c.details : null),
        (c) => `${cap(c.vocab.action)} before the good ones go`,
      ],
    },
    direct: {
      headline: [() => "New arrivals", (c) => cap(c.vocab.arrivals)],
      subline: [(c) => (c.offerText ? cap(c.offerText) : null), (c) => (c.details ? c.details : null)],
    },
    short: {
      headline: [() => "Just in"],
      subline: [(c) => (c.shopName ? `At ${c.shopName}` : null)],
    },
  },
  gratitude: {
    warm: {
      headline: [() => "Thank you", (c) => (c.occasionName ? `Happy ${c.occasionName}` : null)],
      subline: [
        (c) => (c.shopName ? `Everyone at ${c.shopName} is grateful for you` : null),
        () => "For trusting us all these years",
      ],
    },
    direct: {
      headline: [() => "Thank you"],
      subline: [(c) => (c.details ? c.details : null), (c) => (c.shopName ? c.shopName : null)],
    },
    short: {
      headline: [() => "Thank you"],
      subline: [(c) => (c.shopName ? c.shopName : null)],
    },
  },
  social_proof: {
    warm: {
      headline: [() => "What our customers say"],
      subline: [(c) => (c.details ? `"${c.details}"` : null), () => "Come see for yourself"],
    },
    direct: {
      headline: [() => "Customer review"],
      subline: [(c) => (c.details ? `"${c.details}"` : null)],
    },
    short: {
      headline: [() => "Reviews"],
      subline: [(c) => (c.details ? `"${c.details}"` : null)],
    },
  },
  invite: {
    warm: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "You are invited"],
      subline: [(c) => (c.details ? c.details : null), (c) => (c.shopName ? `At ${c.shopName}` : null)],
    },
    direct: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "Join us"],
      subline: [(c) => (c.details ? c.details : null)],
    },
    short: {
      headline: [() => "Join us"],
      subline: [(c) => (c.details ? c.details : null)],
    },
  },
};

const TENGLISH: AngleBank = {
  offer: {
    warm: {
      headline: [
        (c) => (c.occasionName ? `${c.occasionName} special` : null),
        () => "Mee kosam special offer",
      ],
      subline: [
        (c) => (c.offerText ? `${cap(c.offerText)}${c.validity ? `, ${c.validity}` : ""}` : null),
        (c) => `${cap(c.vocab.goods)} meeda offer`,
      ],
    },
    direct: {
      headline: [
        (c) => (c.offerText ? cap(c.offerText) : null),
        (c) => (c.occasionName ? `${c.occasionName} offer` : null),
        () => "Offer ippude",
      ],
      subline: [
        (c) => (c.validity ? cap(c.validity) : null),
        (c) => (c.details ? c.details : null),
      ],
    },
    short: {
      headline: [
        (c) => (c.occasionName ? `${c.occasionName} offer` : null),
        () => "Ee week matrame",
      ],
      subline: [(c) => (c.shopName ? `${c.shopName} lo` : null)],
    },
  },
  wish: {
    warm: {
      headline: [
        (c) => (c.occasionName ? `${c.occasionName} shubhakankshalu` : null),
        (c) => (c.subject ? `${c.subject} shubhakankshalu` : null),
      ],
      subline: [
        (c) => (c.shopName ? `${c.shopName} tarapuna` : null),
        () => "Mee andariki shubhakankshalu",
      ],
    },
    direct: {
      headline: [(c) => (c.occasionName ? `Happy ${c.occasionName}` : null)],
      subline: [(c) => (c.shopName ? c.shopName : null)],
    },
    short: {
      headline: [(c) => (c.occasionName ? `${c.occasionName} shubhakankshalu` : null)],
      subline: [(c) => (c.shopName ? c.shopName : null)],
    },
  },
  announce: {
    warm: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "Kotthaga vachindi"],
      subline: [(c) => (c.details ? c.details : null), () => "Okasari vachi chudandi"],
    },
    direct: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "Ippudu open"],
      subline: [(c) => (c.details ? c.details : null)],
    },
    short: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "Kotthaga"],
      subline: [(c) => (c.details ? c.details : null)],
    },
  },
};

const TELUGU: AngleBank = {
  offer: {
    warm: {
      headline: [
        (c) => (c.occasionName ? `${c.occasionName} ప్రత్యేకం` : null),
        () => "మీ కోసం ప్రత్యేక ఆఫర్",
      ],
      subline: [
        (c) => (c.offerText ? `${cap(c.offerText)}${c.validity ? `, ${c.validity}` : ""}` : null),
        () => "ఈ అవకాశం వదులుకోకండి",
      ],
    },
    direct: {
      headline: [
        (c) => (c.offerText ? cap(c.offerText) : null),
        (c) => (c.occasionName ? `${c.occasionName} ఆఫర్` : null),
        () => "ప్రత్యేక ఆఫర్",
      ],
      subline: [
        (c) => (c.validity ? cap(c.validity) : null),
        (c) => (c.details ? c.details : null),
      ],
    },
    short: {
      headline: [
        (c) => (c.occasionName ? `${c.occasionName} ఆఫర్` : null),
        () => "ఈ వారం మాత్రమే",
      ],
      subline: [(c) => (c.shopName ? c.shopName : null)],
    },
  },
  wish: {
    warm: {
      headline: [
        (c) => (c.occasionName ? `${c.occasionName} శుభాకాంక్షలు` : null),
        (c) => (c.subject ? `${c.subject} శుభాకాంక్షలు` : null),
      ],
      subline: [
        (c) => (c.shopName ? `${c.shopName} తరపున` : null),
        () => "మీ అందరికీ శుభాకాంక్షలు",
      ],
    },
    direct: {
      headline: [(c) => (c.occasionName ? `${c.occasionName} శుభాకాంక్షలు` : null)],
      subline: [(c) => (c.shopName ? c.shopName : null)],
    },
    short: {
      headline: [(c) => (c.occasionName ? `శుభ ${c.occasionName}` : null)],
      subline: [(c) => (c.shopName ? c.shopName : null)],
    },
  },
  announce: {
    warm: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "కొత్తగా వచ్చింది"],
      subline: [(c) => (c.details ? c.details : null), () => "ఒకసారి వచ్చి చూడండి"],
    },
    direct: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "ఇప్పుడు అందుబాటులో"],
      subline: [(c) => (c.details ? c.details : null)],
    },
    short: {
      headline: [(c) => (c.subject ? cap(c.subject) : null), () => "కొత్తగా"],
      subline: [(c) => (c.details ? c.details : null)],
    },
  },
};

const BANKS: Record<ProjectLanguage, AngleBank> = {
  english: EN,
  tenglish: TENGLISH,
  telugu: TELUGU,
};

/* ------------------------------------------------------------------ *
 * Call-to-action wording
 * ------------------------------------------------------------------ */

const CTA_LABELS: Record<ProjectLanguage, Record<PosterCta, string>> = {
  english: {
    visit: "Visit us today",
    call: "Call now",
    whatsapp: "WhatsApp us",
    order: "Order now",
    book: "Book your slot",
    none: "",
  },
  tenglish: {
    visit: "Ee roju randi",
    call: "Ippude call cheyandi",
    whatsapp: "WhatsApp cheyandi",
    order: "Ippude order cheyandi",
    book: "Slot book cheyandi",
    none: "",
  },
  telugu: {
    visit: "ఈ రోజే రండి",
    call: "ఇప్పుడే కాల్ చేయండి",
    whatsapp: "వాట్సాప్ చేయండి",
    order: "ఇప్పుడే ఆర్డర్ చేయండి",
    book: "స్లాట్ బుక్ చేయండి",
    none: "",
  },
};

export function ctaLabel(cta: PosterCta, language: ProjectLanguage): string {
  return CTA_LABELS[language]?.[cta] ?? CTA_LABELS.english[cta];
}

/* ------------------------------------------------------------------ *
 * Length
 * ------------------------------------------------------------------ */

/**
 * Roughly what fits at a readable size. The generator prefers a shorter
 * fragment over truncating, because a headline ending in an ellipsis is worse
 * than a plainer headline that finishes its sentence.
 */
export const MAX_HEADLINE_CHARS: Record<PosterSize, number> = {
  square: 42,
  story: 38,
  landscape: 46,
};

export function fitsPoster(headline: string, size: PosterSize): boolean {
  return headline.length <= MAX_HEADLINE_CHARS[size];
}

/* ------------------------------------------------------------------ *
 * Caption and hashtags
 * ------------------------------------------------------------------ */

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "till 16 Sep" - the phrase, not a formatted date field. */
export function validityPhrase(validUntil: string | null): string {
  if (!validUntil) return "";
  const [, m, d] = validUntil.split("-").map(Number);
  if (!m || !d) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `till ${d} ${months[m - 1]}`;
}

/**
 * The words that go *under* the picture. Separate from the poster copy on
 * purpose: this is rebuilt after the owner edits a headline in place, without
 * re-running the whole generator.
 */
export function captionFor(
  copy: Pick<PosterCopy, "headline" | "subline">,
  brand: BrandProfile,
  brief: PosterBrief
): string {
  const lines: string[] = [];
  lines.push(copy.headline);
  if (copy.subline && copy.subline !== copy.headline) lines.push(copy.subline);

  if (hasOffer(brief.offer)) {
    const validity = validityPhrase(brief.valid_until);
    lines.push(`${cap(offerSentence(brief.offer))}${validity ? ` - ${validity}` : ""}.`);
  }
  if (brief.details && !lines.includes(brief.details)) lines.push(brief.details);

  const contact = [brand.phone && `Call ${brand.phone}`, brand.address].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);

  return lines.filter(Boolean).join("\n\n");
}

function tagFrom(name: string): string | null {
  const cleaned = name.replace(/[^\p{L}\p{N}]/gu, "");
  return cleaned ? `#${cleaned}` : null;
}

/** Broad to niche, deduped, capped. The shop's own tag always makes the cut. */
export function hashtagsFor(
  occasion: Occasion | BusinessBeat | null,
  brand: BrandProfile
): string[] {
  const tags = [
    ...(occasion?.hashtags ?? []),
    ...CATEGORY_TAGS[brand.category],
    tagFrom(brand.shop_name),
  ].filter((t): t is string => Boolean(t));

  return Array.from(new Set(tags)).slice(0, 12);
}

const CATEGORY_TAGS: Record<BusinessCategory, string[]> = {
  sweets_bakery: ["#Sweets", "#Bakery", "#FreshlyMade"],
  salon_spa: ["#Salon", "#Spa", "#SelfCare"],
  gym_fitness: ["#Fitness", "#Gym", "#FitIndia"],
  clinic_pharmacy: ["#Health", "#Clinic", "#Pharmacy"],
  boutique_clothing: ["#Boutique", "#Fashion", "#NewCollection"],
  restaurant_cafe: ["#Food", "#Restaurant", "#Cafe"],
  grocery_kirana: ["#Grocery", "#Kirana", "#DailyNeeds"],
  electronics_mobile: ["#Mobiles", "#Electronics", "#Gadgets"],
  tuition_coaching: ["#Tuition", "#Coaching", "#Education"],
  jewellery: ["#Jewellery", "#Gold", "#Silver"],
  other: ["#LocalBusiness", "#SmallBusiness"],
};

/* ------------------------------------------------------------------ *
 * The local writer
 * ------------------------------------------------------------------ */

/**
 * Which bank to read from.
 *
 * An offer beats the occasion's own angle: a shop that put "buy one get one"
 * into a Diwali post wants an offer poster with Diwali on it, not a greeting
 * with a discount hidden in the corner.
 */
function angleFor(brief: PosterBrief, occasion: Occasion | BusinessBeat | null): CopyAngle {
  if (hasOffer(brief.offer)) return "offer";
  if (occasion) return occasion.angle;
  if (brief.kind === "announcement") return "announce";
  return "wish";
}

const VOICES: Voice[] = ["warm", "direct", "short"];

function localWriteCopy(request: CopyRequest): Promise<CopyOption[]> {
  const { brief, occasion, brand, language, size } = request;
  const count = request.count ?? 3;

  const angle = angleFor(brief, occasion);
  const offering = hasOffer(brief.offer);

  const ctx: Ctx = {
    occasionName: occasion?.name ?? "",
    shopName: brand.shop_name.trim(),
    offer: brief.offer,
    offering,
    offerText: offering ? offerSentence(brief.offer) : "",
    details: brief.details.trim(),
    subject: brief.subject.trim(),
    validity: validityPhrase(brief.valid_until),
    vocab: CATEGORY_VOCAB[brand.category],
  };

  // Fall back to English rather than showing an empty card, and say so.
  const preferred = BANKS[language]?.[angle];
  const fallback_language = !preferred;
  const bankForAngle = preferred ?? BANKS.english[angle] ?? EN.wish!;

  const options: CopyOption[] = VOICES.slice(0, count).map((voice, index) => {
    const seed = [
      request.seed ?? "",
      brief.occasion_id ?? ctx.subject,
      language,
      brand.category,
      angle,
      voice,
      index,
    ].join("|");
    const rand = mulberry32(hashString(seed));
    const bank = bankForAngle[voice];

    let headline = brief.headline_input.trim() || pick(bank.headline, ctx, rand);
    const subline = pick(bank.subline, ctx, rand);

    // Prefer a shorter line over an ellipsis. If even the short voice
    // overflows, the composer warns rather than silently cutting a word in
    // half - which in Telugu can split a conjunct and render a broken glyph.
    if (!fitsPoster(headline, size) && !brief.headline_input.trim()) {
      const shorter = pick(bankForAngle.short.headline, ctx, rand);
      if (shorter && shorter.length < headline.length) headline = shorter;
    }

    const cta_label = ctaLabel(brief.cta, language);

    return {
      id: `${angle}-${voice}`,
      headline,
      subline,
      cta_label,
      caption: captionFor({ headline, subline }, brand, brief),
      hashtags: hashtagsFor(occasion, brand),
      angle_label: VOICE_LABELS[voice],
      fallback_language,
    };
  });

  return Promise.resolve(options);
}

/**
 * The seam. Point this at a fetch-backed writer and nothing above it changes.
 */
export const writeCopy: CopyWriter = localWriteCopy;
