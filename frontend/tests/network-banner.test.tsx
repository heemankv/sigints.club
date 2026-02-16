import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

describe("NetworkBanner", () => {
  it("renders localnet warning", async () => {
    vi.resetModules();
    vi.doMock("@solana/wallet-adapter-react", () => {
      return {
        useConnection: () => ({
          connection: {
            rpcEndpoint: "http://127.0.0.1:8899",
            getGenesisHash: vi.fn().mockResolvedValue("GENESIS123"),
          },
        }),
      };
    });
    const { default: NetworkBanner } = await import("../app/components/NetworkBanner");
    render(<NetworkBanner />);
    expect(await screen.findByText(/Localnet mode detected/i)).toBeInTheDocument();
  });

  it("renders non-local banner", async () => {
    vi.resetModules();
    vi.doMock("@solana/wallet-adapter-react", () => {
      return {
        useConnection: () => ({
          connection: {
            rpcEndpoint: "https://api.devnet.solana.com",
            getGenesisHash: vi.fn().mockResolvedValue("GENESIS123"),
          },
        }),
      };
    });
    const { default: NetworkBannerRemote } = await import("../app/components/NetworkBanner");
    render(<NetworkBannerRemote />);
    expect(await screen.findByText(/RPC:/i)).toBeInTheDocument();
  });
});
