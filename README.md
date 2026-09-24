# Velo Auto Studio — AI Receptionist

Velo is the tutorial application described in the accompanying implementation guide: a customer talks to Mia in the browser, chooses a real available slot, reviews a server-created proposal, and explicitly confirms it. A Firestore transaction commits the appointment and the owner's dashboard updates through a realtime listener.

Velo is a fictional business. Names, services, prices, and seeded appointments are development data.

## What is implemented

- Responsive React customer route at `/` and owner route at `/admin`.
- Explicit `demo` and `live` modes. Production refuses to start in demo mode.
- Anonymous Firebase Authentication for customers and Google sign-in plus `admin`/`businessId` custom claims for the owner.
- Deny-by-default Firestore browser rules. Only a verified owner can read `businesses/velo/bookings`; all browser writes are denied.
- Authenticated Node API with strict Zod bodies, unknown-field rejection, trusted business context, request IDs, origin validation, and bounded JSON input.
- Gemini Live browser connection using a server-issued, constrained, one-use ephemeral token. The permanent key never enters the browser bundle.
- Actual mono 16 kHz PCM microphone conversion, streamed 24 kHz PCM playback, one playback queue, captions, interruption clearing, and complete call cleanup.
- Four model tools only: `get_business_details`, `list_availability`, `find_next_availability`, and `prepare_booking`. The model cannot confirm a booking.
- UID-bound, two-minute proposals and explicit on-screen confirmation.
- Atomic Firestore confirmation with slot conflict protection, proposal/service/config validation, idempotent retries, and canonical receipts.
- Guarded development seed/reset tools and a trusted owner-claim script.
- Automated API tests for validation, ownership, retries, idempotency conflicts, and concurrent confirmation.

## Repository map

```text
src/pages/Customer.tsx        customer flow and receipt UI
src/pages/Admin.tsx           owner auth and Firestore listener
src/lib/live.ts               Gemini Live session and tool dispatch
src/audio/audio.ts            PCM resampling and playback queue
src/lib/api.ts                authenticated same-origin API client
src/lib/firebase.ts           Firebase browser initialization and auth
server/app.ts                 HTTP routes, validation, and error contract
server/services/              Firestore booking transaction and admission limits
shared/contracts.ts           shared Zod schemas and client-facing types
scripts/                      seed, reset, and owner-claim operations
tests/                        deterministic API and concurrency checks
```

## Local demo

Demo mode is for interface development. It uses a deliberately isolated in-memory adapter, labels itself **Demo mode**, and refuses to issue fake Gemini credentials.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Development uses one Express server on port 3000, with Vite mounted in middleware mode, so the interface and `/api` routes share the same origin. Demo mode uses the code defaults and does not require an `.env` file.

## Configure live mode

1. Create a dedicated development Firebase project and enable Firestore.
2. Enable Anonymous and Google providers in Firebase Authentication.
3. Register `localhost` and the final Cloud Run domain as authorized domains.
4. Copy the Firebase web app values into the `VITE_FIREBASE_*` variables.
5. Set `APP_MODE=live`, `VITE_APP_MODE=live`, `FIREBASE_PROJECT_ID`, and `GEMINI_API_KEY`.
6. Leave `GEMINI_LIVE_MODEL` configurable and set it to a Live model available in the filming account.
7. Authenticate the server with Application Default Credentials:

   ```bash
   gcloud auth application-default login
   ```

8. Deploy Firestore rules and indexes:

   ```bash
   firebase use YOUR_DEVELOPMENT_PROJECT_ID
   firebase deploy --only firestore:rules,firestore:indexes
   ```

For local live-mode work, create `.env` from the names in `.env.example` and include only populated values; do not commit it. The required live values are:

| Variable | Purpose |
| --- | --- |
| `APP_MODE=live` | Enables the server's Firebase-backed booking store. |
| `VITE_APP_MODE=live` | Enables Firebase Authentication and live API calls in the browser build. |
| `FIREBASE_PROJECT_ID` | Selects the server-side Firestore project. |
| `VITE_FIREBASE_*` | Supplies the Firebase public web-client configuration. |
| `GEMINI_API_KEY` | Creates short-lived Gemini Live tokens on the server; never expose it as a `VITE_*` value. |
| `GEMINI_LIVE_MODEL` | Selects the Live model available to the account. |
| `ALLOWED_ORIGINS` | Comma-separated exact browser origins, such as `http://localhost:3000` and the deployed HTTPS origin. |

`PORT` defaults to 3000 locally and is provided automatically by Cloud Run. `BUSINESS_ID` and `BUSINESS_TIMEZONE` default to `velo` and `Asia/Dubai`. `DEVELOPMENT_PROJECT_ID` and `ALLOW_DEMO_SEED` are safeguards for the trusted seed/reset scripts, not runtime requirements.

The server deliberately fails if live mode is missing its Firebase project. A production process runs in live mode; ensure `VITE_APP_MODE=live` is also present at build time because Vite variables are compiled into the browser bundle.

## Seed a filming weekend

The seed requires three matching safeguards. Choose an explicit future Saturday in `Asia/Dubai`.

```bash
export FIREBASE_PROJECT_ID=your-development-project
export DEVELOPMENT_PROJECT_ID=your-development-project
export ALLOW_DEMO_SEED=true
npm run seed -- --saturday 2026-09-19
```

The fixture creates:

- Saturday 2–3 PM: Sara M., confirmed.
- Saturday 3–4 PM: available.
- Sunday 9–10 AM: Omar K., confirmed.
- Sunday 10–11 AM: available.

If the example date is no longer in the future, use the future weekend displayed in the recording. Reset removes only documents carrying the named fixture marker:

```bash
npm run reset -- --fixture 2026-09-19
```

## Grant owner access

First sign in to `/admin` with the intended Google account and copy its UID from Firebase Authentication. Then run this only from a trusted environment:

```bash
FIREBASE_PROJECT_ID=your-development-project npm run grant-owner -- --uid FIREBASE_UID
```

The script preserves unrelated custom claims and adds `admin: true` and `businessId: "velo"`. Sign out and back in afterward so Firebase issues a refreshed ID token. There is no public role-granting route.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Account-independent tests run against a new in-memory store for every case. Before filming, also run the following against the Firebase Emulator Suite or the disposable development project with separate browser identities:

- Happy path: one booking, one booked slot, matching receipt, owner update.
- Changed request: only the latest proposal can be confirmed.
- Occupied slot: conflict without changing the existing appointment.
- Concurrent customers: one success and one `SLOT_UNAVAILABLE` response.
- Duplicate retry: same idempotency key returns the same booking ID.
- Changed key on a consumed proposal: existing receipt and no duplicate.
- Expired/stale proposal and price tampering: rejected before writes.
- Wrong customer and non-owner access: denied without private details.
- Owner refresh: booking remains after reload.
- Audio interruption and denial: playback clears or a visible error appears; no receipt is invented.
- Alternate browser timezone: all appointment text remains in `Asia/Dubai`.

Keep exact commands and passed/total counts for the tutorial footage.

## Production build and Cloud Run

```bash
npm run build
docker build -t velo-ai-receptionist .
docker run --rm -p 8080:8080 --env-file .env -e PORT=8080 velo-ai-receptionist
```

Cloud Run should receive the Gemini key through a secret-backed environment variable and use a runtime service account authorized only for the intended Firestore project and secret. Do not copy a service-account key into the image. Configure `ALLOWED_ORIGINS` with the exact deployed origin.

The owner listener and customer API share one deployed origin. The admission counters are stored in Firestore so they continue to work across Cloud Run instances; they are tutorial-level controls, not a complete abuse-prevention program.

## Resolved core versions

The lockfile is authoritative. At the initial implementation: `@google/genai` 2.22.0, Firebase Web 12.19.0, Firebase Admin 14.4.0, React 19.3.0, Express 5.2.1, TypeScript 5.9.3, Vite 8.3.0, Zod 4.6.5, and Luxon 3.7.2.

## Scope boundaries

This first release has one business, one bay, three fixed 60-minute services, website audio, and explicit confirmation. Telephone calls, payments, SMS, cancellations, variable-duration scheduling, verified customer contact details, and broader production reliability work are intentionally outside the tutorial scope.
