# Utmost Insurance Brokers

One repository, one database.

| | What it is | Stack |
|---|---|---|
| [`studio/`](studio) | The public website: quote journeys, claims centre, insurer directory, staff workspace. **A front end only.** | React 19, Vite, Tailwind |
| [`ERP/`](ERP) | The backend that runs the business: CRM, policies, claims, finance, HR, compliance, **and the website's API** (`/api/site/*`), plus the staff dashboard. | Express, TypeScript, Drizzle, PostgreSQL |

The website holds no insurer list, no rates and no settings of its own. It fetches them from the
backend, which reads them from the same PostgreSQL database as everything else: insurers and their
premium rate tables, statutory levies, claims, quotes, logos and the audit trail. There are no data
files anywhere.

In production the site lives on the main domain and the backend on a subdomain
(`www.<domain>` and `api.<domain>`) — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Run it

```bash
npm run install:all        # once: installs both apps
npm run dev                # backend on :3100, site on :3000 (the site proxies /api to the backend)
```

Open http://localhost:3000 for the website and http://localhost:3100 for the staff dashboard.
Development uses an embedded PostgreSQL by default, so there is nothing else to install. Dev logins
(password `ChangeMe123!`, for local use only): `amina@utmostbrokers.co.ke` (admin),
`peter@utmostbrokers.co.ke` (underwriter), `grace@utmostbrokers.co.ke` (claims). The same accounts
sign in to the website's staff workspace.

| Command (from the repo root) | |
|---|---|
| `npm test` | API tests (embedded PostgreSQL) and website tests |
| `npm run lint` | type-check both apps |
| `npm run build` | production builds of both |
| `npm run db:migrate` | bring a database up to date |

To use a real PostgreSQL server instead of the embedded one, and to run the tests against it, see
the end of [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Where to read next

* [`ERP/README.md`](ERP/README.md) — the backend: modules, auth and permissions, the website API,
  migrations, tests.
* [`studio/README.md`](studio/README.md) — the website.
* [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — domains, DNS, secrets, backups.

## How the pieces fit

```
studio/  ──fetch──►  ERP /api/site/*  ──►  PostgreSQL  ◄──  ERP /api/*  ◄──  staff dashboard (ERP/src)
 insurers, quote-engine settings,           product.insurers
 rates, quotes, claims, OTP                 product.premium_rate_versions
                                            product.statutory_levies
                                            claims.claims, compliance.audit_log, site.* ...
```

* A customer's claim notification on the site is a real claim in the ERP, linked to their policy.
* Staff change rates in the website's rates desk (or the dashboard); a new pricing table is published
  as a new version, the live one is retired — never overwritten — and the change is in the audit log.
* New insurers added through the rates desk land in the ERP's insurer register "under review", and
  are quoted on the website once they have live rates.

## Source documents

The folder this repository sits in also holds the business's reference material (binders, rate
letters, policy jackets, scans). Those files are deliberately **not** tracked — see `.gitignore`.
