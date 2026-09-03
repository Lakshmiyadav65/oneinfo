import type { ContentStatus } from "@/types/script";

export type Tanglish = {
  id: string;
  version: number;
  content: string;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
};
