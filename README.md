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

Backend (`backend/.env`)

- `PORT`
- `NODE_ENV`
- `MONGODB_URI`
- `JWT_SECRET`
- `CLIENT_URL` or `CLIENT_URLS` (comma-separated)
- `EMAIL_PROVIDER`, `EMAIL_FROM`
- `RESEND_API_KEY` (if `EMAIL_PROVIDER=resend`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (if `EMAIL_PROVIDER=smtp`)
- `BLOCKCYPHER_TOKEN`
- `ETH_NETWORK_MODE`, `ETH_TESTNET_WALLET`, `SEPOLIA_RPC_URL`, `BOT_ETH_PRIVATE_KEY`
- `DISCORD_BOT_TOKEN`, `DISCORD_USER_ID`, `DISCORD_PROFILE_REFRESH_CRON`, `DISCORD_PROFILE_REFRESH_TZ`

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
