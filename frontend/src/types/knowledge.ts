export type KnowledgeStatus = "processing" | "ready" | "failed";
export type KnowledgeSourceType =
  | "pdf"
  | "docx"
  | "txt"
  | "text"
  | /** Transcribed from a reel link. */ "reel"
  | /** Transcribed from an uploaded video file. */ "video";

export type KnowledgeItem = {
  id: string;
  title: string;
  source_type: KnowledgeSourceType;
  status: KnowledgeStatus;
  /** The link this came from, for anything read or transcribed off the web. */
  source_url: string | null;
  error_message: string | null;
  created_at: string;
};

/**
 * What happened to one pasted link. `document` is null only when the link
 * was never accepted; `already_added` means it was transcribed before, so
 * nothing was queued.
 */
export type ReelQueued = {
  url: string;
  document: KnowledgeItem | null;
  already_added: boolean;
  error: string | null;
};

/** One document, opened — everything the knowledge layer holds for it. */
export type KnowledgeDetail = KnowledgeItem & {
  /** Rebuilt from the stored chunks; this is what the agents actually read. */
  content: string;
  /** How many pieces retrieval sees this as. */
  chunk_count: number;
  summary: string | null;
};

export type KnowledgePart = {
  label: string;
  text: string;
};

export type KnowledgeSection = {
  title: string;
  /** Labelled blocks for display; `content` is these same parts serialised. */
  parts?: KnowledgePart[];
  content: string;
};

export type KnowledgeStructureResult = {
  sections: KnowledgeSection[];
  truncated: boolean;
};
