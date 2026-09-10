import type { SceneEnvironment } from "@/types/environment";

/**
 * A filming setup the creator named and kept, reusable on any project.
 *
 * Mirrors backend/app/models/environment_setup.py. Not a KnowledgeItem: a
 * setup is applied exactly as saved rather than retrieved by similarity, so
 * it is stored as the same structured values a scene carries. It lives under
 * My Knowledge because that is where a creator's cross-project material
 * belongs, not because it is a document.
 */
export type EnvironmentSetupRecord = {
  id: string;
  name: string;
  description: string | null;
  environment: SceneEnvironment;
  /** The setup new projects start from. At most one per creator. */
  is_default: boolean;
  created_at: string;
  updated_at: string;
};
