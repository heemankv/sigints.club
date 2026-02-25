"use client";

import { Suspense } from "react";
import ProfileContent from "../ProfileContent";

export default function AgentsPage() {
  return (
    <Suspense fallback={<p className="subtext">Loading profile…</p>}>
      <ProfileContent initialTab="agents" />
    </Suspense>
  );
}
