export type KnowledgeStatus = "processing" | "ready" | "failed";
export type KnowledgeSourceType = "pdf" | "docx" | "txt" | "text";

export type KnowledgeItem = {
  id: string;
  title: string;
  source_type: KnowledgeSourceType;
  status: KnowledgeStatus;
  error_message: string | null;
  created_at: string;
};

export type KnowledgeSection = {
  title: string;
  content: string;
};

export type KnowledgeStructureResult = {
  sections: KnowledgeSection[];
  truncated: boolean;
};
