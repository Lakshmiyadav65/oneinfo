export type ScriptBeat = { label: string; line: string };

// A label is a bare word or two on its own line — Hook, Curiosity, Value,
// CTA. Bounded so a stray line of prose can't be mistaken for one.
const LABEL = /^[A-Za-z][A-Za-z ]{0,23}$/;

/**
 * Reads the beat format the script agent writes: a bare label on its own
 * line, the spoken line in double quotes beneath it, blocks separated by a
 * blank line. Mirrors `render_script` in the backend's script_agent.
 *
 * Returns null for anything not in that shape — a script written before the
 * format existed, or one edited down into free prose. The editor falls back
 * to a plain textarea rather than refusing to show a script it can't parse.
 */
export function parseScriptBeats(content: string): ScriptBeat[] | null {
  const blocks = content.trim().split(/\n\s*\n/);
  if (blocks.length < 2) return null;

  const beats: ScriptBeat[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 2) return null;

    const label = lines[0].trim();
    if (!LABEL.test(label)) return null;

    // A line that wrapped across rows is still one spoken line.
    const quoted = lines.slice(1).join(" ").trim();
    if (quoted.length < 2 || !quoted.startsWith('"') || !quoted.endsWith('"')) {
      return null;
    }
    beats.push({ label, line: quoted.slice(1, -1).trim() });
  }
  return beats;
}

/**
 * The inverse, byte-for-byte what the backend writes.
 *
 * Newlines inside a line are collapsed: a spoken line is one breath, and a
 * blank line in the middle of one would split the block and make the script
 * unparseable on the next read.
 */
export function renderScriptBeats(beats: ScriptBeat[]): string {
  return beats
    .map((beat) => `${beat.label}\n"${beat.line.replace(/\s*\n\s*/g, " ").trim()}"`)
    .join("\n\n");
}
