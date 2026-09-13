/**
 * What a template is.
 *
 * Kept in its own file so templates and the renderer can both import the
 * contract without importing each other - render.ts pulls in the template map,
 * and a template that reached back into render.ts for its types would close
 * that loop.
 */

import type { PosterDesign, PosterImageSlot, PosterSize, PosterTemplateId } from "@/types/poster";
import type { PosterAssets } from "@/lib/poster/images";
import type { PosterFrame, PosterRegions } from "@/lib/poster/frame";
import type { PosterFontStacks } from "@/lib/poster/fonts";
import type { ResolvedStyle } from "@/lib/poster/styles";

export type RenderTarget = {
  frame: PosterFrame;
  /** Backing-store pixels per design unit. Export is 1; preview is whatever fits. */
  scale: number;
  purpose: "preview" | "export";
  /**
   * Resolved outside and handed in, so renderPoster never touches `document`.
   * That costs one field and keeps a server-side render possible later.
   */
  stacks: PosterFontStacks;
};

export type SlotId = "headline" | "subline" | "offer" | "cta" | "brand";

export type RenderReport = {
  /** Slots that had to shrink to their floor or lost a line. */
  tight: SlotId[];
  /** Images the design asked for that were not decoded yet. */
  missing: PosterImageSlot[];
  ms: number;
};

export type MutableReport = {
  tight: SlotId[];
  missing: PosterImageSlot[];
};

export type PosterScene = {
  design: PosterDesign;
  assets: PosterAssets;
  frame: PosterFrame;
  regions: PosterRegions;
  /** Colours and font stacks, already resolved. Templates never name a colour. */
  style: ResolvedStyle;
  target: RenderTarget;
  /** Templates push into this; renderPoster collects and returns it. */
  report: MutableReport;
  /** "te" when the poster is in Telugu script, for grapheme segmentation. */
  locale: string;
};

export type PosterTemplate = {
  id: PosterTemplateId;
  label: string;
  /** Regions are a function of the frame, so one template serves every size. */
  regions(frame: PosterFrame, size: PosterSize): PosterRegions;
  draw(ctx: CanvasRenderingContext2D, scene: PosterScene): void;
};
