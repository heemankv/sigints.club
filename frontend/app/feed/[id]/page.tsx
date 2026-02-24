import FeedPostWrapper from "./FeedPostWrapper";

export default async function FeedPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FeedPostWrapper contentId={id} />;
}
