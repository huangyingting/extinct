# Historical research: content-first alternatives

Research date: **2026-11-16**.

> **Superseded for the main application.** This research assumed a public educational atlas with profiles, articles, maps, and no central 3D requirement. The user subsequently clarified that the product is a 3D app. The current recommendation is in [3D technology stack](3d-technology-stack.md). The findings below remain useful for optional editorial, search, mapping, and backend features.

## Original assumptions and recommendation

Assumptions were a solo developer/small team, modest budget, a curated catalogue, search-engine-discoverable pages, and updates compatible with rebuilding. Accounts, live collaboration, AI, and interactive 3D were not initial requirements in that interpretation.

The original recommendation was **Astro + TypeScript + validated Markdown/JSON content + Pagefind + Leaflet**, deployed statically with no runtime database.

Astro prerenders by default and supports selectively interactive islands. Content collections support loaders, remote sources, and schema validation. Build-time content needs a rebuild to publish.[^astro]

This recommendation was reasonable for the assumed content site but does not establish suitability for the clarified 3D core.

## Framework comparison

| Framework | Appropriate scenario considered | Tradeoff |
|---|---|---|
| Astro | Mostly stable profiles/articles with selective interactions | Build-time publishing; more coordination work for complex shared interaction |
| Next.js/React | Accounts, saved searches, collections, and application-style interaction | Server/client boundaries and deployment decisions; static export excludes request-dependent features and other server capabilities |
| Django | Python team and database-backed staff editing | Built-in admin is for trusted staff, not the public frontend or every editorial workflow |

These are contextual recommendations based on official capabilities, not performance rankings.[^astro][^next][^django]

For public information pages, preserve crawlable links, titles/descriptions, canonical URLs, sitemaps, and correct missing-page responses. Google can render JavaScript, but its guidance discusses prerendered/server HTML and bots that do not execute JavaScript.[^seo]

## Content and editorial workflow

The proposed content workflow was validated species records plus Markdown articles, with a human review stage and explicit sources/credits. Astro supports `glob()` for individual content files, `file()` for a collection in one file, and Zod-backed schemas.[^astro]

**Decap CMS** is an option for Git-backed browser editing and editorial workflow. Its GitHub backend requires authentication setup and appropriate repository permissions. Protect the publication branch and require review/CI if adopted.[^decap]

A hosted headless CMS such as **Sanity** is an alternative where Git access is unsuitable. Draft visibility, publishing permissions, approval process, and rebuild triggers still need deliberate configuration.[^sanity]

Schema validation checks structure, not scientific truth. Preview deployments and search indexes must not unintentionally publish drafts.

## Static search versus database search

**Pagefind** indexes built HTML and supports browser-side filters, including filter-only browsing. Publish its generated index with the corresponding pages; additions, deletions, and changed facets require reindexing. Multiple filter values default to AND; use documented `any` behavior when OR semantics are intended.[^pagefind]

Suggested facets were plant/animal, taxonomy, region, and time category. A small catalogue could also use simple generated JSON search; measure download size instead of assuming it scales indefinitely.

For database-backed content, evaluate **PostgreSQL full-text search** and **`pg_trgm`** similarity before adopting a separate search service. A separate service adds synchronization and operations, and was recommended only after a measured relevance, latency, or advanced-autocomplete need.[^search]

## Database and spatial queries

Move from static content to PostgreSQL when live writes, concurrent editing, frequent updates without rebuilds, or server-side queries justify it.

Supabase documents hosted PostGIS, GiST indexes, distance/viewport queries, and database functions. Check project configuration, apply appropriate row-level access policies, and keep privileged keys server-side.[^postgis]

**ORM findings need version checks:**

- Drizzle documents point geometry, GiST indexes, and SQL expressions for spatial operations; this is not evidence that every geometry type is equally supported.
- Prisma's official PostGIS extension documentation describes geometry and spatial predicates with ORM 8; v7 documentation treats unsupported database fields differently.
- Research observed a release-candidate package tag during the spatial-support investigation. Do not assume current stable-release availability or compatibility without checking again.
- Portable SQL migrations and parameterized spatial queries are a viable foundation; an ORM is not a prerequisite for choosing PostGIS.

Do not confuse degrees with meters. Validate global spatial behavior, including the antimeridian and polar regions, for the operations actually used.[^orm][^postgis]

## Maps

**Leaflet** was recommended for straightforward raster maps, markers, and GeoJSON overlays. **MapLibre GL JS** was the alternative for vector-tile styling and richer GPU-rendered visualization. Neither supplies a hosted basemap.[^maps]

The OpenStreetMap standard tile service is best-effort, requires attribution and caching, and prohibits bulk prefetching/offline downloads. Select a provider and plan separately; evaluate tile-provider terms and underlying data rights.[^tiles]

A modern basemap is not reconstructed ancient geography. See [scientific data and licensing](scientific-data-and-licensing.md) for coordinate and reconstruction requirements.

## Hosting and cost observations

These observations concerned a **small static content MVP**, not delivery of a large 3D asset catalogue.

| Option | Research-time observation | Qualification |
|---|---|---|
| Cloudflare Pages | Free-plan limits documented as 500 builds/month, 20,000 files, and 25 MiB per asset | Functions use Workers quotas; research noted guidance toward Workers for new projects; check the current deployment path |
| Vercel | Hobby included 100 GB/month transfer; Pro started at $20/month | Hobby is personal/noncommercial; educational purpose alone does not establish eligibility |
| Supabase | Free: 500 MB database, 1 GB storage, separate 5 GB ordinary/cached egress allowances; Pro started at $25/month | Inactive free projects can pause; extra projects/compute/storage/egress can add cost |

All limits/prices above are research-time observations, not contractual quotes or guaranteed current entitlements.[^cloudflare][^vercel][^supabase-pricing]

Static Astro needs no runtime database. Vercel static deployment needs no Astro adapter, while on-demand rendering needs an appropriate adapter. Cloudflare server rendering introduces Workers runtime compatibility and quota considerations.[^deploy]

The original planning estimate was **$0-$30/month**, plus a domain and tile/media services, assuming modest static traffic and eligible plans. **Do not carry this estimate over to a 3D app without measuring asset delivery.**

Illustration: 10,000 visits at 3 MB of site assets per visit is approximately 30 GB, excluding separately fetched tiles. Models, textures, animations, audio, repeated downloads, and cache behavior can materially change the 3D application's budget.

## Scientific findings preserved elsewhere

The original research also covered GBIF, PBDB, IUCN, Commons, source-specific taxonomy, uncertain extinction dates, modern versus ancient coordinates, and per-asset rights. These remain applicable and are consolidated in [scientific data and licensing](scientific-data-and-licensing.md).

## Original proposed delivery sequence

The content-first sequence was: curate records, generate static profiles/articles, add search/filters, add maps/timeline, introduce editorial review and usage monitoring, then expand infrastructure only against demonstrated needs.

For the clarified product, replace the static-profile-first priority with a representative **3D scene prototype**, while retaining provenance and rights review from the beginning.

## Canonical implementation example

The research inspected Astro's official blog example for schema-backed collections and generated detail pages in [withastro/astro](https://github.com/withastro/astro).

Reported indexed commit: `5b7c3275cf2f4aa0d1685495f943cb19039a2e83`. This was a search-index snapshot, not a separately resolved current HEAD:

- [examples/blog/src/content.config.ts:1-20](https://github.com/withastro/astro/blob/5b7c3275cf2f4aa0d1685495f943cb19039a2e83/examples/blog/src/content.config.ts#L1-L20)
- [examples/blog/src/pages/blog/[...slug].astro:1-20](https://github.com/withastro/astro/blob/5b7c3275cf2f4aa0d1685495f943cb19039a2e83/examples/blog/src/pages/blog/%5B...slug%5D.astro#L1-L20)

This illustrates content-site patterns, not a 3D application implementation.

## Evidence and confidence

The initial report synthesized seven focused investigations: frameworks, scientific sources, storage/maps/search, hosting, editorial workflow, reuse restrictions, and spatial-support verification.

Documented framework capabilities are well supported; the initial product assumptions were subsequently corrected. IUCN pages were partly inaccessible, legal interpretation remains uncertain, version-specific ORM behavior can change, and prices need fresh confirmation. No application or benchmark was produced.

## Sources

[^astro]: Astro, [rendering](https://docs.astro.build/en/guides/on-demand-rendering/), [islands](https://docs.astro.build/en/concepts/islands/), and [content collections](https://docs.astro.build/en/guides/content-collections/).
[^next]: Next.js, [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) and [static exports](https://nextjs.org/docs/app/guides/static-exports).
[^django]: Django, [admin](https://docs.djangoproject.com/en/stable/ref/contrib/admin/) and [sitemaps](https://docs.djangoproject.com/en/stable/ref/contrib/sitemaps/).
[^seo]: Google, [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
[^decap]: Decap, [editorial workflows](https://decapcms.org/docs/editorial-workflows/) and [GitHub backend](https://decapcms.org/docs/github-backend/).
[^sanity]: Sanity, [drafts and versions](https://www.sanity.io/docs/content-lake/drafts-and-versions).
[^pagefind]: Pagefind, [indexing](https://pagefind.app/docs/indexing/) and [filtering API](https://pagefind.app/docs/js-api-filtering/).
[^search]: Supabase, [full-text search](https://supabase.com/docs/guides/database/full-text-search); PostgreSQL, [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html). Hosted-extension evidence also appeared in [supabase/postgres](https://github.com/supabase/postgres), [nix/tests/prime.sql:57-71 at cdf19ea03dec1f7e6d45fe8a7fafa8234b442b9a](https://github.com/supabase/postgres/blob/cdf19ea03dec1f7e6d45fe8a7fafa8234b442b9a/nix/tests/prime.sql#L57-L71); verify the actual project.
[^postgis]: Supabase, [PostGIS guide](https://supabase.com/docs/guides/database/extensions/postgis).
[^orm]: Drizzle, [PostGIS point geometry](https://orm.drizzle.team/docs/guides/postgis-geometry-point); Prisma, [PostGIS extension](https://www.prisma.io/docs/orm/extensions/postgis) and [v7 unsupported features](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/unsupported-database-features).
[^maps]: Leaflet, [reference](https://leafletjs.com/reference.html); MapLibre, [documentation](https://maplibre.org/maplibre-gl-js/docs/).
[^tiles]: OpenStreetMap Foundation, [tile policy](https://operations.osmfoundation.org/policies/tiles/).
[^cloudflare]: Cloudflare, [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).
[^vercel]: Vercel, [pricing](https://vercel.com/pricing) and [terms](https://vercel.com/legal/terms).
[^supabase-pricing]: Supabase, [pricing](https://supabase.com/pricing).
[^deploy]: Astro, [Cloudflare deployment](https://docs.astro.build/en/guides/deploy/cloudflare/) and [Vercel deployment](https://docs.astro.build/en/guides/deploy/vercel/).
