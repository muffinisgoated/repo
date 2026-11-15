# Stage7 starting point — planning only

Stage6 does not connect AI or implement screenshots. Existing boundaries:
- `public/features/assistant-ui.mjs`: Auto/Fast/Smart selector, saved/private chats, streaming/Stop/readable code. Its status truthfully says no approved backend is connected.
- `public/features/assistant-client.mjs`: bounded requests/stream parsing and cancellation.
- `features-backend/assistant-api.mjs`: tested adapter interface with authentication, cloud consent, strict message schema, quota reservation/finalization and provider errors. Fixture responses are not live intelligence evidence.
- `proxy-public/bridge.js`: isolated page/runtime navigation. No authorized readable-text extraction channel is currently exposed.
- Separate native Admin0.5.2 consumes aggregate monitoring through enrolled-device proof; no provider telemetry exists. AI Not Connected remains correct.

## Next implementation sequence

1. Complete Stage6browser acceptance before building on it. Then select a legitimate free text-provider configuration using actual account quotas and bounded real questions across math, writing, science, coding, reasoning and follow-ups. No hardcoded sample answers or capability claims based on model names. No provider keys in public source, browser storage, packaged clients or logs.
2. Build a developer-managed authenticated HTTPS service with durable fair per-session/shared quotas, request/token/time/concurrency budgets, cancellation, bounded correction and no paid fallback. Measure effective replies/costs with5/10/20testers before promising daily limits. No mandatory user API keys or local model downloads. No public deployment without authorization.
3. Add independent public search only through an approved backend. Treat source text as untrusted data; verify important claims/dates/citations and preserve scoped evidence for follow-ups. Keep private page/doc/chat content out of public search queries and global caches. Admit missing/conflicting evidence. Avoid duplicate searches and model calls.
4. Define an explicit page-sharing permission and trusted bridge operation. Bind replies to the selected tab/frame/document generation; validate Origin, sourceWindow, tabID, request nonce, deadline and content size. Return title, public URL, headings and relevant nearby paragraphs; exclude passwords, form values, editable/private content and background tabs. Private mode denies extraction. Detect page navigation and invalidate stale evidence. Do not scrape private screens or bypass cross-origin/publisher protections.
5. Keep ordinary questions independent from page context. Match follow-up intent to the right conversation/tab/evidence and label actual page evidence versus model knowledge. Run real multi-tab tests before claiming webpage awareness.
6. Only consider optional visual understanding after verified vision capacity and a legitimate explicit browser screen-picker permission flow exist. Never auto-capture before consent, secretly monitor, send images to text-only models, or imply extracted text means the model can see a screen. Respect OS/browser permission limitations and transient user activation. Keep visual features disabled until tested.
7. Extend Admin with genuine provider request/error/token/quota aggregates only, with source/timestamp/availability. No raw prompts, browsing URLs, private images or fabricated capacity figures. Preserve current owner authentication and public/private metric separation.

## Required acceptance

Real diverse answers; actual supported research citations; authorized active-tab extraction; ordinary-question privacy; multi-turn continuity; manual Smart behavior; provider exhaustion/recovery; private chat persistence; Stop; quotas under isolated simulated users; genuine capacity observations separated from mocks. Secret scans, privacy/network audits and complete regression checks. No intelligence, vision, production readiness or free-capacity promises based solely on automated tests.
