"use client";

import { Suspense } from "react";
import ProfileContent from "../ProfileContent";

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<p className="subtext">Loading profile…</p>}>
      <ProfileContent initialTab="subscriptions" />
    </Suspense>
  );
}
