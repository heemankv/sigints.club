# OrbitFlare Usage

## Summary

We use OrbitFlare to power real-time signal listening and trade execution support within sigints.club.

## How OrbitFlare Is Used

- Jetstream RPC: OrbitFlare provides the Jetstream endpoint that we use for low-latency signal listening.
- Jupiter swap: OrbitFlare provides a dedicated node for Jupiter swaps, which we use to implement trade signals and action flows.

## Why It Matters

OrbitFlare gives us a stable, low-latency transport for streaming signals and a reliable pathway for trade execution. It keeps the real-time loop fast and consistent, which is essential for signals that arrive and decay quickly.

