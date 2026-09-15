/**
 * Where posters live until there is a backend.
 *
 * This is the first localStorage in the app, so it sets the pattern. Three
 * rules are worth stating outright:
 *
 * NOTHING READS STORAGE DURING RENDER. Not in a useState initializer, not in a
 * module body that a component reads. Server-rendered HTML would disagree with
 * the first client render and Next hydration-errors on it. Views seed their
 * state in a mount effect instead. The cost is one frame of "loading", which
 * we want anyway - it lets these pages reuse the same loading/error/empty
 * ladder as the rest of the app.
 *
 * ONE BAD RECORD IS NOT A BAD LIBRARY. Each post is validated on its own and a
 * corrupt one is dropped. Somebody who hand-edited storage, or whose write was
 * cut off halfway, should not lose thirty posters over it.
 *
 * DESIGNS ARE STORED, IMAGES ARE NOT. A 1080x1080 PNG as a data URL is one to
 * three megabytes and three of them fill the whole quota; a design is one or
 * two kilobytes, so hundreds fit. JSON is also the only form that stays
 * editable - reopen Diwali, change 20% to 30%, render again - and it picks up
 * renderer and font fixes for free. The one exception is the small library
 * thumbnail, which is explicitly disposable.
 */

import { z } from "zod";
import { deletePhoto, isStoredPhoto } from "@/lib/poster/photo-store";
import {
  DEFAULT_BRAND,
  type BrandProfile,
  type PosterPost,
} from "@/types/poster";

const BRAND_KEY = "oneinfo.poster.brand.v1";
const POSTS_KEY = "oneinfo.poster.posts.v1";
const DRAFT_KEY = "oneinfo.poster.draft.v1";

const SCHEMA_VERSION = 1;

/** Beyond this the oldest are dropped, so a long-running library cannot fill the quota. */
export const MAX_POSTS = 60;

export type StorageResult =
  | { ok: true }
  | { ok: false; reason: "quota" | "unavailable" | "corrupt" };

/* ------------------------------------------------------------------ *
 * The backing store
 * ------------------------------------------------------------------ */

/**
 * Safari in private mode throws on the very act of touching localStorage, and
 * some browsers are configured to block site data outright. Falling back to a
 * map for the session keeps the composer completely usable - downloading a
 * poster never needed storage in the first place - and the library says so
 * rather than looking broken.
 */
const memory = new Map<string, string>();
let storageWorks: boolean | null = null;

function available(): boolean {
  if (storageWorks !== null) return storageWorks;
  if (typeof window === "undefined") return false;
  try {
    const probe = "oneinfo.poster.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    storageWorks = true;
  } catch {
    storageWorks = false;
  }
  return storageWorks;
}

/** True when writes only last for this tab. The library shows a quiet note. */
export function isEphemeral(): boolean {
  return typeof window !== "undefined" && !available();
}

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  if (!available()) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): StorageResult {
  if (typeof window === "undefined") return { ok: false, reason: "unavailable" };
  if (!available()) {
    memory.set(key, value);
    return { ok: true };
  }
  try {
    window.localStorage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return { ok: false, reason: quota ? "quota" : "unavailable" };
  }
}

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

const languageSchema = z.enum(["english", "tenglish", "telugu"]);

const brandSchema = z.object({
  shop_name: z.string(),
  category: z.string(),
  tagline: z.string(),
  phone: z.string(),
  whatsapp: z.string(),
  address: z.string(),
  logo_data_url: z.string().nullable(),
  brand_color: z.string(),
  accent_color: z.string(),
  language: languageSchema,
});

const offerSchema = z.object({
  kind: z.string(),
  value: z.string(),
  value2: z.string(),
  item: z.string(),
  text: z.string(),
  min_purchase: z.string(),
});

const briefSchema = z.object({
  occasion_id: z.string().nullable(),
  kind: z.string(),
  subject: z.string(),
  headline_input: z.string(),
  details: z.string(),
  offer: offerSchema,
  valid_until: z.string().nullable(),
  cta: z.string(),
});

const copySchema = z.object({
  headline: z.string(),
  subline: z.string(),
  cta_label: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
});

/**
 * The design is checked for the fields the renderer dereferences, and left
 * loose beyond that. A stricter schema here would mean every new background
 * variant invalidates posters that were saved before it existed - which is the
 * opposite of what versioning is for.
 */
const designSchema = z.object({
  v: z.literal(1),
  templateId: z.string(),
  sizeId: z.string(),
  styleId: z.string(),
  language: languageSchema,
  content: z.object({
    headline: z.string(),
    subline: z.string(),
    offerBig: z.string(),
    offerSmall: z.string(),
    terms: z.string(),
    cta: z.string(),
    occasion: z.string(),
    validity: z.string(),
  }),
  brand: z.object({
    name: z.string(),
    phone: z.string(),
    tagline: z.string(),
    logo: z.object({ slot: z.string(), src: z.string() }).loose().nullable(),
    accentColor: z.string().nullable(),
  }),
  background: z.object({ kind: z.string() }).loose(),
  // Optional, so posters saved before decor existed still parse. Loose per
  // item, so an ornament added later does not invalidate older builds' reads.
  decor: z.array(z.object({ kind: z.string() }).loose()).optional(),
  photo: z.object({ slot: z.string(), src: z.string() }).loose().nullable(),
});

const postSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  occasion_date: z.string().nullable(),
  brief: briefSchema,
  style: z.string(),
  size: z.string(),
  language: languageSchema,
  copy: copySchema,
  copy_variant_id: z.string(),
  design: designSchema,
  thumbnail_data_url: z.string().nullable(),
  design_id: z.string().nullable().optional(),
  photo: z
    .object({
      src: z.string(),
      focus: z.object({ x: z.number(), y: z.number() }),
      strength: z.enum(["vivid", "balanced", "muted"]),
    })
    .nullable()
    .optional(),
});

const envelopeSchema = z.object({
  version: z.number(),
  updated_at: z.string(),
  posts: z.array(z.unknown()),
});

/* ------------------------------------------------------------------ *
 * The brand profile
 * ------------------------------------------------------------------ */

export function loadBrand(): BrandProfile | null {
  const raw = readRaw(BRAND_KEY);
  if (!raw) return null;
  try {
    const parsed = brandSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    // Merged over the defaults so a profile saved before a field existed still
    // opens, with the new field at its default rather than undefined.
    return { ...DEFAULT_BRAND, ...(parsed.data as Partial<BrandProfile>) };
  } catch {
    return null;
  }
}

export function saveBrand(brand: BrandProfile): StorageResult {
  return writeRaw(BRAND_KEY, JSON.stringify(brand));
}

/* ------------------------------------------------------------------ *
 * Posters
 * ------------------------------------------------------------------ */

export type Library = {
  posts: PosterPost[];
  /** Something is there but we cannot read it. Shown, never overwritten. */
  unreadable: boolean;
};

export function loadPosts(): Library {
  const raw = readRaw(POSTS_KEY);
  if (!raw) return { posts: [], unreadable: false };

  let outer: unknown;
  try {
    outer = JSON.parse(raw);
  } catch {
    return { posts: [], unreadable: true };
  }

  const envelope = envelopeSchema.safeParse(outer);
  if (!envelope.success) return { posts: [], unreadable: true };

  // Written by a newer build than this one. Left exactly as it is: replacing
  // it with an empty list would destroy work that a later version can read.
  if (envelope.data.version > SCHEMA_VERSION) return { posts: [], unreadable: true };

  const posts: PosterPost[] = [];
  for (const row of envelope.data.posts) {
    const parsed = postSchema.safeParse(row);
    if (parsed.success) posts.push(parsed.data as unknown as PosterPost);
  }

  posts.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { posts, unreadable: false };
}

function writePosts(posts: PosterPost[]): StorageResult {
  const trimmed = posts.slice(0, MAX_POSTS);
  return writeRaw(
    POSTS_KEY,
    JSON.stringify({
      version: SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
      posts: trimmed,
    })
  );
}

export function savePost(post: PosterPost): StorageResult {
  const { posts, unreadable } = loadPosts();
  // Refuse to write over something we could not read, rather than silently
  // replacing a library we do not understand with a library of one.
  if (unreadable) return { ok: false, reason: "corrupt" };

  const without = posts.filter((p) => p.id !== post.id);
  const result = writePosts([post, ...without]);

  // A full quota is nearly always thumbnails. Dropping them costs a grid of
  // grey tiles, which beats refusing to save the poster at all.
  if (!result.ok && result.reason === "quota") {
    const lean = [post, ...without].map((p) => ({ ...p, thumbnail_data_url: null }));
    return writePosts(lean);
  }
  return result;
}

export function deletePost(id: string): StorageResult {
  const { posts, unreadable } = loadPosts();
  if (unreadable) return { ok: false, reason: "corrupt" };
  const removed = posts.find((p) => p.id === id);
  const result = writePosts(posts.filter((p) => p.id !== id));
  if (result.ok && removed?.photo) void forgetPhotoIfUnused(removed.photo.src);
  return result;
}

/* ------------------------------------------------------------------ *
 * Photos
 * ------------------------------------------------------------------ */

/**
 * Deletes a stored photo once nothing points at it any more.
 *
 * Checked against every saved poster and the open draft, because photos are
 * shared rather than copied: "make another like this" gives the new draft the
 * same photo reference, and deleting the original must not blank the copy.
 */
export async function forgetPhotoIfUnused(ref: string): Promise<void> {
  if (!isStoredPhoto(ref)) return;
  const { posts, unreadable } = loadPosts();
  // A library we cannot read might well reference it. Keep the photo.
  if (unreadable) return;
  if (posts.some((p) => p.photo?.src === ref)) return;
  const draft = loadDraft<{ photo?: { src?: string } | null }>();
  if (draft?.photo?.src === ref) return;
  await deletePhoto(ref);
}

/* ------------------------------------------------------------------ *
 * The unsaved draft
 * ------------------------------------------------------------------ */

/**
 * One slot, separate from the library.
 *
 * A half-filled poster should survive a refresh, but it should not appear in
 * the library - a grid full of abandoned drafts is worse than losing them.
 */
export function loadDraft<T>(): T | null {
  const raw = readRaw(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveDraft(draft: unknown): void {
  if (draft === null) {
    if (available()) {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* nothing to do - the draft is a convenience */
      }
    } else {
      memory.delete(DRAFT_KEY);
    }
    return;
  }
  writeRaw(DRAFT_KEY, JSON.stringify(draft));
}
