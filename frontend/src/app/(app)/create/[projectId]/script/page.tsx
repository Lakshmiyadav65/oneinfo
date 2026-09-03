import { ScriptView } from "./ScriptView";

export default async function ScriptPage({
  params,
}: PageProps<"/create/[projectId]/script">) {
  const { projectId } = await params;
  return <ScriptView projectId={projectId} />;
}
