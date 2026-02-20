import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { cleanup } from "@testing-library/react";

describe("NetworkOnboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    cleanup();
    delete (window as any).solana;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  });

  it("shows modal and indicator on mismatch", async () => {
    vi.doMock("@solana/wallet-adapter-react", () => {
      return {
        useConnection: () => ({
          connection: { rpcEndpoint: "http://127.0.0.1:8899" },
        }),
        useWallet: () => ({ connected: true }),
      };
    });
    (window as any).solana = {
      connection: { rpcEndpoint: "https://api.devnet.solana.com" },
    };
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL = "http://127.0.0.1:8899";

    const { default: NetworkOnboarding } = await import("../app/components/NetworkOnboarding");
    render(<NetworkOnboarding />);

    expect(await screen.findByText(/Switch your wallet network/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Wrong network/i)).toBeInTheDocument();
  });

  it("hides modal when networks match", async () => {
    vi.doMock("@solana/wallet-adapter-react", () => {
      return {
        useConnection: () => ({
          connection: { rpcEndpoint: "https://api.devnet.solana.com" },
        }),
        useWallet: () => ({ connected: true }),
      };
    });
    (window as any).solana = {
      connection: { rpcEndpoint: "https://api.devnet.solana.com" },
    };
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL = "https://api.devnet.solana.com";

    const { default: NetworkOnboarding } = await import("../app/components/NetworkOnboarding");
    render(<NetworkOnboarding />);

    expect(screen.queryByText(/Switch your wallet network/i)).toBeNull();
    expect(screen.queryByLabelText(/Wrong network/i)).toBeNull();
  });

  it("does not show modal when not connected", async () => {
    vi.doMock("@solana/wallet-adapter-react", () => {
      return {
        useConnection: () => ({
          connection: { rpcEndpoint: "https://api.devnet.solana.com" },
        }),
        useWallet: () => ({ connected: false }),
      };
    });
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL = "https://api.devnet.solana.com";

    const { default: NetworkOnboarding } = await import("../app/components/NetworkOnboarding");
    render(<NetworkOnboarding />);

    expect(screen.queryByText(/Switch your wallet network/i)).toBeNull();
  });
});
