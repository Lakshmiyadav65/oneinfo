export type KnowledgeStatus = "processing" | "ready" | "failed";
export type KnowledgeType = "pdf" | "docx" | "txt" | "text";

export type KnowledgeItem = {
  id: string;
  title: string;
  type: KnowledgeType;
  status: KnowledgeStatus;
  createdAt: string;
};
