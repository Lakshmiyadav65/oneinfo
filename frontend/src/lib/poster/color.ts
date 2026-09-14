/**
 * The two colour operations the renderer needs, and nothing else.
 *
 * Kept to hex in and hex or rgba out, because every colour in a palette is
 * written as six-digit hex and a colour library would be a dependency for the
 * sake of two functions.
 */

function channels(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").slice(0, 6);
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** `t` of the way from `a` to `b`. Used to darken a gold into its own shadow. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(lerp(ar, br))}${hex(lerp(ag, bg))}${hex(lerp(ab, bb))}`;
}
