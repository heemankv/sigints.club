import FeedClient from "../feed/FeedClient";

type SlashingsPageProps = {
  searchParams?: { q?: string };
};

export default function SlashingsPage({ searchParams }: SlashingsPageProps) {
  const query = typeof searchParams?.q === "string" ? searchParams.q : "";
  return <FeedClient searchQuery={query} />;
}
