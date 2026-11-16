# Prototype: Hell Creek in 3D

Built **2026-11-16**. A minimal, runnable implementation of the stack recommended in [3D technology stack](research/3d-technology-stack.md). It shows two reconstructed dinosaurs in realistic scenes, and applies the provenance and uncertainty rules in [scientific data and licensing](research/scientific-data-and-licensing.md).

## What it is

Three scenes set in the latest-Cretaceous **Hell Creek Formation**. *Tyrannosaurus rex* and *Triceratops horridus* are the two species with the most occurrences there in PBDB.

| Scene | Content |
|---|---|
| Fern prairie, morning | Three *Triceratops* walk and graze along a river floodplain. A *T. rex* is on the far bank. |
| River margin, dusk | A *T. rex* patrols the channel bank. Two *Triceratops* are in the distance. |
| Fossil evidence | The Smithsonian's CC0 photogrammetry of its mounted *T. rex* over a *Triceratops*, in a dark gallery. This is the scanned evidence that the reconstructions are inferred from. |

Interaction:
- Orbit and zoom the camera.
- Switch focus species; the camera follows the focused animal.
- Override behaviour: *Natural*, *Walk* or *Stay*.
- Trigger the one-shot clip: *Roar* (T. rex) or *Look up* (Triceratops).
- Open the species panel (PBDB fossil-record summary and reconstruction notes) or the sources and credits panel.

This follows the research synthesis ([reference experiences](research/reference-experiences.md)): species in their environment, as in Dinopedia, with a scan kept clearly distinct from the reconstructions, as in Smithsonian 3D and Digital Atlas.

## How each research document was applied

| Document | Applied in the prototype |
|---|---|
| [3D technology stack](research/3d-technology-stack.md) | The recommended stack (table below) and the Blender → glTF/GLB pipeline, run through its seven steps: source, rights, scan vs reconstruction, prepare in Blender, export and review, optimise and attach provenance, evaluate. Its performance priorities shaped the build: compressed geometry and textures, instancing of repeated vegetation, and render cost measured on a representative scene (see verification). Its open decisions were resolved as: inspectable animals in a habitat rather than a walkable world, photorealistic direction, skeletal animation, and prehistoric life. |
| [Scientific data and licensing](research/scientific-data-and-licensing.md) | PBDB used under CC BY 4.0, with attribution and retrieval date. IUCN deliberately not used, since it does not cover prehistoric taxa and has permission constraints. Rights recorded per asset in `pipeline/sources.json`, with no assumption that public availability means a licence. Separate claims kept separate: interval bounds vs extinction date, modern vs palaeocoordinates, qualified identifications counted. Scan vs reconstruction labelled. Editorial status "draft". |
| [Reference experiences](research/reference-experiences.md) | Dinopedia-style species-in-environment presentation, Smithsonian 3D's scanned specimen used directly (CC0), and evidence and uncertainty shown beside the 3D scene. Its suggested time and geography navigation (Ancient Earth) is not built yet. |
| [Content-first alternatives](research/content-first-alternatives.md) | Followed its own superseding note: the representative 3D scene comes first, and Astro, Pagefind, Leaflet and a CMS are not used. Following its hosting note, the static-site cost estimate is not carried over. The asset payload is measured (about 25 MB) as the input to any future hosting estimate. |

## Stack as implemented

| Research recommendation | Prototype |
|---|---|
| React + TypeScript + Vite | React 19.3, TypeScript 7.0, Vite 8.3 |
| Three.js via React Three Fiber | three 0.187 with R3F 9.8. Fiber 9 pairs with React 19, as the research warned to check. |
| Drei, only what is needed | `useGLTF`, `useAnimations`, `Environment`, `OrbitControls`, `MeshReflectorMaterial`, `Sparkles`, `ContactShadows`, `PerformanceMonitor` |
| Blender | Blender 4.0 in batch mode: `pipeline/blender/build_asset.py` |
| glTF/GLB delivery | GLB with meshopt geometry and WebP textures, via gltf-transform |
| Zustand if needed | One small store for scene, focus, behaviour and panel (`src/state.ts`) |
| Object storage + CDN | **Not done.** Assets are served from `public/assets` by the static build. |
| No backend initially | No backend |

Post-processing (`@react-three/postprocessing`): N8AO ambient occlusion, bloom, AgX tone mapping and vignette.

## Running it

```bash
npm install
npm run dev               # http://localhost:5173
npm run build             # type-check + static build in dist/
```

The built assets are checked in under `public/assets` and `src/data/generated`. To regenerate them, Blender must be on `PATH` (or set `BLENDER`):

```bash
npm run assets:fetch      # download sources into .cache/sources (checksums verified)
npm run assets:build      # Blender + gltf-transform -> public/assets, src/data/generated/assets.json
npm run data:pbdb         # refresh src/data/generated/pbdb.json from the PBDB API
npm run build && npm run verify:screens   # headless Chrome screenshots -> .cache/screens
```

## Asset pipeline

`pipeline/sources.json` is the provenance manifest. For every third-party file it records the source, creator, licence, checksum, intended use, modifications and the state of the rights review.

The Blender step (`pipeline/blender/build_asset.py`) does the following:

1. **Normalises the models.** Real-world scale (T. rex 12 m, Triceratops 8.5 m), +Z forward for three.js, feet on y = 0, and the pivot at the hips.
2. **Converts materials.** Spec-gloss sources become metallic-roughness, which the Blender 4.0 exporter otherwise drops silently. Emission maps that made the animals glow are removed.
3. **Keeps the source walk loops** and fills the channels the source never animates with their imported node defaults. Without that, three.js snaps those bones back to the bind pose and the body folds.
4. **Locks the walk to the ground.** Both source walks are in place but not foot-locked: the lowest vertex drifts about ±0.35 m per cycle, which makes the animals sink and float. A per-frame vertical correction of the root keeps the stance foot on the ground.
5. **Measures walk speed** from the stance foot's backward travel. The app moves each animal along its path at that speed times the playback rate, so the feet do not slide.
6. **Authors extra clips procedurally.** Rotations are applied about world axes (pitch, yaw, roll) and converted to bone-local rotations. The clips are T. rex *Idle* and *Roar*, and Triceratops *Graze* and *Alert*.
7. **Decimates the heavy props and the fossil scan.** The scan goes from 400k to 120k triangles.

### Models

| Model | Triangles | Download | Clips |
|---|---|---|---|
| *T. rex* | 10.9k | 0.57 MB | Walk (source, 1.17 s), Idle 8 s, Roar 4 s |
| *Triceratops* | 10.4k | 0.33 MB | Walk (source, 3.25 s), Graze 8 s, Alert 4 s |
| Fossil mount scan | 120k | 4.9 MB | n/a |

The whole `public/assets` folder is about 25 MB; the two 2k HDRIs are almost half of it.

### Choosing the models

The two dinosaur models were chosen from about 760 openly licensed dinosaur entries in Objaverse's Sketchfab metadata. Two rights checks shaped the choice:

- **Rejected:** a popular animated *T. rex* (five clips). The same mesh appears in about 20 uploads by different users, the earliest in 2019. That suggests a redistributed third-party asset, so its CC BY claims cannot be trusted.
- **Rejected:** several high-ranked models that are rips from Jurassic World or other games.

## Environment

**Terrain** (`src/world/terrain.ts`) is procedural and deterministic, so terrain, paths and vegetation placement agree:
- A floodplain cut by a meandering river channel, rising to uplands at the edge.
- The grid is about 0.6 m apart near the centre and widens towards the 1.6 km edge.
- Forest-floor texture blends to wet mud along the river margin.

**Flora** uses modern stand-ins for the Hell Creek vegetation:
- Bald cypress for the taxodiaceous conifers.
- Two fern species as ground cover.
- **No grass**, because grasslands did not yet exist.
- Ferns and trees sway in the wind through a vertex-shader patch.

**Lighting:**
- Each outdoor scene is lit by a CC0 Poly Haven sky HDRI plus a shadow-casting sun.
- The sun's azimuth was measured from each HDRI's brightest pixel. Morning: azimuth ≈ 74° from +X towards +Z, elevation 7.5°. Dusk: ≈ 38°, elevation 2°.
- The light's elevation is raised to about 25° (morning) and 15° (dusk). At the true elevation the direct light on flat ground was too weak to produce readable shadows.
- Image-based light is kept low because the HDRI already contains the sun, which otherwise fills in every shadow.
- Fog colour is matched to each sky's horizon, so distant terrain fades into the sky.

## Data

`pipeline/fetch-pbdb.mjs` summarises PBDB taxon and occurrence data (CC BY 4.0) into `src/data/generated/pbdb.json`. The panel follows the research invariants:

- **Interval bounds, not an extinction date.** Ages are shown as the bounds of geological intervals. For both species, PBDB's first-appearance bound reaches into the Campanian because of 1–2 Late Campanian occurrences, while most records are Late Maastrichtian. The panel says so.
- **Qualifiers are counted.** Occurrences with qualifiers such as "cf." are counted and shown, not merged silently: 16 of 70 for *T. rex*, 19 of 41 for *Triceratops*.
- **Coordinates kept separate.** Modern collection coordinates and GPlates palaeocoordinates are stored separately. Regions are labelled as collection sites, not a range map.
- **Reconstructions are labelled.** Each one is marked "not a fossil scan" and carries draft notes on what is speculative: colouration, lips, herd staging, and the source of the walk speed.

## Verification performed

- Type-check and production build pass.
- Headless Chrome (SwiftShader software WebGL) loads all three scenes with no page errors. The only console message is a deprecation warning from R3F's internals (`THREE.Clock`).
- The interaction run (focus switch, roar, credits panel) produced no errors.
- Render cost, measured with `renderer.info` over whole animation frames, all passes included:

  | Scene | Triangles / frame | Draw calls / frame |
  |---|---|---|
  | Morning | 3.6 M | 379 |
  | Dusk | 3.3 M | 405 |
  | Fossil | 0.84 M | 83 |

  Vegetation is instanced in 60 m spatial chunks so off-screen chunks are culled in every pass. Before chunking, the outdoor scenes drew several times more triangles.
- Each Blender clip was rendered and inspected frame by frame. Walk clips stay on the ground (lowest point within 1 cm of the ground at every frame).

## Not done, and limitations

- **Frame rate on real hardware has not been measured.** The build VM has only a Hyper-V virtual display (`hyperv_drm`), and Chrome gets only software WebGL (SwiftShader, llvmpipe). Rendering was verified in software only. The scene is heavy for integrated GPUs: about 3.3–3.6 M triangles and 380–405 draw calls per frame, including shadow, water-reflection and AO passes. `PerformanceMonitor` lowers the resolution if frame rate drops, and on sustained drops switches to a **low-quality tier**, which can also be forced with `?quality=low`. That tier keeps half the ferns, removes the far forest, replaces the planar water reflection with sky-only reflection, removes AO and MSAA, and uses a 2k shadow map. It measured 1.6 M / 1.3 M triangles and 153 / 137 draw calls per frame (morning / dusk), with half the render passes, and still looks the same apart from detail density (`npm run verify:screens` with `QUALITY=low`). There are no LODs or impostors yet. Mobile has not been tested.
- **Rights.** All CC BY models are uploader-asserted and unverified (see the `rightsReview` fields). The Smithsonian original record could not be fetched during research. A rights review is required before publishing. Attribution is shown in the app's credits panel.
- **Scientific review.** None has happened. The reconstruction notes are editorial drafts. Model proportions were not checked against specimens. Plants are modern stand-ins.
- **Fossil scan scale.** The scan is shown at the scale its source file provides; the units are assumed to be metres.
- **Not built:** CDN or object-storage hosting, accounts, timeline navigation, and audio (no licensed audio was sourced).
- **Source data is not committed.** `.cache/` holds the downloaded sources and is git-ignored. The built assets in `public/assets` are about 25 MB of binaries; consider Git LFS or object storage before the catalogue grows.
