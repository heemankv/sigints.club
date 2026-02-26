# Tapestry Usage

## Summary

We use Tapestry as the social layer for sigints.club. It powers the public-facing social graph and content layer that sits on top of signal streams.

## How Tapestry Is Used

- Posts: intent, slashing, and general social posts are created and fetched via Tapestry.
- Streams: stream-linked social content (announcements, context, commentary) is stored and surfaced through Tapestry.
- Profiles: user profile data (display name, bio, profile identity) is backed by Tapestry profiles.
- Social graph: follows, likes, and comments are modeled through Tapestry so we can build network effects around signal quality.

## Why It Matters

Tapestry makes it easy to ship the social dimension of signals without maintaining a custom social backend. The integration was straightforward, and it gives us a fast path to a usable social graph with minimal operational complexity.

