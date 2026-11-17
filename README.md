# Extinct

Research and planning for a **browser-based 3D experience about extinct plants and animals**.

The intended product is an interactive experience, not primarily a text encyclopedia. Possible experiences discussed so far include inspecting reconstructed organisms, exploring prehistoric habitats, and navigating geological time. The exact experience and target devices remain open decisions.

**Status:** research plus a minimal 3D prototype. Two reconstructed dinosaurs, *Tyrannosaurus rex* and *Triceratops horridus*, walk through a procedurally generated Hell Creek landscape. Six scenes run in time order: floodplain at morning, forest at midday, river at dusk, the Chicxulub impact as seen from Hell Creek, the fern-covered aftermath without non-avian dinosaurs, and a Smithsonian fossil scan. Each scene lists the evidence it rests on, labelled as evidence, inference, debate or staging, with references. Motion uses a locomotion controller with procedural layers, and the *Triceratops* has a planted-foot leg gait. PBDB fossil-record data and full asset provenance are shown in the app. See [prototype](docs/prototype.md) for what was built, how it was verified, and its limitations. Nothing has been deployed, frame rate on consumer hardware has not been measured, and no rights or scientific review has been done.

## Quick start

```bash
npm install
npm run dev        # open http://localhost:5173 (add ?scene=impact etc. to open a scene directly)
```

Asset and data regeneration (Blender, gltf-transform, PBDB) is described in [docs/prototype.md](docs/prototype.md#running-it).

## Current technology recommendation

**React + TypeScript + Vite + Three.js through React Three Fiber + Drei**, with **Blender** for asset preparation and **glTF/GLB** for delivery.

Use object storage and a CDN for models, textures, and audio. Add Zustand when shared interface state warrants it, and Supabase/PostgreSQL only when accounts, saved collections, or database-managed records are required.

**Alternative:** favor Babylon.js if walking through environments, character controllers, collisions, and substantial physics become the central experience.

These are recommendations, not a finalized or implemented technology selection. Next.js is optional; the initial Astro recommendation was based on an incorrect content-first assumption and is superseded for the core 3D experience.

## Research documents

| Document | Contents |
|---|---|
| [Prototype](docs/prototype.md) | What was implemented, the asset pipeline, data handling, verification, and limitations |
| [3D technology stack](docs/research/3d-technology-stack.md) | Current recommendation, architecture, engine tradeoffs, asset pipeline, performance priorities, and open decisions |
| [Scientific data and licensing](docs/research/scientific-data-and-licensing.md) | GBIF, PBDB, IUCN, Commons, provenance, uncertainty, taxonomy, and reuse constraints |
| [Reference experiences](docs/research/reference-experiences.md) | 3D Dinopedia, Ancient Earth, Smithsonian 3D, and Digital Atlas of Ancient Life |
| [Content-first alternatives](docs/research/content-first-alternatives.md) | Historical Astro/Next.js/Django comparison, search, maps, CMS, database, hosting, and cost findings |

Research was conducted on **2026-11-16**. Documents distinguish verified documentation, recommendations, assumptions, and limitations. Prices, terms, and version-specific behavior must be checked again before implementation.

## Suggested product direction

Combine **Dinopedia's species exploration**, **Ancient Earth's time navigation**, and **Smithsonian's scientific grounding**. These references demonstrate complementary ideas; they do not prove that one existing product implements the complete proposed experience.

Start by validating one small 3D scene on representative devices before committing to a large catalogue or world. Publicly viewable models are not automatically licensed for reuse, and reconstructed organisms must not be presented as direct fossil scans.
