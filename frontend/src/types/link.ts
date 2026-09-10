/** Mirrors backend/app/schemas/link.py. */

export type LinkTakeaway = {
  label: string;
  detail: string;
};

export type LinkRead = {
  url: string;
  title: string;
  topic: string | null;
  audience: string | null;
  takeaways: LinkTakeaway[];
  call_to_action: string | null;
  characters: number;
  saved_as_knowledge: boolean;
  /** Set when the page couldn't be read; the others are then empty. */
  error: string | null;
};
