/**
 * The year a small shop actually plans around.
 *
 * THE RULE, for whoever edits this next: lunar festival dates are copied from
 * a panchangam, one year at a time. They are never computed, never guessed,
 * and never extrapolated from last year by adding eleven days. If you do not
 * have a source in front of you, leave the year out of `dates` - the calendar
 * degrades into a "dates that move" list, which is correct and honest. A wrong
 * date is far worse than a missing one: it means someone posts a Diwali
 * greeting three days early, to their customers, with their name on it.
 *
 * Three confidence levels carry that distinction into the UI:
 *
 *   "fixed"       Gregorian-anchored. Correct in every year, forever.
 *   "verified"    Lunar, typed in per year from the source named below.
 *   "approximate" Moon-sighting or regionally variable. Carries a `window`,
 *                 never a day, and the UI says so out loud.
 *
 * Business beats are separate: they recur by rule, so they have no dates at
 * all and work in any year.
 */

import type {
  BusinessCategory,
  CopyAngle,
  OccasionKind,
  PosterStyle,
} from "@/types/poster";

/** Checked against drikpanchang.com Telugu calendar for 2026 and 2027. */
export const OCCASIONS_SOURCE = "drikpanchang.com Telugu calendar";
export const OCCASIONS_VERIFIED_ON = "2026-09-11";

/** Years for which lunar dates have actually been typed in. */
export const OCCASION_DATA_YEARS = [2026, 2027] as const;

export type DateConfidence = "fixed" | "verified" | "approximate";

export type Occasion = {
  id: string;
  name: string;
  /** Telugu script, for the Telugu copy bank. Absent where there is no Telugu name. */
  name_te?: string;
  kind: OccasionKind;
  /** Gregorian-anchored days only. A lunar festival must never have this. */
  fixed?: { month: number; day: number };
  /** Year-keyed ISO dates, typed in from the source. A missing year means we do not know. */
  dates?: Record<number, string>;
  /** Roughly when, for festivals we cannot pin to a day. */
  window?: { month: number; note: string };
  date_confidence: DateConfidence;
  /** Empty means it suits every kind of business. */
  suits: BusinessCategory[];
  angle: CopyAngle;
  default_style: PosterStyle;
  hashtags: string[];
};

export type BusinessBeat = {
  id: string;
  name: string;
  /** Beats recur by rule; they have no dates. */
  recurrence:
    | { type: "weekly"; weekday: number }
    | { type: "monthly_nth"; nth: number; weekday: number }
    | { type: "monthday"; day: number };
  suits: BusinessCategory[];
  angle: CopyAngle;
  default_style: PosterStyle;
  hashtags: string[];
};

/* ------------------------------------------------------------------ *
 * Festivals
 * ------------------------------------------------------------------ */

const FESTIVALS: Occasion[] = [
  {
    id: "sankranti",
    name: "Sankranti",
    name_te: "సంక్రాంతి",
    kind: "festival",
    // Solar rather than lunar, so it barely moves - but it is still typed in
    // per year rather than hardcoded to the 14th, because it does occasionally
    // land on the 15th.
    dates: { 2026: "2026-01-14", 2027: "2027-01-14" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "warm_traditional",
    hashtags: ["#Sankranti", "#MakarSankranti", "#Pongal"],
  },
  {
    id: "maha_shivaratri",
    name: "Maha Shivaratri",
    name_te: "మహా శివరాత్రి",
    kind: "festival",
    dates: { 2026: "2026-02-15", 2027: "2027-03-06" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "modern_dark",
    hashtags: ["#MahaShivaratri", "#Shivaratri"],
  },
  {
    id: "holi",
    name: "Holi",
    name_te: "హోళి",
    kind: "festival",
    dates: { 2026: "2026-03-03", 2027: "2027-03-21" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "playful_bright",
    hashtags: ["#Holi", "#HappyHoli", "#FestivalOfColours"],
  },
  {
    id: "ugadi",
    name: "Ugadi",
    name_te: "ఉగాది",
    kind: "festival",
    dates: { 2026: "2026-03-19", 2027: "2027-04-07" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "festive_gold",
    hashtags: ["#Ugadi", "#TeluguNewYear", "#HappyUgadi"],
  },
  {
    id: "sri_rama_navami",
    name: "Sri Rama Navami",
    name_te: "శ్రీ రామ నవమి",
    kind: "festival",
    dates: { 2026: "2026-03-26", 2027: "2027-04-15" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "warm_traditional",
    hashtags: ["#SriRamaNavami", "#RamaNavami"],
  },
  {
    id: "akshaya_tritiya",
    name: "Akshaya Tritiya",
    name_te: "అక్షయ తృతీయ",
    kind: "festival",
    dates: { 2026: "2026-04-19", 2027: "2027-05-09" },
    date_confidence: "verified",
    // The one day in the year a jeweller cannot afford to be quiet on.
    suits: ["jewellery", "electronics_mobile", "boutique_clothing"],
    angle: "offer",
    default_style: "festive_gold",
    hashtags: ["#AkshayaTritiya", "#Gold", "#ShubhMuhurat"],
  },
  {
    id: "krishna_janmashtami",
    name: "Krishna Janmashtami",
    name_te: "కృష్ణ జన్మాష్టమి",
    kind: "festival",
    dates: { 2026: "2026-09-04", 2027: "2027-08-25" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "warm_traditional",
    hashtags: ["#Janmashtami", "#KrishnaJanmashtami"],
  },
  {
    id: "ganesh_chaturthi",
    name: "Ganesh Chaturthi",
    name_te: "వినాయక చవితి",
    kind: "festival",
    dates: { 2026: "2026-09-14", 2027: "2027-09-04" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "festive_gold",
    hashtags: ["#GaneshChaturthi", "#VinayakaChavithi", "#GanpatiBappaMorya"],
  },
  {
    id: "dussehra",
    name: "Dussehra",
    name_te: "దసరా",
    kind: "festival",
    dates: { 2026: "2026-10-20", 2027: "2027-10-09" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "festive_gold",
    hashtags: ["#Dussehra", "#Vijayadashami"],
  },
  {
    id: "diwali",
    name: "Diwali",
    name_te: "దీపావళి",
    kind: "festival",
    dates: { 2026: "2026-11-08", 2027: "2027-10-29" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "festive_gold",
    hashtags: ["#Diwali", "#Deepavali", "#HappyDiwali"],
  },
  {
    id: "karthika_pournami",
    name: "Karthika Pournami",
    name_te: "కార్తీక పౌర్ణమి",
    kind: "festival",
    dates: { 2026: "2026-11-24", 2027: "2027-11-14" },
    date_confidence: "verified",
    suits: [],
    angle: "wish",
    default_style: "warm_traditional",
    hashtags: ["#KarthikaMasam", "#KarthikaPournami"],
  },

  // Below: real festivals whose dates the sources disagreed on, or which move
  // by moon sighting. They carry a month and a note instead of a day, and the
  // calendar surfaces them under "Dates that move" so the owner sets the date
  // themselves. Promote one to `dates` the moment you have it from a source.
  {
    id: "varalakshmi_vratam",
    name: "Varalakshmi Vratam",
    name_te: "వరలక్ష్మి వ్రతం",
    kind: "festival",
    window: { month: 8, note: "A Friday in August - confirm locally" },
    date_confidence: "approximate",
    suits: ["jewellery", "boutique_clothing", "sweets_bakery"],
    angle: "wish",
    default_style: "festive_gold",
    hashtags: ["#VaralakshmiVratam", "#Lakshmi"],
  },
  {
    id: "raksha_bandhan",
    name: "Raksha Bandhan",
    name_te: "రాఖీ పౌర్ణమి",
    kind: "festival",
    window: { month: 8, note: "Sravana Purnima, in August - confirm locally" },
    date_confidence: "approximate",
    suits: [],
    angle: "wish",
    default_style: "playful_bright",
    hashtags: ["#RakshaBandhan", "#Rakhi"],
  },
  {
    id: "bathukamma",
    name: "Bathukamma",
    name_te: "బతుకమ్మ",
    kind: "festival",
    window: { month: 10, note: "Nine days ending before Dussehra - confirm locally" },
    date_confidence: "approximate",
    suits: [],
    angle: "wish",
    default_style: "playful_bright",
    hashtags: ["#Bathukamma", "#Telangana"],
  },
  {
    id: "eid_al_fitr",
    name: "Eid al-Fitr",
    kind: "festival",
    window: { month: 3, note: "Moon sighting - confirm locally" },
    date_confidence: "approximate",
    suits: [],
    angle: "wish",
    default_style: "clean_minimal",
    hashtags: ["#EidMubarak", "#EidAlFitr"],
  },
  {
    id: "eid_al_adha",
    name: "Eid al-Adha",
    kind: "festival",
    window: { month: 5, note: "Moon sighting - confirm locally" },
    date_confidence: "approximate",
    suits: [],
    angle: "wish",
    default_style: "clean_minimal",
    hashtags: ["#EidMubarak", "#Bakrid"],
  },
];

/* ------------------------------------------------------------------ *
 * Civil days - Gregorian, correct every year
 * ------------------------------------------------------------------ */

const CIVIL_DAYS: Occasion[] = [
  {
    id: "new_year",
    name: "New Year",
    kind: "civil_day",
    fixed: { month: 1, day: 1 },
    date_confidence: "fixed",
    suits: [],
    angle: "wish",
    default_style: "playful_bright",
    hashtags: ["#HappyNewYear", "#NewYear"],
  },
  {
    id: "republic_day",
    name: "Republic Day",
    kind: "civil_day",
    fixed: { month: 1, day: 26 },
    date_confidence: "fixed",
    suits: [],
    angle: "wish",
    default_style: "clean_minimal",
    hashtags: ["#RepublicDay"],
  },
  {
    id: "womens_day",
    name: "Women's Day",
    kind: "civil_day",
    fixed: { month: 3, day: 8 },
    date_confidence: "fixed",
    suits: ["salon_spa", "boutique_clothing", "jewellery", "gym_fitness", "clinic_pharmacy"],
    angle: "gratitude",
    default_style: "playful_bright",
    hashtags: ["#WomensDay", "#InternationalWomensDay"],
  },
  {
    id: "telangana_formation_day",
    name: "Telangana Formation Day",
    kind: "civil_day",
    fixed: { month: 6, day: 2 },
    date_confidence: "fixed",
    suits: [],
    angle: "wish",
    default_style: "warm_traditional",
    hashtags: ["#TelanganaFormationDay"],
  },
  {
    id: "independence_day",
    name: "Independence Day",
    kind: "civil_day",
    fixed: { month: 8, day: 15 },
    date_confidence: "fixed",
    suits: [],
    angle: "wish",
    default_style: "clean_minimal",
    hashtags: ["#IndependenceDay", "#15August"],
  },
  {
    id: "teachers_day",
    name: "Teachers' Day",
    kind: "civil_day",
    fixed: { month: 9, day: 5 },
    date_confidence: "fixed",
    suits: ["tuition_coaching"],
    angle: "gratitude",
    default_style: "clean_minimal",
    hashtags: ["#TeachersDay"],
  },
  {
    id: "gandhi_jayanti",
    name: "Gandhi Jayanti",
    kind: "civil_day",
    fixed: { month: 10, day: 2 },
    date_confidence: "fixed",
    suits: [],
    angle: "wish",
    default_style: "clean_minimal",
    hashtags: ["#GandhiJayanti"],
  },
  {
    id: "ap_formation_day",
    name: "AP Formation Day",
    kind: "civil_day",
    fixed: { month: 11, day: 1 },
    date_confidence: "fixed",
    suits: [],
    angle: "wish",
    default_style: "warm_traditional",
    hashtags: ["#AndhraPradesh"],
  },
  {
    id: "childrens_day",
    name: "Children's Day",
    kind: "civil_day",
    fixed: { month: 11, day: 14 },
    date_confidence: "fixed",
    suits: ["tuition_coaching", "sweets_bakery", "boutique_clothing"],
    angle: "wish",
    default_style: "playful_bright",
    hashtags: ["#ChildrensDay"],
  },
  {
    id: "christmas",
    name: "Christmas",
    kind: "civil_day",
    fixed: { month: 12, day: 25 },
    date_confidence: "fixed",
    suits: [],
    angle: "wish",
    default_style: "festive_gold",
    hashtags: ["#Christmas", "#MerryChristmas"],
  },
];

export const OCCASIONS: Occasion[] = [...FESTIVALS, ...CIVIL_DAYS];

/* ------------------------------------------------------------------ *
 * Business beats - the posts that have nothing to do with the calendar
 * ------------------------------------------------------------------ */

export const BUSINESS_BEATS: BusinessBeat[] = [
  {
    id: "weekend_offer",
    name: "Weekend offer",
    recurrence: { type: "weekly", weekday: 5 },
    suits: [],
    angle: "offer",
    default_style: "bold_offer",
    hashtags: ["#WeekendOffer", "#WeekendSpecial"],
  },
  {
    id: "new_arrival",
    name: "New arrivals",
    recurrence: { type: "monthly_nth", nth: 1, weekday: 1 },
    suits: ["boutique_clothing", "jewellery", "electronics_mobile", "grocery_kirana", "sweets_bakery"],
    angle: "new_arrival",
    default_style: "clean_minimal",
    hashtags: ["#NewArrivals", "#JustIn"],
  },
  {
    id: "customer_review",
    name: "Customer review",
    recurrence: { type: "monthly_nth", nth: 3, weekday: 3 },
    suits: [],
    angle: "social_proof",
    default_style: "clean_minimal",
    hashtags: ["#HappyCustomers", "#ThankYou"],
  },
  {
    id: "month_end_sale",
    name: "Month-end sale",
    recurrence: { type: "monthday", day: 25 },
    suits: ["boutique_clothing", "electronics_mobile", "grocery_kirana", "jewellery"],
    angle: "offer",
    default_style: "bold_offer",
    hashtags: ["#Sale", "#MonthEndSale"],
  },
];

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

export function occasionById(id: string): Occasion | null {
  return OCCASIONS.find((o) => o.id === id) ?? null;
}

/** True when this year has no typed-in lunar dates, so the month will look thin. */
export function needsDateRefresh(year: number): boolean {
  return !OCCASION_DATA_YEARS.includes(year as (typeof OCCASION_DATA_YEARS)[number]);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * The date this occasion falls on in `year`, or null when we do not know.
 *
 * Null is a real answer, not a failure. It is what keeps an unverified lunar
 * date off the grid and in the "dates that move" list instead.
 */
export function occasionDate(occasion: Occasion, year: number): string | null {
  if (occasion.fixed) return isoDate(year, occasion.fixed.month, occasion.fixed.day);
  return occasion.dates?.[year] ?? null;
}

function suitsCategory(suits: BusinessCategory[], category: BusinessCategory | null): boolean {
  // An empty list means "suits everyone", which is the common case.
  if (suits.length === 0) return true;
  if (!category || category === "other") return true;
  return suits.includes(category);
}

export type DatedOccasion = { occasion: Occasion; date: string; day: number };

/** Occasions with a known day in this month, soonest first. */
export function occasionsForMonth(
  year: number,
  month: number,
  category: BusinessCategory | null
): DatedOccasion[] {
  const found: DatedOccasion[] = [];
  for (const occasion of OCCASIONS) {
    if (!suitsCategory(occasion.suits, category)) continue;
    const date = occasionDate(occasion, year);
    if (!date) continue;
    const [, m, d] = date.split("-").map(Number);
    if (m !== month) continue;
    found.push({ occasion, date, day: d });
  }
  return found.sort((a, b) => a.day - b.day);
}

/**
 * Occasions that belong to this month but have no day we can stand behind.
 * These are shown as a list under the grid rather than dropped, so the owner
 * knows the festival is coming and can set the date themselves.
 */
export function undatedOccasionsForMonth(
  year: number,
  month: number,
  category: BusinessCategory | null
): Occasion[] {
  return OCCASIONS.filter((occasion) => {
    if (!suitsCategory(occasion.suits, category)) return false;
    if (occasion.window?.month !== month) return false;
    // A window is only worth showing while we still lack a real date.
    return occasionDate(occasion, year) === null;
  });
}

export type BeatOccurrence = { beat: BusinessBeat; date: string; day: number };

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Which days this month each recurring beat lands on. */
export function beatsForMonth(
  year: number,
  month: number,
  category: BusinessCategory | null
): BeatOccurrence[] {
  const out: BeatOccurrence[] = [];
  const total = daysInMonth(year, month);

  for (const beat of BUSINESS_BEATS) {
    if (!suitsCategory(beat.suits, category)) continue;

    if (beat.recurrence.type === "monthday") {
      const day = Math.min(beat.recurrence.day, total);
      out.push({ beat, date: isoDate(year, month, day), day });
      continue;
    }

    const wanted = beat.recurrence.weekday;
    let seen = 0;
    for (let day = 1; day <= total; day += 1) {
      // Month is 1-based here, 0-based in the Date constructor.
      if (new Date(year, month - 1, day).getDay() !== wanted) continue;
      seen += 1;
      if (beat.recurrence.type === "weekly") {
        out.push({ beat, date: isoDate(year, month, day), day });
      } else if (seen === beat.recurrence.nth) {
        out.push({ beat, date: isoDate(year, month, day), day });
        break;
      }
    }
  }

  return out.sort((a, b) => a.day - b.day);
}

/**
 * The next few occasions worth posting about, across year boundaries.
 *
 * This is what makes the calendar's value visible on the library page before
 * anyone has opened the calendar.
 */
export function upcomingOccasions(
  fromISO: string,
  category: BusinessCategory | null,
  limit = 3
): DatedOccasion[] {
  const from = fromISO.slice(0, 10);
  const startYear = Number(from.slice(0, 4));
  const out: DatedOccasion[] = [];

  // Two years is enough for a three-item list and keeps this a bounded loop
  // even when a year has no typed-in dates at all.
  for (const year of [startYear, startYear + 1]) {
    for (const occasion of OCCASIONS) {
      if (!suitsCategory(occasion.suits, category)) continue;
      const date = occasionDate(occasion, year);
      if (!date || date < from) continue;
      out.push({ occasion, date, day: Number(date.slice(8, 10)) });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

/** "in 3 days", "today", "tomorrow" - the chip subtitle. */
export function daysUntilLabel(fromISO: string, dateISO: string): string {
  const from = Date.parse(`${fromISO.slice(0, 10)}T00:00:00`);
  const to = Date.parse(`${dateISO}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return "";
  const days = Math.round((to - from) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 0) return "";
  if (days < 30) return `in ${days} days`;
  const months = Math.round(days / 30);
  return months <= 1 ? "in a month" : `in ${months} months`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

/** "14 Sep" - short enough for a chip. */
export function shortDate(dateISO: string): string {
  const [, m, d] = dateISO.split("-").map(Number);
  return `${d} ${monthName(m).slice(0, 3)}`;
}
