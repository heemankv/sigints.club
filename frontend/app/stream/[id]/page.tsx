import StreamPageClient from "./StreamPageClient";
import { fetchStream } from "../../lib/api/streams";
import { getFallbackStream } from "../../lib/fallback";
import type { StreamDetail } from "../../lib/types";
import type { StreamDetail as FallbackStreamDetail } from "../../lib/fallback";

export default async function StreamPage({ params }: { params: { id: string } }) {
  let stream: StreamDetail | FallbackStreamDetail | null = null;
  try {
    const data = await fetchStream(params.id);
    stream = data.stream;
  } catch {
    stream = getFallbackStream(params.id);
  }

  if (!stream) {
    return (
      <>
        <h1 className="section-title">Stream not found</h1>
        <p className="subtext">Try another stream from the discovery page.</p>
      </>
    );
  }

  return <StreamPageClient stream={stream} />;
}
