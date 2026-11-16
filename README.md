# Extinct

Research and planning for a **browser-based 3D experience about extinct plants and animals**.

The intended product is an interactive experience, not primarily a text encyclopedia. Possible experiences discussed so far include inspecting reconstructed organisms, exploring prehistoric habitats, and navigating geological time. The exact experience and target devices remain open decisions.

**Status:** research documentation only. No application, deployment, benchmark, or licensed asset collection has been implemented.

## Current technology recommendation

**React + TypeScript + Vite + Three.js through React Three Fiber + Drei**, with **Blender** for asset preparation and **glTF/GLB** for delivery.

Use object storage and a CDN for models, textures, and audio. Add Zustand when shared interface state warrants it, and Supabase/PostgreSQL only when accounts, saved collections, or database-managed records are required.

**Alternative:** favor Babylon.js if walking through environments, character controllers, collisions, and substantial physics become the central experience.

These are recommendations, not a finalized or implemented technology selection. Next.js is optional; the initial Astro recommendation was based on an incorrect content-first assumption and is superseded for the core 3D experience.

## Research documents

| Document | Contents |
|---|---|
| [3D technology stack](docs/research/3d-technology-stack.md) | Current recommendation, architecture, engine tradeoffs, asset pipeline, performance priorities, and open decisions |
| [Scientific data and licensing](docs/research/scientific-data-and-licensing.md) | GBIF, PBDB, IUCN, Commons, provenance, uncertainty, taxonomy, and reuse constraints |
| [Reference experiences](docs/research/reference-experiences.md) | 3D Dinopedia, Ancient Earth, Smithsonian 3D, and Digital Atlas of Ancient Life |
| [Content-first alternatives](docs/research/content-first-alternatives.md) | Historical Astro/Next.js/Django comparison, search, maps, CMS, database, hosting, and cost findings |

Research was conducted on **2026-11-16**. Documents distinguish verified documentation, recommendations, assumptions, and limitations. Prices, terms, and version-specific behavior must be checked again before implementation.

## Suggested product direction

Combine **Dinopedia's species exploration**, **Ancient Earth's time navigation**, and **Smithsonian's scientific grounding**. These references demonstrate complementary ideas; they do not prove that one existing product implements the complete proposed experience.

Start by validating one small 3D scene on representative devices before committing to a large catalogue or world. Publicly viewable models are not automatically licensed for reuse, and reconstructed organisms must not be presented as direct fossil scans.
