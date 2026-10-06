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

The local Models panel adds Refresh from account for Claude and ChatGPT. It
fetches authenticated provider catalogues, creates readable `Ungate: <model>`
IDs, and preserves saved reasoning/service tier choices and unrelated custom
mappings. Hidden/non-API Codex models are omitted. Failed or truncated catalogues
leave the registry intact. The refresh route stays on the local administration
server. Cursor's built-in model IDs still bypass its OpenAI URL override;
these distinct IDs are required to use subscriptions through Ungate.

Claude request and catalogue metadata use the same pinned client version in
`config.claudeCode.userAgent`. Version 2.1.289 matches the installed Claude Code
and upstream release checked on 2026-10-05. Opus 5.5 rejected the previous 2.1.9
metadata with an explicit minimum-version error (2.1.280). Refresh this pin
against an actual upstream release when provider compatibility requires it.

Claude's OpenAI stream adapter emits empty deltas every 15 seconds of downstream
silence, including adaptive thinking. Keepalives contain no reasoning/answer text,
usage, tools, or finish reason. This prevents the quick tunnel's 125-second read
timeout. Timers stop at completion, cancellation, or errors. Cancelled streams
are recorded as errors rather than disappearing from request analytics.
SSE responses also set Cache-Control: no-cache, no-transform so Cloudflare does
not compress/buffer the small keepalive chunks before forwarding them.
