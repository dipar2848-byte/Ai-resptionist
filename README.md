# AI Voice Receptionist (Multi-Tenant SaaS)

A production-ready, multi-tenant **AI phone receptionist** that answers inbound
calls for multiple businesses. Built for real-world deployment on
**Twilio + Vercel + an OpenAI-compatible LLM** with **optional ElevenLabs TTS**.

It receives a call, transcribes speech (Twilio Speech), routes the call to the
correct business by the dialed number, runs a tenant-aware LLM conversation with
strict structured output, manages per-call session memory, books appointments,
and speaks replies back — with graceful fallbacks for every failure mode.

---

## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Folder Structure](#folder-structure)
- [How a Call Flows](#how-a-call-flows)
- [Business Config Format](#business-config-format)
- [AI Response Contract](#ai-response-contract-strict)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deploy to Vercel](#deploy-to-vercel)
- [Twilio Setup](#twilio-setup)
- [Swapping the LLM](#swapping-the-llm)
- [Enabling ElevenLabs TTS](#enabling-elevenlabs-tts)
- [Enabling Supabase Persistence](#enabling-supabase-persistence)
- [Edge Cases Handled](#edge-cases-handled)
- [Testing](#testing)
- [Security Notes](#security-notes)

---

## Features

- **Multi-tenant** — one deployment serves many businesses, routed by the dialed (`To`) number.
- **Twilio Voice webhooks** — `inbound` greeting + `<Gather>` speech loop in `turn`.
- **LLM abstraction** — any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, Together, Ollama, vLLM…), swappable via env.
- **Strict structured AI output** — JSON contract validated + repaired server-side.
- **Per-call session memory** — keyed by `CallSid` **and** `client_id` to prevent cross-tenant context leakage.
- **Booking engine** — collects name/service/date-time, validates working hours, confirms (mock DB write).
- **Optional ElevenLabs TTS** — premium voices via a streaming `<Play>` proxy; falls back to Twilio `<Say>`.
- **Storage abstraction** — in-memory by default, **Supabase-ready** drop-in adapter.
- **Robust fallbacks** — graceful, human-like behavior on silence, noise, anger, repeats, and AI/API failures.
- **Webhook security** — Twilio signature validation, raw-body parsing, no hardcoded secrets.

---

## Architecture

```
                 ┌──────────────────────────────────────────────────────┐
   Caller ──📞──▶ │  Twilio Voice  (Speech-to-Text via <Gather input>)   │
                 └───────────────┬──────────────────────────────────────┘
                                 │ HTTPS webhook (form-urlencoded, signed)
                                 ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │                    Vercel (Next.js API routes)                    │
        │                                                                   │
        │  /api/voice/inbound ──▶ parse+validate ──▶ route To→tenant        │
        │                         ──▶ create session ──▶ greet + <Gather>    │
        │                                                                   │
        │  /api/voice/turn ─────▶ parse+validate ──▶ load session           │
        │       │                 ──▶ edge-case checks                       │
        │       │                 ──▶ Conversation Engine                    │
        │       │                       ├─ promptBuilder (inject tenant)     │
        │       │                       ├─ llmClient (OpenAI-compatible)     │
        │       │                       ├─ responseParser (strict JSON)      │
        │       │                       └─ bookingService (slots+hours)      │
        │       │                 ──▶ TwiML (<Say>/<Play>, <Gather>/<Dial>)  │
        │                                                                   │
        │  /api/voice/tts  ─────▶ ElevenLabs MP3 proxy (optional)           │
        │  /api/voice/status ───▶ lifecycle + session cleanup              │
        │  /api/health, /api/admin/bookings                                 │
        └───────────────┬──────────────────────────┬──────────────────────┘
                        │                           │
                 ┌──────▼───────┐            ┌──────▼────────┐
                 │ Storage      │            │  LLM Provider │
                 │ memory|supa  │            │ (env-config)  │
                 └──────────────┘            └───────────────┘
```

**Layers (separation of concerns):**

| Layer | Files |
|---|---|
| **Webhook** | `pages/api/voice/inbound.js`, `turn.js`, `status.js`, `tts.js` |
| **Routing (multi-tenant)** | `lib/tenants/tenantStore.js`, `config/tenants.json` |
| **AI** | `lib/ai/llmClient.js`, `promptBuilder.js`, `responseParser.js`, `conversationEngine.js`, `edgeCases.js`, `fallbacks.js` |
| **Booking** | `lib/booking/bookingService.js` |
| **Session memory** | `lib/session/sessionManager.js` |
| **Storage** | `lib/storage/{index,memoryStore,supabaseStore}.js` |
| **Telephony helpers** | `lib/twilio/{request,twiml}.js` |
| **TTS** | `lib/tts/elevenlabs.js` |
| **Config / utils** | `lib/config/env.js`, `lib/utils/logger.js` |

---

## Folder Structure

```
ai-voice-receptionist/
├── package.json
├── vercel.json
├── next.config.js
├── .eslintrc.json
├── .gitignore
├── .env.example
├── README.md
├── config/
│   └── tenants.json                # JSON-based multi-tenant client profiles
├── db/
│   └── schema.sql                  # Optional Supabase tables
├── lib/
│   ├── config/
│   │   └── env.js                  # Validated env access + warnings
│   ├── utils/
│   │   └── logger.js               # Structured logger
│   ├── tenants/
│   │   └── tenantStore.js          # Load + route number→tenant
│   ├── session/
│   │   └── sessionManager.js       # Per-call state, leak-proof keys
│   ├── storage/
│   │   ├── index.js                # Adapter selector
│   │   ├── memoryStore.js          # In-memory (default)
│   │   └── supabaseStore.js        # Supabase REST adapter
│   ├── ai/
│   │   ├── llmClient.js            # OpenAI-compatible client (timeout+errors)
│   │   ├── promptBuilder.js        # Inject business config + strict schema
│   │   ├── responseParser.js       # Parse/validate/repair AI JSON
│   │   ├── conversationEngine.js   # Orchestrates a turn end-to-end
│   │   ├── edgeCases.js            # Heuristics (angry/goodbye/human/noise)
│   │   └── fallbacks.js            # Human-like default responses
│   ├── booking/
│   │   └── bookingService.js       # Slot merge, hours validation, confirm
│   ├── twilio/
│   │   ├── request.js              # Raw parse + signature validation
│   │   └── twiml.js                # TwiML builders (<Say>/<Play>/<Gather>)
│   └── tts/
│       └── elevenlabs.js           # Optional ElevenLabs synthesis
├── pages/
│   ├── index.js                    # Status page w/ webhook URLs
│   └── api/
│       ├── health.js               # GET health/readiness
│       ├── admin/
│       │   └── bookings.js         # GET bookings (token-protected)
│       └── voice/
│           ├── inbound.js          # POST: incoming call entrypoint
│           ├── turn.js             # POST: each conversation turn
│           ├── status.js           # POST: status callback + cleanup
│           └── tts.js              # GET: ElevenLabs MP3 proxy
└── test/
    ├── tenantStore.test.js
    ├── sessionManager.test.js
    ├── responseParser.test.js
    ├── bookingService.test.js
    └── edgeCases.test.js
```

---

## How a Call Flows

1. **Caller dials** a business's Twilio number.
2. Twilio POSTs to **`/api/voice/inbound`**. We validate the signature, parse the body, and map `To` → tenant via `config/tenants.json`.
3. We create a session (`sess:<client_id>:<CallSid>`), then return TwiML that **speaks the greeting** and **`<Gather input="speech">`** the caller's reply.
4. Twilio transcribes the speech and POSTs `SpeechResult` to **`/api/voice/turn`**.
5. The **conversation engine**:
   - Runs deterministic edge-case checks (silence/noise/anger/goodbye/human request).
   - Builds messages from the tenant profile + recent history and calls the **LLM**.
   - Parses the **strict JSON** reply (with a one-shot repair retry).
   - Merges booking slots, validates against working hours, and **confirms** if complete.
6. We return TwiML that speaks the reply and **gathers the next turn** — or `<Hangup/>` / `<Dial>` (human transfer).
7. On call completion, Twilio hits **`/api/voice/status`** and the session is cleaned up.

If the LLM/API fails at any point, the caller hears a **human-like fallback** instead of dead air.

---

## Business Config Format

`config/tenants.json` (JSON-based client profiles). Add a new object per business:

```json
{
  "client_id": "clinic_a",
  "phone_number": "+919000000001",
  "business_name": "Example Clinic",
  "services": ["consultation", "cleaning"],
  "working_hours": "10:00-18:00",
  "timezone": "Asia/Kolkata",
  "tone": "professional",
  "booking_rules": "only accept appointments within working hours",
  "faq": { "location": "Mumbai", "pricing": "varies" },
  "greeting": "Thank you for calling Example Clinic. How can I help you today?",
  "fallback_message": "I'm having trouble right now. Let me take your name and number for a callback.",
  "transfer_number": "+919000000099"
}
```

> Routing is by `phone_number` (the Twilio number the caller dialed). Matching is
> tolerant of formatting and country-code presence/absence.

---

## AI Response Contract (STRICT)

The LLM is required to return **only** this JSON object every turn:

```json
{
  "reply": "string response to user",
  "intent": "booking | faq | fallback",
  "needs_followup": true,
  "missing_fields": ["name", "service", "datetime"],
  "booking": { "name": null, "service": null, "datetime": null },
  "end_call": false
}
```

`responseParser.js` strips code fences, extracts the first JSON block if needed,
coerces types, validates `intent`/`missing_fields`, and **never throws** — on a
hard failure the engine returns a graceful fallback.

---

## Environment Variables

All configuration is via env (no hardcoded secrets). See **`.env.example`**.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PUBLIC_BASE_URL` | recommended | (derived from request) | Public base URL of this deployment, used for webhook action URLs. |
| `LLM_API_KEY` | yes (for AI) | — | API key for the OpenAI-compatible LLM. |
| `LLM_BASE_URL` | no | `https://api.openai.com/v1` | LLM endpoint base URL. |
| `LLM_MODEL` | no | `gpt-4o-mini` | Model name. |
| `LLM_TIMEOUT_MS` | no | `8000` | LLM request timeout (ms). |
| `TWILIO_AUTH_TOKEN` | yes (prod) | — | Used to validate Twilio webhook signatures. |
| `TWILIO_VALIDATE_SIGNATURE` | no | `true` | Set `false` only for local testing. |
| `TWILIO_SPEECH_LANGUAGE` | no | `en-US` | Speech recognition + `<Say>` language. |
| `TWILIO_TTS_VOICE` | no | `Polly.Joanna` | Twilio/Polly `<Say>` voice. |
| `TTS_PROVIDER` | no | `twilio` | `twilio` or `elevenlabs`. |
| `ELEVENLABS_API_KEY` | if elevenlabs | — | ElevenLabs key. |
| `ELEVENLABS_VOICE_ID` | no | `21m00Tcm4TlvDq8ikWAM` | Voice id. |
| `ELEVENLABS_MODEL_ID` | no | `eleven_turbo_v2_5` | Model id. |
| `SUPABASE_URL` | no | — | Enables Supabase persistence when set. |
| `SUPABASE_SERVICE_ROLE_KEY` | no | — | Supabase service role key. |
| `SESSION_TTL_MS` | no | `1800000` | Session TTL (ms). |
| `MAX_HISTORY_TURNS` | no | `12` | Conversation turns kept in context. |
| `ADMIN_TOKEN` | no | — | Enables `/api/admin/bookings` when set. |

---

## Local Development

```bash
npm install
cp .env.example .env.local
# For local testing without Twilio signatures:
#   TWILIO_VALIDATE_SIGNATURE=false
#   PUBLIC_BASE_URL=http://localhost:3000
npm run dev          # http://localhost:3000
```

Simulate Twilio with `curl` (signature validation off):

```bash
# Inbound call
curl -X POST http://localhost:3000/api/voice/inbound \
  -d "CallSid=CA1&From=%2B919111111111&To=%2B919000000001"

# A conversation turn
curl -X POST http://localhost:3000/api/voice/turn \
  -d "CallSid=CA1&From=%2B919111111111&To=%2B919000000001&SpeechResult=I%20want%20to%20book%20a%20cleaning&Confidence=0.9"
```

Expose locally to Twilio with ngrok:

```bash
ngrok http 3000
# set PUBLIC_BASE_URL to the https ngrok URL and use it in Twilio
```

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. In **Vercel → New Project**, import the repo (framework auto-detects **Next.js**).
3. **Settings → Environment Variables**: add the variables from `.env.example`
   (at minimum `LLM_API_KEY`, `TWILIO_AUTH_TOKEN`, and `PUBLIC_BASE_URL` =
   `https://<your-project>.vercel.app`).
4. **Deploy**.
5. Verify: open `https://<your-project>.vercel.app/api/health` → `status: ok`.

> No architectural changes are needed — API routes deploy as serverless
> functions automatically. `vercel.json` sets a 30s max duration for voice routes.

---

## Twilio Setup

1. Buy/choose a Twilio phone number with **Voice** capability.
2. Put that exact number in a tenant's `phone_number` in `config/tenants.json` (redeploy after edits).
3. In **Twilio Console → Phone Numbers → (your number) → Voice Configuration**:
   - **A CALL COMES IN**: `Webhook`, **HTTP POST**, URL:
     `https://<your-project>.vercel.app/api/voice/inbound`
   - **Call status changes** (optional): **HTTP POST**:
     `https://<your-project>.vercel.app/api/voice/status`
4. **Call the number** and talk to your receptionist. 🎉

The home page (`/`) prints the exact URLs to paste.

---

## Swapping the LLM

Change three env vars — no code changes:

| Provider | `LLM_BASE_URL` | Example `LLM_MODEL` |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.1-70b-instruct` |
| Together | `https://api.together.xyz/v1` | `meta-llama/Llama-3-70b-chat-hf` |
| Ollama (self-host) | `http://your-host:11434/v1` | `llama3.1` |

---

## Enabling ElevenLabs TTS

```bash
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=sk-...
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

When enabled, replies are spoken via `<Play>` pointing at `/api/voice/tts`,
which streams MP3 from ElevenLabs. If synthesis fails the system degrades to
Twilio `<Say>` automatically.

---

## Enabling Supabase Persistence

1. Create a Supabase project.
2. Run **`db/schema.sql`** in the SQL editor.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The storage adapter switches automatically — sessions and bookings now persist
across cold starts / multiple serverless instances.

---

## Edge Cases Handled

| Case | Behavior |
|---|---|
| **Silence / no speech** | Re-prompt up to 3× (escalating), then polite hangup. |
| **Unclear / noise input** | Ask the caller to rephrase. |
| **Angry caller** | Empathetic acknowledgement; offer callback/transfer. |
| **Repeated identical question** | Detect (≥2 repeats) and re-approach the answer. |
| **"Speak to a human"** | `<Dial>` the tenant's `transfer_number`. |
| **Goodbye** | Friendly closing + `<Hangup/>`. |
| **AI / API failure or timeout** | Tenant `fallback_message`, conversation continues. |
| **Overlapping/cross-tenant state** | Session keys bound to `client_id` — no leakage. |
| **Unknown dialed number** | Polite message + hangup (no crash). |
| **Booking outside hours** | Reject the slot and ask for a valid time. |

---

## Testing

```bash
npm test     # Node's built-in test runner (no extra deps)
```

Covers tenant routing, session isolation/leak-prevention, strict JSON parsing,
booking slot logic + working-hours validation, and edge-case heuristics.

---

## Security Notes

- **Twilio signature validation** is on by default (`TWILIO_VALIDATE_SIGNATURE=true`); raw body is read for correct validation.
- **No secrets in code** — everything via env.
- **Admin endpoint** is disabled unless `ADMIN_TOKEN` is set, and requires a bearer token.
- Request bodies are size-capped to avoid abuse.
```
