# Tapestry Usage

## Summary

We use Tapestry as the social layer for sigints.club. It powers the public-facing social graph, the feed experience, and the content context that sits on top of signal streams.

## How Tapestry Is Used

- Feed page: Tapestry powers the discovery feed so users can browse signals, intents, and slashing posts in one timeline.
- Streams: stream-linked social content is stored, indexed, and surfaced through Tapestry to give streams context and history.
- Profiles: user profile data (display name, bio, identity) is backed by Tapestry profiles.
- Social graph: follows, likes, and comments are modeled through Tapestry so we can build network effects around signal quality.

## Why It Matters

Tapestry makes it easy to ship the social dimension of signals without maintaining a custom social backend. The integration was straightforward, and it gives us a fast path to a usable social graph with minimal operational complexity.
