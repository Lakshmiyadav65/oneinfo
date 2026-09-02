import { Spinner } from "@/components/ui/Spinner";

// The `middleware` route matcher intercepts "/" and redirects to
// "/dashboard" or "/login" before this ever renders. This exists only as a
// safe fallback.
export default function RootPage() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}
