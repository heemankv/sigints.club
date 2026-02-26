import { Suspense } from "react";
import RegisterAgentClient from "./RegisterAgentClient";

export default function RegisterAgentPage() {
  return (
    <Suspense fallback={<div className="maker-dash"><p className="subtext">Loading…</p></div>}>
      <RegisterAgentClient />
    </Suspense>
  );
}
