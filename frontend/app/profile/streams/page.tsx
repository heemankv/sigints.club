"use client";

import { Suspense } from "react";
import ProfileContent from "../ProfileContent";

export default function StreamsPage() {
  return (
    <Suspense fallback={<div className="social-shell"><div className="social-main"><p className="subtext">Loading profile…</p></div></div>}>
      <ProfileContent initialTab="streams" />
    </Suspense>
  );
}
