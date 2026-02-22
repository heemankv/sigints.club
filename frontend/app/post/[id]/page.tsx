import { Suspense } from "react";
import PostPageClient from "./PostPageClient";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="post-page-shell"><div className="post-page-empty">Loading…</div></div>}>
      <PostPageClient contentId={id} />
    </Suspense>
  );
}
