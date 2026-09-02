import { ProjectDetailView } from "./ProjectDetailView";

export default async function ProjectDetailPage({
  params,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  return <ProjectDetailView projectId={projectId} />;
}
