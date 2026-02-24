"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LeftNav from "../../components/LeftNav";
import PostPageClient from "../../post/[id]/PostPageClient";
import type { StreamDetail } from "../../lib/types";

export default function FeedPostWrapper({ contentId }: { contentId: string }) {
  const [streams, setStreams] = useState<StreamDetail[]>([]);

  useEffect(() => {
    async function loadStreams() {
      try {
        const { fetchStreams, readStreamsCache } = await import("../../lib/api/streams");
        const cached = readStreamsCache();
        if (cached?.streams?.length) setStreams(cached.streams);
        const data = await fetchStreams({ includeTiers: true });
        setStreams(data.streams ?? []);
      } catch {
        setStreams([]);
      }
    }
    loadStreams();
  }, []);

  return (
    <section className="social-shell">
      <LeftNav />

      <div className="social-main">
        <PostPageClient contentId={contentId} />
      </div>

      <aside className="social-rail">
        <div className="x-rail-module">
          <h3 className="x-rail-heading">Top makers</h3>
          {streams.slice(0, 4).map((stream) => (
            <div className="x-trend-item" key={stream.id}>
              <span className="x-trend-category">{stream.domain} · Maker</span>
              <strong className="x-trend-topic">{stream.name}</strong>
              <span className="x-trend-meta">{stream.evidence} evidence</span>
            </div>
          ))}
          {!streams.length && <span className="x-trend-category">No stream data yet.</span>}
          <Link className="x-rail-link" href="/">Open discovery →</Link>
        </div>
      </aside>
    </section>
  );
}
