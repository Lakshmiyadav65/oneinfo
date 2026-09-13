import { PosterView } from "@/app/(app)/posters/[postId]/PosterView";

export default async function PosterPage({ params }: PageProps<"/posters/[postId]">) {
  const { postId } = await params;
  return <PosterView postId={postId} />;
}
