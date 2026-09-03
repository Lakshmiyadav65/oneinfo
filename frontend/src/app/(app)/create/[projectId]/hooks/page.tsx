import { HooksView } from "./HooksView";

export default async function HooksPage({
  params,
}: PageProps<"/create/[projectId]/hooks">) {
  const { projectId } = await params;
  return <HooksView projectId={projectId} />;
}
