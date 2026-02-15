import FeedClient from "./FeedClient";

type FeedPageProps = {
  searchParams?: { q?: string };
};

export default function FeedPage({ searchParams }: FeedPageProps) {
  const query = typeof searchParams?.q === "string" ? searchParams.q : "";
  return <FeedClient searchQuery={query} />;
}
