# My Pigs

Farm management for a small commercial piggery, built for one operator on a phone, at the pen, often with no signal. An offline-first PWA: every screen works with no connection, and a weight recorded in a pen is saved before the thumb leaves the screen.

It replaces handwritten phone notes that never agreed with each other. The rules it is built on:

- **The tag is the pig; the room is where it stands.** Rooms get reused, so a room never stands in for an animal. A farrowing whose room does not hold the sow it names is refused.
- **Every ration carries its diluent and its basis.** "1:3" means nothing without knowing what the 3 is and whether it is counted in bags or kilograms — bag sizes differ by product (maize bran 25 kg, concentrate 50 kg).
- **Dead weight is never compared with live weight** until it has been through the dressing percentage. Every dead-weight price is shown next to its live equivalent.
- **Records that do not reconcile are flagged and kept**, never silently cleaned away.
- **Every computed figure shows its inputs on tap.** Currency is Zambian kwacha, written `K1,234`.

## What it does

- **Animals, tags and rooms** — the herd by stage, lineage, room history, pen and per-pig weigh-ins, growth projections to market weight.
- **Breeding** — services, expected farrowings (114 days), litters, and litters whose sow was only named by room kept unassigned until she is identified by tag.
- **Costs and feed** — cost lines by category with capital kept out of cost-per-pig; feed products with bag sizes, purchases, rations with ratio basis, feed need and run-out forecast.
- **Sales and the offer calculator** — live and dead-weight sales, heads and trotters, dressing percentage, live equivalent per kg, what each sold pig fetched, and a hold-or-sell calculator for an offer on the table.
- **Pay and schedules** — workers, payroll with advances counted separately, pay and feed-buying rules that put paydays and feed buys on the calendar with amounts.
- **Calendar and cash flow** — a month grid of colour-and-shape marks (pay, feed, farrowing, sale-ready, tasks, overdue), sales in against running costs out by month, and a 30-day cash plan.
- **Equipment register** — every item traced to the cost line it was bought on, repairs attached to the item.
- **Flags** — every record that does not reconcile, visible until resolved.

It is a Next.js static export served as a PWA: every screen is a precached file, the local IndexedDB store (Dexie) is the source of truth, and nothing waits on the network. Every record carries `id`, `updated_at` and `device_id`, and every write is queued in `sync_queue`, so server sync is an addition rather than a rewrite.

```
src/domain/     the arithmetic: offer/hold-or-sell, sales, rations, growth, herd,
                cash flow, schedules — pure functions
src/db/         Dexie schema, write path with sync queue, settings (every constant with
                its source), seed loader, calendar generator
src/seed/       the sample farm, and the generated pointer to whichever farm is loaded
src/app/        the screens
scripts/        gen-seed (picks the farm), build-sw (precache manifest), gen-icons, serve
deploy/         nginx config, Caddyfile
data/schema.sql the complete schema as SQL DDL
```

## Sample data and your own farm

Out of the box the app opens with a **made-up sample farm** (`src/seed/sample.ts`): three breeding animals, two litters, a live and a dead-weight sale, a year of costs and pay, and a couple of flags. Every name and figure in it is invented.

A real farm's records stay out of this repository. Put them in a `private/` folder at the root — it is in `.gitignore` and is never committed:

```
private/
  farm.ts          exports SEED_VERSION, seedRows() and topUp(rows) — same shape as src/seed/sample.ts
  settings.ts      exports SETTING_OVERRIDES: your own figures for the settings in src/db/settings.ts
  seed/            whatever raw files your farm.ts reads (bundled into src/seed/seed-data.json)
  tests/           tests against your own records (picked up by `pnpm test`)
```

Before every `dev`, `build`, `test` and `typecheck`, `scripts/gen-seed.mjs` checks for `private/farm.ts` and points `src/seed/farm.ts` at it, or at the sample farm when it is absent. Nothing else changes.

## Run it

```
pnpm install           # Node 20.9+, pnpm 10 (`corepack enable` provides it)
pnpm dev               # http://localhost:3000 — no service worker in dev
pnpm test              # the money and identity maths, sample farm checks, and private/tests when present
pnpm build             # static export in out/, with sw.js
pnpm start             # serves out/ on :3000, offline behaviour included
```

The tests are deliberately few: sales and dressing percentage, the offer calculator, rations, pay schedules, and the sample farm's integrity. They never ship in the app, and the Docker build installs without the test tools (`pnpm install --prod`).

## Deploy it with Docker Compose

```
docker compose up -d --build           # http://<host>:3000  (PORT=… to change)
```

To deploy your own farm rather than the sample, copy your `private/` folder onto the server next to the checkout before building — the image build picks it up the same way. Keep it off any public place.

The image is nginx serving the export; there is no database or server-side state, so nothing to back up on the server. Farm data lives in the phone — use Settings → Export backup.

Installing to a phone's home screen needs a secure origin. `localhost` counts; a LAN address does not. For a real install, point a DNS name at the machine and run the HTTPS profile, which puts Caddy in front with automatic certificates:

```
DOMAIN=pigs.example.com docker compose --profile https up -d --build
```

Copy `.env.example` to `.env` to keep `PORT` and `DOMAIN` out of the command line. A new build is picked up by installed phones on their next open ("Update ready" toast).

**On a server that already runs nginx**, publish the container on loopback only (`PORT=127.0.0.1:8090`) and proxy a site to it from the host's nginx, with its own certificate. With your own farm's records baked in, put a password in front (`auth_basic`): the records ship inside the JavaScript, so anyone who can load the page can read them. A small server does not need to build the image — build it on your own machine and copy it across with `docker save my-pigs-app:latest | ssh server docker load`.

## What to know

- **The Windows export quirk.** Next 16's static export writes its segment-cache payloads into nested folders on Windows; `scripts/build-sw.mjs` flattens them so a Windows build matches a Linux one. Docker builds are unaffected.
- **Weaning age has no default**, so the calendar cannot project weaning dates until it is entered under Settings. The app says so rather than guessing.
- **Pen weigh-ins are stored against the room**, not spread across the pigs, when nobody recorded which pig was which. The "By tag" mode on the weigh screen records per pig.
- **A weigh-in that cannot be trusted is kept, not deleted.** "Not valid" on a room's page leaves it out of every daily gain and sale projection, with the reason beside it; "Count it" brings it back. The weigh screen asks whether the scale reads 0 before the first pig.
- **Intake is per stage**: weaners, sows and boars, and growers and finishers each have their own daily rate under Settings; a lactating sow eats 2.5 kg plus 0.25 kg per piglet.
- **The daily running cost** is a setting; Money also computes it from actual spend ÷ pig-days for the last three months and offers to replace the setting with that figure.
- **Feed buying rhythm** is a schedule rule: add one under Schedule (product + how often) and the calendar says when to buy and how many bags, worked out from the current rations and herd. A month-end pay rule can pay the **balance** of the monthly rate after any advances already taken.
- **Chart colours are validated, not eyeballed.** The calendar marks and cash-flow bars use hues checked for colour-vision separation across every pair; shape is the second encoding on the calendar. Keep to those tokens (`--c-pay`, `--c-feed`, `--c-breed`, `--c-in`, `--c-task`, `--c-overdue`) when adding a kind.
