"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong.</h1>
        <p className="text-sm text-muted-foreground">Please try again.</p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
