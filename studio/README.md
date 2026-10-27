# Utmost Insurance Brokers — public website

> Part of the Utmost monorepo — see the [root README](../README.md).

The customer-facing site: quote journeys (motor, medical, other lines), the AI
room analyser, claims centre, insurer directory, and the staff workspace.

**This is a front end only.** It has no server of its own. Everything that needs
a server — the quote engine, AI calls, email/OTP, claim intake, the rates desk —
is the **ERP backend** in `../ERP`, under `/api/site/*`.

```
browser ──► studio (static React)  ──/api/site/*──►  ERP (Express + Postgres)
                                                       ├─ /api/site/*   website API (this site)
                                                       └─ /api/*        staff dashboard API
```

## Run locally

1. Start the backend (in `../ERP`): `npm run dev` — serves on http://localhost:3100.
   Its `.env` holds `GEMINI_API_KEY`, `SMTP_*` and the other secrets.
2. Start the site (here): `npm install`, then `npm run dev` — http://localhost:3000.
   (Or run both from the repo root with `npm run dev`.)

`npm test` renders the screens that load their data from the backend (Home, Insurers, Other lines,
the rates desk) against mocked API responses, including the not-yet-loaded and unreachable cases.

In development Vite proxies `/api` to the ERP (`ERP_URL`, default
`http://localhost:3100`), so there is nothing to configure and no CORS to set up.

## Staff workspace login

Staff sign in with their **ERP account** (email + password) — the same account as
the ERP dashboard. What they can do follows their ERP role: the rates desk and
insurer/logo admin need the `insurer_rate.manage` permission, the audit register
needs `audit.view`. The old shared demo passwords no longer exist.

## Production

It builds to static files (`npm run build` → `dist/`) that any static host can serve
(the repo-root `render.yaml` deploys it). Two settings connect it to the backend:

- Build with `VITE_API_URL=<the ERP's public origin>` (see `.env.example`).
- On the ERP, add this site's origin to `ALLOWED_ORIGIN`, and set `TRUST_PROXY`.

## Notes

- The site bundles no insurer list, rate table or quote-engine setting. Insurers, product lines, medical
  age bands, levies and rates all come from the backend (`/api/site/insurers`, `/api/site/config`,
  `/api/site/admin/rates`), which reads them from the one PostgreSQL database.
