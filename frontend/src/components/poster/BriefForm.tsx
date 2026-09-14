"use client";

import type { BusinessCategory, OccasionKind, PosterBrief, PosterCta } from "@/types/poster";
import { OCCASION_KINDS, POSTER_CTAS } from "@/types/poster";
import {
  daysUntilLabel,
  occasionById,
  shortDate,
  upcomingOccasions,
} from "@/lib/poster/occasions";
import { OccasionChip } from "@/components/poster/OccasionChip";
import { OfferForm } from "@/components/poster/OfferForm";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Segmented } from "@/components/ui/Segmented";
import { Textarea } from "@/components/ui/Textarea";

/**
 * What this poster is about.
 *
 * The offer comes first and the festival second, which is the opposite of how
 * a calendar-shaped product would order it - but it matches why a shop
 * actually posts. Ganesh Chaturthi is the reason the offer goes out this week,
 * not a separate thing to make a poster about.
 */
export function BriefForm({
  brief,
  category,
  today,
  onChange,
}: {
  brief: PosterBrief;
  category: BusinessCategory;
  /** Passed in rather than read here, so the form renders the same on server and client. */
  today: string;
  onChange: (brief: PosterBrief) => void;
}) {
  const set = (patch: Partial<PosterBrief>) => onChange({ ...brief, ...patch });

  const upcoming = upcomingOccasions(today, category, 8);
  const selected = brief.occasion_id ? occasionById(brief.occasion_id) : null;
  // A festival chosen from the calendar may not be in the next eight, so it is
  // added to the row rather than silently deselected.
  const shown = selected && !upcoming.some((u) => u.occasion.id === selected.id)
    ? [{ occasion: selected, date: "", day: 0 }, ...upcoming]
    : upcoming;

  return (
    <div className="space-y-5">
      <Segmented<OccasionKind>
        label="What are you posting?"
        value={brief.kind}
        options={OCCASION_KINDS.map((k) => ({ value: k.value, label: k.label, hint: k.hint }))}
        onChange={(kind) => set({ kind })}
      />

      {brief.kind !== "announcement" && (
        <OfferForm offer={brief.offer} onChange={(offer) => set({ offer })} />
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {brief.kind === "festival" ? "Which festival?" : "Tie it to an occasion? (optional)"}
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Occasion">
          <OccasionChip
            label="No occasion"
            selected={!brief.occasion_id}
            onSelect={() =>
              set({
                occasion_id: null,
                // The festival's own name was filled in as the subject when it
                // was picked; left behind, it would become the headline of a
                // poster that no longer has a festival.
                subject: selected && brief.subject === selected.name ? "" : brief.subject,
              })
            }
          />
          {shown.map(({ occasion, date }) => (
            <OccasionChip
              key={occasion.id}
              label={occasion.name}
              meta={date ? `${shortDate(date)} · ${daysUntilLabel(today, date)}` : "date varies"}
              uncertain={!date}
              selected={brief.occasion_id === occasion.id}
              onSelect={() =>
                set({
                  occasion_id: occasion.id,
                  // The festival is the poster's subject unless they typed one
                  // of their own. The previous festival's name does not count
                  // as typed - it was ours, filled in when that one was picked.
                  subject:
                    !brief.subject || (selected && brief.subject === selected.name)
                      ? occasion.name
                      : brief.subject,
                })
              }
            />
          ))}
        </div>
      </div>

      {!brief.occasion_id && (
        <div className="space-y-1.5">
          <Label htmlFor="brief-subject">
            {brief.kind === "announcement" ? "What is the news?" : "What is it for?"}
          </Label>
          <Input
            id="brief-subject"
            value={brief.subject}
            placeholder={
              brief.kind === "announcement" ? "New branch in Kukatpally" : "Weekend special"
            }
            onChange={(e) => set({ subject: e.target.value })}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="brief-details">Anything else to say? (optional)</Label>
        <Textarea
          id="brief-details"
          rows={2}
          value={brief.details}
          placeholder="Fresh stock every morning. Home delivery available."
          onChange={(e) => set({ details: e.target.value })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="brief-until">Offer valid till (optional)</Label>
          <Input
            id="brief-until"
            type="date"
            value={brief.valid_until ?? ""}
            onChange={(e) => set({ valid_until: e.target.value || null })}
          />
        </div>
        <Segmented<PosterCta>
          label="Button on the poster"
          value={brief.cta}
          options={POSTER_CTAS.map((c) => ({ value: c.value, label: c.label }))}
          onChange={(cta) => set({ cta })}
        />
      </div>
    </div>
  );
}
