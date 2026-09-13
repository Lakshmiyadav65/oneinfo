import { CalendarView } from "@/app/(app)/posters/calendar/CalendarView";

export default async function PosterCalendarPage({
  searchParams,
}: PageProps<"/posters/calendar">) {
  const params = await searchParams;
  const raw = Array.isArray(params.m) ? params.m[0] : params.m;
  // "2026-09". Anything else falls through to the current month in the view,
  // which is the only place that knows the viewer's clock.
  const month = typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw) ? raw : null;
  return <CalendarView month={month} />;
}
