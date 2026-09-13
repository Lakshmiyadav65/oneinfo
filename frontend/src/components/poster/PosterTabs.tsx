"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * The two halves of this module.
 *
 * Real links rather than a `Segmented`: these are separate routes, and a
 * button-based switch would lose prefetch, middle-click and open-in-new-tab
 * for no gain.
 */
export function PosterTabs() {
  const pathname = usePathname();
  const onCalendar = pathname.startsWith("/posters/calendar");

  return (
    <div className="flex flex-wrap gap-2">
      <Tab href="/posters" active={!onCalendar}>
        Your posters
      </Tab>
      <Tab href="/posters/calendar" active={onCalendar}>
        Plan the month
      </Tab>
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: "/posters" | "/posters/calendar";
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:border-ring hover:bg-muted/50"
      )}
    >
      {children}
    </Link>
  );
}
