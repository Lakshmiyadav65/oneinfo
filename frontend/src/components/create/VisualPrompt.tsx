/**
 * The composed prompt, shown as the labelled blocks it actually is.
 *
 * The backend builds this as header lines plus SCENE / DIALOGUE / ACTION /
 * CAMERA / LIGHTING / ENVIRONMENT / NEGATIVE PROMPT. Rendered into a plain
 * paragraph those labels ran together into a wall of text nobody could scan,
 * which defeats the point of a creator being able to check what the model
 * was told before paying it.
 *
 * Parsing rather than storing structure on purpose: the prompt has to reach
 * the provider as one string, and a creator can edit it by hand into
 * anything at all. When it does not match the expected shape this falls back
 * to showing the text as written, line breaks and all.
 */

type PromptSection = { label: string; body: string };

function parsePrompt(prompt: string): { headers: PromptSection[]; sections: PromptSection[] } | null {
  const blocks = prompt.split("\n\n");
  if (blocks.length < 2) return null;

  const headers = blocks[0]
    .split("\n")
    .map((line) => {
      const at = line.indexOf(":");
      return at === -1 ? null : { label: line.slice(0, at).trim(), body: line.slice(at + 1).trim() };
    })
    .filter((entry): entry is PromptSection => entry !== null);

  const sections = blocks.slice(1).map((block) => {
    const at = block.indexOf(":\n");
    return at === -1
      ? { label: "", body: block.trim() }
      : { label: block.slice(0, at).trim(), body: block.slice(at + 2).trim() };
  });

  if (headers.length === 0 || sections.every((s) => !s.label)) return null;
  return { headers, sections };
}

export function VisualPrompt({ prompt }: { prompt: string }) {
  const parsed = parsePrompt(prompt);

  if (!parsed) {
    // whitespace-pre-wrap so a hand-written prompt keeps the shape its
    // author gave it.
    return (
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{prompt}</p>
    );
  }

  return (
    <div className="space-y-2 text-xs leading-relaxed">
      <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
        {parsed.headers.map((header) => (
          <div key={header.label} className="contents">
            <dt className="font-medium text-foreground">{header.label}</dt>
            <dd className="text-muted-foreground">{header.body}</dd>
          </div>
        ))}
      </dl>

      {parsed.sections.map((section) => (
        <div key={section.label || section.body.slice(0, 24)} className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.label}
          </p>
          {/*
            Dialogue is set apart because it is the one block that is spoken
            rather than depicted, and the one a creator is most likely to
            want to check word for word.
          */}
          <p
            className={
              section.label === "DIALOGUE"
                ? "rounded-md border-l-2 border-primary bg-muted/40 px-2 py-1 text-foreground"
                : "text-muted-foreground"
            }
          >
            {section.body}
          </p>
        </div>
      ))}
    </div>
  );
}
