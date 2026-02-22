"use client";

import Link from "next/link";
import MyStreamsSection from "../components/MyStreamsSection";
import LeftNav from "../components/LeftNav";

export default function MyStreamsPage() {
  return (
    <section className="social-shell">
      <LeftNav />

      {/* ─── Center: my streams ─── */}
      <div className="social-main">
        <div style={{ padding: "24px 0 8px" }}>
          <span className="kicker">Maker</span>
          <h1 style={{ margin: "4px 0 16px", fontSize: 22, fontWeight: 700 }}>My Streams</h1>
        </div>

        <MyStreamsSection />
      </div>

      {/* ─── Right: action rail ─── */}
      <aside className="social-rail">
        <div className="x-rail-module">
          <h3 className="x-rail-heading">Maker</h3>
          <Link className="x-trend-item" href="/register-stream" style={{ cursor: "pointer" }}>
            <strong className="x-trend-topic">Register Stream</strong>
            <span className="x-trend-category">Launch a new signal stream on-chain</span>
          </Link>
        </div>
      </aside>
    </section>
  );
}
