import { GenerateView } from "./GenerateView";

export default async function GeneratePage({
  params,
}: PageProps<"/create/[projectId]/generate">) {
  const { projectId } = await params;
  return <GenerateView projectId={projectId} />;
}
