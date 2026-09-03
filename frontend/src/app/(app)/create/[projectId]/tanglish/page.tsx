import { TanglishView } from "./TanglishView";

export default async function TanglishPage({
  params,
}: PageProps<"/create/[projectId]/tanglish">) {
  const { projectId } = await params;
  return <TanglishView projectId={projectId} />;
}
