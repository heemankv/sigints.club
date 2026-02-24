"use client";

import { useWalletConnect } from "../hooks/useWalletConnect";
import { useUserProfile } from "../lib/userProfile";
import OnboardingModal from "./OnboardingModal";

export default function OnboardingGate() {
  const { publicKey, needsOnboarding, completeOnboarding } = useWalletConnect();
  const { refresh } = useUserProfile();

  if (!needsOnboarding || !publicKey) return null;

  return (
    <OnboardingModal
      onComplete={async (data) => {
        await completeOnboarding(data);
        await refresh();
      }}
    />
  );
}
