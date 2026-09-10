import { api, ApiNotConfiguredError } from "@/lib/api/client";
import type { SceneEnvironment } from "@/types/environment";
import type { EnvironmentSetupRecord } from "@/types/environment-setup";

const BASE = "/knowledge/environment-setups";

export async function listEnvironmentSetups(): Promise<EnvironmentSetupRecord[]> {
  try {
    return await api.get<EnvironmentSetupRecord[]>(BASE);
  } catch (err) {
    // Same as listKnowledge: a missing backend leaves the page empty rather
    // than replacing it with an error nobody can act on.
    if (err instanceof ApiNotConfiguredError) return [];
    throw err;
  }
}

export function saveEnvironmentSetup(
  name: string,
  environment: SceneEnvironment,
  options: { description?: string; isDefault?: boolean } = {}
): Promise<EnvironmentSetupRecord> {
  return api.post<EnvironmentSetupRecord>(BASE, {
    name,
    description: options.description || undefined,
    environment,
    is_default: options.isDefault ?? false,
  });
}

/** Every field optional: renaming must not require resending the setup. */
export function updateEnvironmentSetup(
  id: string,
  changes: { name?: string; description?: string; environment?: SceneEnvironment; isDefault?: boolean }
): Promise<EnvironmentSetupRecord> {
  return api.patch<EnvironmentSetupRecord>(`${BASE}/${id}`, {
    name: changes.name,
    description: changes.description,
    environment: changes.environment,
    is_default: changes.isDefault,
  });
}

export function deleteEnvironmentSetup(id: string): Promise<void> {
  return api.delete<void>(`${BASE}/${id}`);
}
