# MediTrack

**Rubric update:** existing installations must apply [UPDATE-INSTRUCTIONS.md](UPDATE-INSTRUCTIONS.md). Database-enforced roles, CTEs and additional verification are documented in [RUBRIC_UPDATE.md](docs/RUBRIC_UPDATE.md).
Smart Pharmacy Inventory & Expiry Management System â€” DBMS Level 3.

A complete Next.js application with MySQL inventory and invoices, Qdrant semantic search, and a local sentence-transformer embedding service. Catalogue data is fictional and intended for coursework.

## Downloaded package
The ZIP includes the project source and its hidden .git directory with all 14 commits. Extract the whole MediTrack folder. A separate MediTrack-history.bundle is supplied as a portable Git backup; clone it with `git clone MediTrack-history.bundle MediTrack-restored` if needed. Dependencies, generated builds and private .env files are excluded.

## Quick start (Windows)
Prerequisites: Node.js 22+, PowerShell, Git, and Docker Desktop running with Linux containers. The first model download needs internet access.

```powershell
cd MediTrack
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
npm run dev
```
Open http://localhost:3000. Sign in as `admin@meditrack.local` or `staff@meditrack.local`. Read your generated `DEMO_ADMIN_PASSWORD` and `DEMO_STAFF_PASSWORD` from the local, ignored `.env`. The setup script creates random secrets; it does not print them.

## Manual start / macOS / Linux
1. Copy `.env.example` to `.env`. Replace all CHANGE_ME values with distinct long passwords / keys. Use URL-safe database passwords, or URL-encode credentials in DATABASE_URL.
2. Run `npm ci`.
3. Run `docker compose up -d --build mysql qdrant embedding`.
4. Wait until MySQL and the embedding service are healthy: `docker compose ps`. Inspect `docker compose logs embedding` during the first model download.
5. Run `node --env-file=.env --import tsx scripts/apply-update.ts` to create database roles and runtime accounts.
6. Run `node --env-file=.env --import tsx scripts/seed.ts --with-vectors`.
7. Run `npm run dev`; open http://localhost:3000.

The default compose profile launches only the three data services. The application reads .env automatically through Next.js. The standalone seed and reindex scripts must be launched with `node --env-file=.env`.

## Production-style local run
```sh
npm run build
npm start
```
Or run `docker compose --profile full up -d --build` after seeding. Do not run npm dev on the same port at the same time. For HTTPS deployment set APP_ORIGIN to the actual origin and COOKIE_SECURE=true. Hosting infrastructure is not included.

## Features and roles
| Feature | Staff | Admin |
|---|---|---|
| Dashboard, stock, expiry alerts | Yes | Yes |
| Catalogue and supplier reads | Yes | Yes |
| Transactional billing, invoice history, print receipt | Yes | Yes |
| Semantic / substitute / symptom search | Yes | Yes |
| Add/edit/archive medicine | No | Yes |
| Receive batches, adjust audited stock | No | Yes |
| Add/edit/delete unused supplier | No | Yes |
| Rebuild vector index | No | Yes |

Prices are stored in paise. Quantities are units, not automatically packs or strips. The earliest usable expiry is allocated first (FEFO). Expiry is treated conservatively: a batch expiring today is blocked. Database CURRENT_DATE uses the server's date; the default containers use UTC. Set a consistent pharmacy timezone at the database service if that policy must follow local midnight.

## Verification
```sh
npm run typecheck
npm test
npm run build
```
For database tests, use `scripts/test-database.ps1` after Docker setup. It creates `meditrack_test`, loads schema/rules, and runs 13 integration cases. Use a fresh test database for its first invocation; subsequent runs of the test suite alone can append isolated fixtures.

Manual invocation:
```sh
# Load both SQL scripts into a DISPOSABLE database first, changing their USE statements.
# Export TEST_DATABASE_URL to that test database, then:
npm run test:integration
```
Integration tests never silently fall back to DATABASE_URL. See [testing results](docs/TESTING.md) for checks actually executed in this environment.

## Database demonstration
`database/01-schema.sql`: tables, foreign keys, checks, indexes, ALTER.
`database/02-rules.sql`: expiry/stock/price triggers, immutable invoices, stock ledger, view, function, procedure.
`database/03-demonstration.sql`: JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subquery, full-text search, safe temporary-table DDL/DML.

SQL initialization runs only on an empty Docker MySQL volume. For existing installations, apply migrations deliberately; restarting a container does not rerun initialization scripts. Do not delete a volume containing records you need.

## Vector index
The embedding service uses `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions), normalizes vectors, and Qdrant ranks by cosine similarity. Brand, ingredient, strength, form, description and indications form each embedded document. Search returns only active medicines with current nonexpired SQL stock. Substitute results require exactly matching ingredient, strength and form. Symptom results additionally require OTC classification and a curated indication. A source-text fingerprint suppresses stale indexed text after edits.

Rebuild after catalogue edits, either in Smart search as Admin or:
```sh
node --env-file=.env --import tsx scripts/reindex.ts
```
Stock changes do not require reindexing because stock is checked in MySQL on every search. Misspelled-name relevance depends on the embedding model and is not guaranteed. The index fetches at most 100 candidates and the UI displays at most 12; larger catalogues need pagination or selective vector filters.

## Security and operational scope
Passwords use salted scrypt hashes; cookies are HttpOnly, SameSite=Lax and expire after eight hours. Sessions store token digests; every protected endpoint verifies active users and admin authorization. Writes reject cross-origin requests, use parameterized SQL, and validate input. Five failed login attempts per email within 15 minutes are rate-limited in MySQL.

This is a coursework implementation. The fictional medicine classifications are not a vetted clinical formulary. Pharmacist review is required for catalogue entries and substitutions. It has no patient records, prescription validation, returns workflow, taxes, purchase orders, or production monitoring.

## Team and Git history
- **diran07** â€” diransomanna@gmail.com: schema rules, database access, checkout validation/transactions, vector search, interface, tests, foundation.
- **DIkshith1311** â€” dikshithvarma1311@gmail.com: relational schema, queries, authentication, inventory APIs, reporting APIs, deployment/seeding, documentation.

The local repository contains seven substantive commits attributed to each supplied identity. These commits package AI-generated implementation work according to the team's assigned responsibilities; they do not establish independent human authorship. Both members should review, understand, run and extend their assigned areas before demonstrating the project. Full mapping: [CONTRIBUTIONS.md](docs/CONTRIBUTIONS.md).

To publish the existing history into your own empty GitHub repository:
```sh
git remote add origin https://github.com/YOUR_ACCOUNT/MediTrack.git
git push -u origin main
```
Do not initialize the GitHub repository with a separate README if you want a direct initial push.

## Documentation
- [Project report, architecture, ER diagram, relational schema and data dictionary](docs/PROJECT_REPORT.md)
- [Requirement traceability](docs/REQUIREMENTS.md)
- [Test cases and verified results](docs/TESTING.md)
- [Demonstration and viva guide](docs/DEMO_GUIDE.md)
- [Contribution mapping](docs/CONTRIBUTIONS.md)
