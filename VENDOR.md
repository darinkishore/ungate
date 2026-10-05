# Dusk vendor branch

Upstream: orchidfiles/ungate at a5394e2be2aff6329cdd2713f2305814029aaa4b.

The dashboard API listens only on 127.0.0.1. A separate listener at API port + 1
registers only chat completions, Anthropic messages, and models. Every public
request requires the current proxy key, and no key fails closed. The extension
points its Cloudflare quick tunnel at this public listener. Settings and OAuth
routes remain local, including when a caller has the inference key.

The VSIX publisher is darinkishore, keeping the patched installation distinct
from the marketplace extension. GitHub Actions is disabled on this fork.

Build with Node 24 and pnpm 10.33.1: install from the lock, build @ungate/dev-kit,
then run package:build. The deploy/ungate.vsix artifact is the reviewed bundle;
its SHA-256 is tracked alongside it. Before refreshing it, run the public-server
integration test and TypeScript build check, then compare the source diff.
Dusk supplies Node and sqlite to Cursor through Nix. Do not inherit LD_AUDIT
when building self-contained Node tooling on Dusk.

Nix deploys the pinned vendor branch through ungate-src. The usual vendor bump
workflow publishes and relocks the source. Never put credentials or runtime
.ungate state in this repository.
