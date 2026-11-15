# Current local Conversations implementation — Stage 8.8

The running preview mounts `createAIRuntime` from `runtime.mjs`, with protected server-side Gemini configuration, anonymous sessions, durable quotas, streaming and cancellation. `assistant-api.mjs` below is an older optional adapter, not the active production route. Preserve its historical documentation as background only.

Current page awareness is question-triggered text extraction through the existing proxy bridge. The saved pageAI consent remains off by default; automatic editable reading has its own separate consent. The active tab, public URL, document identity/revision, permissions and context version are checked. A bounded local index selects relevant headings, numbered questions, tables and choices; cloud excerpt limits are unchanged. Current-tab context is revalidated after session setup and before generation. Private/forms/passwords/payment fields, hidden content and background tabs remain excluded. This provides no desktop or pixel-level vision. Dynamic content is read again on subsequent questions, not continuously uploaded. Visible accessible frames on the same original public origin are supported one level deep; cross-origin frames and canvas-only editors remain unsupported. The rewritten proxy origin never grants access to a different original site.

The actual controller + controlled document fixture + real HTTP backend produced genuine Fast/Smart answers in Stage 8.8. This does not establish rendered Scramjet/website acceptance: the binding saved browser denial remains respected. Read `reports/stage88/REPORT.md`, `live-ai.json` and `live-ai-choices-retest.json` for exact evidence and limitations. Page evidence now receives the same SHA-256 provider-completion receipt as approved document evidence; no raw prompts are added to operational logs. API keys stay on the server. Live Exa is disabled; no billing, quota or credential changes were made.

---

## Historical optional adapter notes

# Optional Web Edition assistant integration boundary

This adapter is implemented and tested, but **not mounted or deployed**. It reads no environment credentials and does not connect to the separate Conversations prototype. The current local static server returns 404 for GET /api/assistant/capabilities. The UI therefore reports unavailable, preserves the question and sends no chat POST.

The networking/backend owner can integrate `createAssistantAPI` behind these same-origin routes after authorization:

- GET /api/assistant/capabilities: protocol 1, availability and supported modes. No provider keys or private data.
- POST /api/assistant/chat: JSON protocol/mode/messages; bounded HTTP/SSE response.

The hosting owner must supply all three dependencies; otherwise chat is disabled:

1. An explicitly approved free-only provider (`freeOnly:true`, async `stream({mode,messages,signal})`). Actual account quotas and free-only account/billing configuration must be verified before setting that flag. Auto routing and manual Smart behavior belong to that provider implementation. There is no provider or API key configured in this checkpoint.
2. A server-side `authenticate(req)` callback using appropriate server-issued anonymous sessions/enrollment, not a client installation ID alone. No end-user developer API keys should be required. It must reject unapproved origins/devices and use HTTPS/secure sessions for deployment.
3. A durable quota service with `reserve(identity,request)` returning `finalize({success,providerStarted,outputCharacters})`. It must enforce personal, shared, token/request/concurrency and financial-equivalent limits using actual usage where available. Provider-started failures still consume shared capacity conservatively; unsuccessful app responses should not consume personal success allowance. Quota-storage failure disables subsequent calls until the service is repaired/restarted.

The included adapter enforces origin checks, role/mode/message/size restrictions, response-length bounds, a 23-second inference deadline and disconnect cancellation. It never logs prompts, page content or credentials. It is not a complete hosted service: anonymous enrollment, durable quota storage, provider-specific token accounting, provider access and remote deployment remain required. Do not expose it publicly with permissive dummy authentication or fixture quotas.

Search capability is deliberately false. No live public-search adapter or grounded citations are implemented. Do not set a Searching indicator or add generated citation URLs as proof of research. A future integration needs actual permitted search, server-owned evidence and supporting source links. Cloud processing consent is off by default in the UI.

Active-page context is also unavailable. The existing isolated page bridge accepts navigation actions but has no authorized extraction channel. The transport owner must design/approve a source/origin/request-ID-validated, opt-in extraction protocol excluding inputs/forms/passwords/private tabs. Do not weaken same-origin protection or send private page content to public search. No page text is currently read or sent by this implementation.

Free-service investigation (public documentation checked November 5, 2026): Cloudflare Workers AI has a shared 10,000-neuron daily free allocation, while some models require paid billing. Groq documents model-specific request/token limits and directs customers to their actual organization limits. These are feasible backend candidates, not verified capacity for a newly authorized Web Edition deployment. No billing, accounts, keys, public services or allowances were changed.

Sources: [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [Groq rate limits](https://console.groq.com/docs/rate-limits).

The HTTP/SSE tests use clearly labeled technical fixtures only. They demonstrate transport, cancellation, error separation, request limits and fail-closed behavior; they do not demonstrate real model intelligence, research accuracy, live provider availability or production readiness.
