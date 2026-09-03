import { StoryboardView } from "./StoryboardView";

export default async function StoryboardPage({
  params,
}: PageProps<"/create/[projectId]/storyboard">) {
  const { projectId } = await params;
  return <StoryboardView projectId={projectId} />;
}
