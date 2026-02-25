import FeedClient from "../feed/FeedClient";

type StreamsPageProps = {
  searchParams?: { q?: string };
};

export default function StreamsPage({ searchParams }: StreamsPageProps) {
  const query = typeof searchParams?.q === "string" ? searchParams.q : "";
  return <FeedClient searchQuery={query} initialTab="streams" initialFilter="explore" />;
}
