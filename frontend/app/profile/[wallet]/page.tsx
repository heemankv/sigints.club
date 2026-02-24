"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import LeftNav from "../../components/LeftNav";
import StreamCard from "../../components/StreamCard";
import { fetchStreams } from "../../lib/api/streams";
import { fetchFollowCounts } from "../../lib/api/social";
import { fetchUserProfile } from "../../lib/sdkBackend";
import type { StreamDetail } from "../../lib/types";
import { shortWallet } from "../../lib/utils";

type UserProfile = {
  wallet: string;
  displayName?: string;
  bio?: string;
};

export default function PublicProfilePage() {
  const params = useParams();
  const wallet = useMemo(() => {
    const raw = (params as { wallet?: string }).wallet;
    if (!raw) return "";
    return decodeURIComponent(raw);
  }, [params]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [streams, setStreams] = useState<StreamDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [followCounts, setFollowCounts] = useState<{ followers: number; following: number } | null>(null);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    void load();
    async function load() {
      setLoading(true);
      setStatus(null);
      try {
        const u = await fetchUserProfile<{ user: UserProfile }>(wallet);
        setProfile(u.user);
      } catch {
        setProfile({ wallet });
      }
      try {
        setFollowLoading(true);
        const counts = await fetchFollowCounts(wallet);
        setFollowCounts(counts.counts);
      } catch {
        setFollowCounts(null);
      } finally {
        setFollowLoading(false);
      }
      try {
        const data = await fetchStreams({ includeTiers: true });
        const mine = (data.streams ?? []).filter((stream) => stream.authority === wallet);
        setStreams(mine);
      } catch (err: any) {
        setStreams([]);
        setStatus(err?.message ?? "Failed to load streams");
      } finally {
        setLoading(false);
      }
    }
  }, [wallet]);

  const walletShort = wallet ? shortWallet(wallet) : "";

  return (
    <section className="social-shell">
      <LeftNav />

      <div className="social-main">
        <div className="profile-header">
          <div className="profile-header-avatar">
            {(wallet[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <div className="profile-header-name">
              {profile?.displayName ?? walletShort}
            </div>
            {profile?.bio && (
              <div className="x-trend-category" style={{ marginTop: 2 }}>
                {profile.bio}
              </div>
            )}
            {(followLoading || followCounts) && (
              <div className="profile-header-stats">
                <span><strong>{followCounts?.following ?? "…"}</strong> Following</span>
                <span><strong>{followCounts?.followers ?? "…"}</strong> Followers</span>
              </div>
            )}
            <div className="profile-header-wallet">{wallet}</div>
          </div>
        </div>

        <div className="profile-tab-content">
          <div className="data-grid data-grid--single" style={{ marginTop: 8 }}>
            {streams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
            {loading && !streams.length && (
              <div className="x-empty-state">
                <p>Loading streams…</p>
              </div>
            )}
            {!loading && status && (
              <div className="x-empty-state">
                <p>{status}</p>
              </div>
            )}
            {!loading && !status && streams.length === 0 && (
              <div className="x-empty-state">
                <p>No streams published yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <aside className="social-rail">
        <div className="x-rail-module">
          <h3 className="x-rail-heading">Explore</h3>
          <Link className="x-rail-link" href="/streams">
            Browse all streams →
          </Link>
        </div>
      </aside>
    </section>
  );
}
