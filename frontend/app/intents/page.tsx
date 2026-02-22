import FeedClient from "../feed/FeedClient";

type IntentsPageProps = {
  searchParams?: { q?: string };
};

export default function IntentsPage({ searchParams }: IntentsPageProps) {
  const query = typeof searchParams?.q === "string" ? searchParams.q : "";
  return <FeedClient searchQuery={query} initialTab="intents" />;
}
