"use client";

import { useEffect, useState, type ComponentType } from "react";

type AgentationProps = { endpoint?: string };

/**
 * Visual-feedback toolbar, development only.
 *
 * Click an element in the running app and the annotation carries the CSS
 * selector, element path and computed styles with it — so feedback arrives
 * as "this element, this problem" instead of a description an agent has to
 * guess its way back to.
 *
 * Two modes, chosen by whether the MCP server is running:
 *   - No endpoint (default): annotations are copied as markdown to paste
 *     into the agent yourself.
 *   - With NEXT_PUBLIC_AGENTATION_ENDPOINT set (normally
 *     http://localhost:4747, started by `npx agentation-mcp server`):
 *     annotations sync to the agent directly, no copy-paste.
 *
 * The import is deliberately dynamic and inside a NODE_ENV branch. Guarding
 * the *render* is not enough: a client component referenced from a server
 * component is collected into the client manifest at build time, so a
 * top-level `import { Agentation } from "agentation"` ships the whole
 * ~410KB toolbar to production even when it never renders (measured, not
 * assumed). Keeping the import inside a branch that is statically false in
 * a production build is what actually drops it.
 */
export function DevAnnotations() {
  const [Toolbar, setToolbar] = useState<ComponentType<AgentationProps> | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let cancelled = false;
    void import("agentation").then((mod) => {
      // setState takes an updater, and a component *is* a function — wrap it
      // so React stores the component instead of calling it as an updater.
      if (!cancelled) setToolbar(() => mod.Agentation);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Toolbar) return null;
  return <Toolbar endpoint={process.env.NEXT_PUBLIC_AGENTATION_ENDPOINT} />;
}
