"use client";

import LeftNav from "../../components/LeftNav";
import StreamsRail from "../../components/StreamsRail";
import PostPageClient from "../../post/[id]/PostPageClient";

export default function FeedPostWrapper({ contentId }: { contentId: string }) {
  return (
    <section className="social-shell">
      <LeftNav />

      <div className="social-main">
        <PostPageClient contentId={contentId} />
      </div>

      <StreamsRail />
    </section>
  );
}
