"use client";

import PostPageClient from "../../post/[id]/PostPageClient";

export default function FeedPostWrapper({ contentId }: { contentId: string }) {
  return <PostPageClient contentId={contentId} />;
}
