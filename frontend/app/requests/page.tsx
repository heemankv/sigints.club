import FeedClient from "../feed/FeedClient";

export default async function RequestsPage() {
  return <FeedClient searchQuery="" initialFilter="explore" />;
}
