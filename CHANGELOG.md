# Changelog

All notable changes to DomainPeek are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-10-08

### Fixed
- Dashboard analyze now requests `ssl`, `geo`, and `dkim` in the `/api/analyze` `include` list so live TLS probes, ASN/geo enrichment, and DKIM discovery run on normal UI analysis (previously omitted, which left the TLS Certificate panel empty).
- Surface TLS-related `meta.warnings` on the empty SSL panel when a probe fails or returns no certificate.
- Include TLS (`ssl`) and CT data in export / share export payloads and category counts.

### Changed
- App settings deep-merge `defaultAnalysisOptions` so stored preferences keep new include flags (`includeSsl`, `includeGeo`, `includeDkim`).

## [1.3.0] - 2026-10-08

### Added
- Full redacted analysis payload on Redis snapshots for share / dashboard cached replay.
- Home expandable “recently analyzed domains” preview with see-more to `/recent`.
- Shared UTC/Local timezone formatting for Cached / Last updated stamps via app state.

### Fixed
- Harden RDAP thick-registrar follow (e.g. namerdap.systems): merge vCard entities and IANA IDs; Redis cache faults do not fail the follow.

## [1.2.0] - 2026-10-07

### Added
- Cached analyze hits (`meta.cached` / `meta.cachedAt`) with UI Cached badge and `?noCache=1` refresh (stampede-locked).
- Private analyze (`?private=1` / UI) — omit from public recent feed; still snapshottable and shareable.
- Public recent feed (`/recent`, `GET /api/recent`) for announced analyses with shareable snapshot links.
- Internal ops listing via `npm run list:analyzed` (private + cache status).

### Changed
- Entity / NS / registrar / cert / SAN / ASN deep links open in a new browser tab so the current analysis stays in view.

## [1.1.0] - 2026-10-06

### Added
- Entity deep links and `/entity/{type}/{id}` pages with relation reverse-lookup APIs (`/api/relations/*`).
- Live TLS certificate / SAN probe, Cloudflare Origin CA heuristics, optional CT (crt.sh), and SSL security scoring.
- ASN / IP intelligence (ip-api.com + bgp.he.net) with Redis-cached, throttled egress.
- Memgraph (Docker `graph` / `default` profiles) plus Redis relation index for entity graphs.
- Extended analysis snapshots / share payload (registrar, NS, cert, ASN) with PII redaction.

### Changed
- Updated deploy docs and Compose profiles for Redis + Memgraph.

## [1.0.3] - 2026-10-05

### Added
- Redis / nginx / default Compose profiles with recommended `./deploy.sh -p default -k -u`.
- Redis-backed rate limiting, analysis snapshots, and temporary share links.
- Smart deploy build cache (auto no-cache on Dockerfile/lockfile/compose changes).

### Changed
- Deployment and README docs for Redis-backed features; Live demo removed from Next.js header (kept in docs).

## [1.0.2] - 2026-10-04

### Fixed
- Raise default RDAP timeout budget; skip same-server timeout retries.
- Avoid caching transient RDAP soft-fails so registry latency does not pin empty RDAP results.

## [1.0.0] — Earlier foundation

Notable work leading into the first numbered releases (rebrand, Docker/nginx, and Phase 2 core):

### Added
- Rebrand from Domain Intelligence Analyzer to DomainPeek.
- Full IANA TLD WHOIS/RDAP coverage with wired APIs and tests.
- Dashboard consolidated on a single `/api/analyze` fetch; RDAP/WHOIS UI polish.
- Live DNS monitoring over Socket.IO; Phase 2 security scoring and visualizations.
- Nginx reverse proxy with Certbot + Cloudflare DNS-01, API key auth (`X-API-Key` / Bearer + nonce).
- App-level `.env` templates aligned with `deploy.sh` / domainpeek.xyz defaults.
- Docker Compose networking, Node 22 LTS images, and deployment troubleshooting docs.

### Fixed
- Frontend–backend connectivity and Docker health checks.
- Alpine Certbot Cloudflare package naming; CORS origin auto-merge for deploy.
- Critical/high npm audit findings; registration date HH:MM:SS when source includes time.

[1.3.1]: https://github.com/kyroskoh/domain-intelligence-analyzer/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/kyroskoh/domain-intelligence-analyzer/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/kyroskoh/domain-intelligence-analyzer/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/kyroskoh/domain-intelligence-analyzer/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/kyroskoh/domain-intelligence-analyzer/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/kyroskoh/domain-intelligence-analyzer/releases/tag/v1.0.2
