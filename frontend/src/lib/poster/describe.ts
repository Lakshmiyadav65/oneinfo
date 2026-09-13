/**
 * Saying out loud what the poster shows.
 *
 * A canvas is a picture of text, and a screen reader cannot see any of it. The
 * form is still the source of truth - every word on the poster came from a
 * labelled input the owner has already navigated - so this is not the only way
 * to reach the content. It is what makes the *preview* mean something, and it
 * is also the seed of the caption, so the description a screen-reader user
 * hears is close to what actually gets posted.
 */

import type { PosterDesign } from "@/types/poster";
import type { RenderReport } from "@/lib/poster/template";

/** One clause per filled slot, in the order they are read on the poster. */
export function describePoster(design: PosterDesign): string {
  const c = design.content;
  const clauses: string[] = [];

  const kind = c.offerBig ? "Offer poster" : "Poster";
  clauses.push(c.occasion ? `${kind} for ${c.occasion}.` : `${kind}.`);

  if (c.headline.trim()) clauses.push(`${c.headline.trim()}.`);
  if (c.offerBig.trim()) {
    clauses.push(c.offerSmall.trim() ? `${c.offerSmall.trim()}.` : `${c.offerBig.trim()}.`);
  }
  if (c.subline.trim()) clauses.push(`${c.subline.trim()}.`);
  if (c.validity.trim()) clauses.push(`${c.validity.trim()}.`);
  if (c.terms.trim()) clauses.push(`${c.terms.trim()}.`);
  if (c.cta.trim()) clauses.push(`${c.cta.trim()}.`);

  const from = [design.brand.name.trim(), design.brand.phone.trim() && `phone ${design.brand.phone.trim()}`]
    .filter(Boolean)
    .join(", ");
  if (from) clauses.push(`From ${from}.`);

  return clauses.join(" ");
}

/**
 * What changed that the owner should know about, for the live region.
 *
 * Only things they can act on. "Rendered in 4ms" is not one of them.
 */
export function reportMessage(report: RenderReport): string {
  const notes: string[] = [];

  if (report.missing.includes("logo")) notes.push("Your logo is still loading.");
  if (report.missing.includes("background")) notes.push("The background image is still loading.");

  const tight = report.tight.filter((slot) => slot !== "brand");
  if (tight.includes("headline")) notes.push("The headline was shortened to fit.");
  if (tight.includes("offer")) notes.push("The offer was shrunk to fit.");
  if (tight.includes("subline")) notes.push("The second line was shortened to fit.");
  if (report.tight.includes("brand")) notes.push("There is little room for your shop details.");

  return notes.join(" ");
}
