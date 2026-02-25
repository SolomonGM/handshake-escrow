# Handshake

Full-stack web application with a modern React frontend and an Express/MongoDB backend. Built for real-time experiences with Socket.IO and a modular API surface.

## Live Site

Site: [Handshake](https://handshake-frontend-9zqv.onrender.com/)

## Highlights

- Modular API: auth, admin, chat, stickers, tickets, trade requests, passes, discord, leaderboard, transactions
- Real-time updates with Socket.IO
- Vite + React frontend with Tailwind CSS
- MongoDB Atlas compatible data layer

## Tech Stack

- Frontend: Vite, React, Tailwind CSS
- Backend: Node.js, Express, Socket.IO
- Database: MongoDB (Atlas)

## Repository Structure

- `src/` frontend app
- `public/` static assets
- `backend/` Node/Express API
- `backend/socket/` Socket.IO handlers

## Local Development

Prerequisites

- Node.js 18+ and npm

Frontend

- `npm install`
- `npm run dev`

Backend

- `cd backend`
- `npm install`
- `npm run dev`

## Environment Variables

Frontend (`.env`)

- `VITE_API_URL` base URL for the backend API
- `VITE_TURNSTILE_SITE_KEY` Cloudflare Turnstile site key (enables signup captcha widget)

Backend (`backend/.env`)

- `PORT`
- `NODE_ENV`
- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_URL` or `CLIENT_URLS` (comma-separated)
- `TRUST_PROXY` optional Express trust-proxy setting (default `1`, suitable for Render)
- `EMAIL_PROVIDER`, `EMAIL_FROM`
- `RESEND_API_KEY` (if `EMAIL_PROVIDER=resend`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (if `EMAIL_PROVIDER=smtp`)
- `TURNSTILE_SECRET_KEY`, `TURNSTILE_ENABLED` (signup captcha verification)
- `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX` (global per-IP API throttling)
- `BLOCKCYPHER_TOKEN`
- `ETH_NETWORK_MODE`, `ETH_TESTNET_WALLET`, `SEPOLIA_RPC_URL`, `BOT_ETH_PRIVATE_KEY`
- `DISCORD_BOT_TOKEN`, `DISCORD_USER_ID`, `DISCORD_PROFILE_REFRESH_CRON`, `DISCORD_PROFILE_REFRESH_TZ`
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_OAUTH_REDIRECT_URI` (for account linking OAuth)
- `DISCORD_GUILD_ID` (guild/server where roles are synced)
- `DISCORD_ROLE_ID_RANK_CLIENT`, `DISCORD_ROLE_ID_RANK_RICH_CLIENT`, `DISCORD_ROLE_ID_RANK_TOP_CLIENT`, `DISCORD_ROLE_ID_RANK_RUBY_RICH`, `DISCORD_ROLE_ID_RANK_MANAGER`, `DISCORD_ROLE_ID_RANK_ADMIN`, `DISCORD_ROLE_ID_RANK_OWNER`, `DISCORD_ROLE_ID_RANK_DEVELOPER` (site rank -> Discord role mapping)
- Legacy fallback (optional): `DISCORD_ROLE_ID_USER`, `DISCORD_ROLE_ID_MODERATOR`, `DISCORD_ROLE_ID_ADMIN`
- `DISCORD_SETTINGS_REDIRECT_URL` optional full frontend settings URL override (default `<CLIENT_URL>/settings`)
- `DISCORD_OAUTH_SCOPES` optional (defaults to `identify`)

Discord linking notes

- Set your Discord application redirect URI to the same value as `DISCORD_OAUTH_REDIRECT_URI` (for example `https://your-api-domain.com/api/discord/callback`).
- The `DISCORD_ROLE_ID_RANK_*` variables are required if you want automatic site-rank to Discord-role sync.

## Build and Preview

Frontend

- `npm run build`
- `npm run preview`

Backend

- `npm start`

## Deployment Notes

- The frontend expects the API base URL in `VITE_API_URL`.
- Configure CORS via `CLIENT_URL` or `CLIENT_URLS` to match your deployed frontend.
- Ensure the backend binds to `process.env.PORT`.
- For Render free instances, use API-based email delivery (`EMAIL_PROVIDER=resend` + `RESEND_API_KEY`) instead of SMTP.
- The backend now includes CSP headers, global per-IP API rate limiting, and optional Turnstile captcha enforcement on signup.

## Security Hardening (Render + Cloudflare)

1. App-level protections already in code:
- Global API per-IP throttling (`API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX`).
- Auth endpoint-specific throttling for register/login/2FA/reset flows.
- Explicit CSP via `helmet`.
- Signup captcha verification (Turnstile) when secret/site keys are configured.

2. Turnstile setup:
- Frontend env: set `VITE_TURNSTILE_SITE_KEY`.
- Backend env: set `TURNSTILE_SECRET_KEY`.
- Optional: set `TURNSTILE_ENABLED=true` to force-enable explicitly.

3. DDoS note:
- Render protects infrastructure-level traffic, but dedicated L3/L4 + WAF-style DDoS mitigation is best handled by Cloudflare in front of your custom domain.
- Keep the in-app rate limits and captcha enabled even when using Cloudflare.

## Production Email Setup (Render-Friendly)

The backend supports two providers: `resend` and `smtp`. For Render free instances, use `resend` (HTTP API) to avoid SMTP egress/reputation issues.

1. Create a Resend account and verify your sending domain.
- Add DNS records in your DNS provider exactly as Resend requests (SPF/DKIM).
- Wait for domain verification to become `verified` in Resend.

2. Create an API key in Resend.
- Use restricted permissions if possible (send-only).
- Copy the key securely.

3. Choose a sender address from your verified domain.
- Example: `no-reply@yourdomain.com`.
- Avoid unverified sender domains.

4. Configure backend environment variables in Render (your backend service).
- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY=<your_resend_api_key>`
- `EMAIL_FROM=Handshake <no-reply@yourdomain.com>`
- Keep existing required backend vars (`JWT_SECRET`, `MONGODB_URI`, etc.) intact.

5. Redeploy the backend service on Render.
- Render applies new env vars only after deploy/restart.

6. Verify from the app flows.
- Trigger `Forgot Password` to send a reset code.
- Trigger login 2FA (if enabled).
- Trigger email-change verification flow.

7. Verify sender quality and deliverability.
- Add DMARC record on your domain (`_dmarc`) with a monitoring policy first.
- Check spam folder placement in Gmail/Outlook.
- If messages are delayed/rejected, review Resend logs and DNS alignment.

8. Local/dev fallback behavior.
- In `NODE_ENV=development`, if provider delivery fails, the backend logs the code to server logs so you can continue testing.
- In production, delivery failures return a user-facing error and no code is accepted.

9. Do not use SMTP on free Render unless you explicitly validate it.
- SMTP can be blocked/throttled depending on provider/network path.
- If you must use SMTP, set:
  - `EMAIL_PROVIDER=smtp`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
