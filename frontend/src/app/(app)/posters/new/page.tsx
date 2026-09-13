import { NewPosterView } from "@/app/(app)/posters/new/NewPosterView";

/**
 * The query string is read here rather than with useSearchParams in the view.
 * In this version of Next, reading search params in a client component forces
 * a Suspense boundary or opts the page out of static rendering; awaiting them
 * in the server shell and passing plain strings down keeps the view simple and
 * matches how the create flow already awaits its params.
 */
export default async function NewPosterPage({
  searchParams,
}: PageProps<"/posters/new">) {
  const params = await searchParams;
  const one = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? null;

  return (
    <NewPosterView
      occasionId={one(params.occasion)}
      subject={one(params.subject)}
      date={one(params.date)}
      kind={one(params.kind)}
    />
  );
}
