"use client";

import { OFFER_KINDS, type Offer, type OfferKind } from "@/types/poster";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { cn } from "@/lib/utils/cn";

/**
 * What the offer actually is.
 *
 * The kind is picked from a row of the offers Indian shops actually run, and
 * only the fields that kind needs are shown - a "buy 1 get 1" has no
 * percentage to type, and asking for one is how a form teaches people that it
 * was not built for them.
 *
 * Not a `Segmented`: there are nine of these and they wrap to three rows, so
 * the evenly-stretched row Segmented draws would read as a broken grid.
 */
export function OfferForm({
  offer,
  onChange,
}: {
  offer: Offer;
  onChange: (offer: Offer) => void;
}) {
  const spec = OFFER_KINDS.find((k) => k.value === offer.kind) ?? OFFER_KINDS[0];
  const set = (patch: Partial<Offer>) => onChange({ ...offer, ...patch });

  const chooseKind = (kind: OfferKind) => {
    // The numbers rarely carry over meaningfully - 20 means percent in one
    // kind and rupees in the next - so a change of kind starts them clean and
    // keeps what the offer is *on*, which does carry over.
    set({ kind, value: "", value2: "", text: "" });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">What is the offer?</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Offer type">
          {OFFER_KINDS.map((kind) => {
            const selected = kind.value === offer.kind;
            return (
              <button
                key={kind.value}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseKind(kind.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:border-ring hover:bg-muted/50"
                )}
              >
                <span className="block">{kind.label}</span>
                <span
                  className={cn(
                    "block text-[10px] font-normal",
                    selected ? "text-muted-foreground" : "text-muted-foreground/70"
                  )}
                >
                  {kind.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {spec.fields.includes("value") && (
          <div className="space-y-1.5">
            <Label htmlFor="offer-value">{valueLabel(offer.kind)}</Label>
            <Input
              id="offer-value"
              inputMode="numeric"
              value={offer.value}
              placeholder={valuePlaceholder(offer.kind)}
              onChange={(e) => set({ value: e.target.value })}
            />
          </div>
        )}

        {spec.fields.includes("value2") && (
          <div className="space-y-1.5">
            <Label htmlFor="offer-value2">Customer gets</Label>
            <Input
              id="offer-value2"
              inputMode="numeric"
              value={offer.value2}
              placeholder="1"
              onChange={(e) => set({ value2: e.target.value })}
            />
          </div>
        )}

        {spec.fields.includes("text") && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="offer-text">Write the offer</Label>
            <Input
              id="offer-text"
              value={offer.text}
              placeholder="Free home delivery"
              onChange={(e) => set({ text: e.target.value })}
            />
          </div>
        )}

        {spec.fields.includes("item") && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="offer-item">On what? (optional)</Label>
            <Input
              id="offer-item"
              value={offer.item}
              placeholder="all sweets"
              onChange={(e) => set({ item: e.target.value })}
            />
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="offer-min">Minimum purchase (optional)</Label>
          <Input
            id="offer-min"
            inputMode="numeric"
            value={offer.min_purchase}
            placeholder="1000"
            onChange={(e) => set({ min_purchase: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Printed small under the offer, so the condition is on the poster rather
            than a surprise at the counter.
          </p>
        </div>
      </div>
    </div>
  );
}

function valueLabel(kind: OfferKind): string {
  switch (kind) {
    case "percent_off":
    case "first_visit":
      return "Percent off";
    case "flat_off":
      return "Rupees off";
    case "combo_price":
    case "flat_price":
      return "Price";
    case "buy_x_get_y":
      return "Customer buys";
    case "free_gift":
      return "Gift value (optional)";
    default:
      return "Value";
  }
}

function valuePlaceholder(kind: OfferKind): string {
  switch (kind) {
    case "percent_off":
    case "first_visit":
      return "20";
    case "flat_off":
      return "200";
    case "combo_price":
      return "299";
    case "flat_price":
      return "499";
    case "buy_x_get_y":
      return "2";
    default:
      return "";
  }
}
