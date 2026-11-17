# Prototype: Hell Creek in 3D

Built **2026-11-16**; scenes, environment and motion reworked **2026-11-17**. A minimal, runnable implementation of the stack recommended in [3D technology stack](research/3d-technology-stack.md). It shows two reconstructed dinosaurs in realistic scenes, and applies the provenance and uncertainty rules in [scientific data and licensing](research/scientific-data-and-licensing.md).

## What it is

Seven scenes in time order, set in the **Hell Creek Formation** and the underlying **Fox Hills Formation** at the end of the Cretaceous. *Tyrannosaurus rex* and *Triceratops horridus* are the two dinosaurs with the most occurrences in Hell Creek in PBDB. Four non-dinosaur reptiles share the scenes: an azhdarchid pterosaur, a mosasaur, *Champsosaurus* and an alligatoroid. Each one is labelled with the group it belongs to.

| Timeline | Scene | Content |
|---|---|---|
| Maastrichtian, c. 68 Ma | Seaway coast | The shore of the Western Interior Seaway (Fox Hills Formation). Two mosasaurs cruise offshore and azhdarchid pterosaurs soar over the beach. No dinosaurs. |
| Late Cretaceous, c. 66.1 Ma | Floodplain, morning | Three *Triceratops* walk and feed on a fern-covered floodplain by the river. A *T. rex* is on the far bank. |
| | Floodplain forest, midday | A *T. rex* walks through a closed broadleaf and conifer stand. A *Triceratops* at the forest edge goes on alert when it comes near. |
| | River margin, dusk | A *T. rex* patrols the channel bank. Two *Triceratops* are on the far side. |
| K–Pg boundary, 66.0 Ma | The impact, minutes after | Ejecta from Chicxulub re-entering as glowing streaks from the south-south-east, glass spherules falling, and the river surging over its banks (after the Tanis surge deposit). |
| Earliest Paleocene | After the impact | No non-avian dinosaurs. Dead standing trees, fallen timber, a dim sky, a pale boundary-clay layer and a ground cover of ferns (the "fern spike"). |
| Today | Fossil evidence | The Smithsonian's CC0 photogrammetry of its mounted *T. rex* over a *Triceratops*, in a dark gallery. This is the scanned evidence that the reconstructions are inferred from. |

Each scene has **scene notes**: the claims it rests on, each labelled *fossil evidence*, *inferred*, *debated* or *staging choice*, with DOI references. All 12 DOIs were resolved against doi.org or Crossref when they were added. Debated points are labelled as debated. These include the Tanis interpretation, how hot the sky became, and impact-triggered fires.

Interaction:
- Pick a scene on the timeline, or open one directly with `?scene=morning|forest|dusk|impact|aftermath|fossil`.
- Orbit and zoom the camera.
- Switch focus species; the camera follows the focused animal.
- Override behaviour: *Natural*, *Walk* or *Stay*.
- Trigger the one-shot clip: *Roar* (T. rex) or *Look up* (Triceratops).
- Open the scene notes, the species panel (PBDB fossil-record summary and reconstruction notes) or the sources and credits panel.

This follows the research synthesis ([reference experiences](research/reference-experiences.md)): species in their environment, as in Dinopedia, with a scan kept clearly distinct from the reconstructions, as in Smithsonian 3D and Digital Atlas.

## How each research document was applied

| Document | Applied in the prototype |
|---|---|
| [3D technology stack](research/3d-technology-stack.md) | The recommended stack (table below) and the Blender → glTF/GLB pipeline, run through its seven steps: source, rights, scan vs reconstruction, prepare in Blender, export and review, optimise and attach provenance, evaluate. Its performance priorities shaped the build: compressed geometry and textures, instancing of repeated vegetation, and render cost measured on a representative scene (see verification). Its open decisions were resolved as: inspectable animals in a habitat rather than a walkable world, photorealistic direction, skeletal animation, and prehistoric life. |
| [Scientific data and licensing](research/scientific-data-and-licensing.md) | PBDB used under CC BY 4.0, with attribution and retrieval date. IUCN deliberately not used, since it does not cover prehistoric taxa and has permission constraints. Rights recorded per asset in `pipeline/sources.json`, with no assumption that public availability means a licence. Separate claims kept separate: interval bounds vs extinction date, modern vs palaeocoordinates, qualified identifications counted. Scan vs reconstruction labelled. Editorial status "draft". |
| [Reference experiences](research/reference-experiences.md) | Dinopedia-style species-in-environment presentation, Smithsonian 3D's scanned specimen used directly (CC0), and evidence and uncertainty shown beside the 3D scene. Its suggested time navigation (Ancient Earth) exists in a simple form: a timeline of scenes from the late Cretaceous through the impact to the earliest Paleocene. Geography navigation is not built. |
| [Content-first alternatives](research/content-first-alternatives.md) | Followed its own superseding note: the representative 3D scene comes first, and Astro, Pagefind, Leaflet and a CMS are not used. Following its hosting note, the static-site cost estimate is not carried over. The asset payload is measured (about 42 MB after the 2026-11-17 rework; each scene loads only its own sky) as the input to any future hosting estimate. |

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

Post-processing (`@react-three/postprocessing`): N8AO ambient occlusion, a colour grade (contrast and saturation), bloom, Khronos PBR Neutral tone mapping and a light vignette.

## Running it

```bash
npm install
npm run dev               # http://localhost:5173
npm run build             # type-check + static build in dist/
```

The built assets are checked in under `public/assets` and `src/data/generated`. To regenerate them, Blender must be on `PATH` (or set `BLENDER`):

```bash
npm run assets:fetch      # download sources into .cache/sources (checksums verified)
npm run assets:fetch -- jacaranda_tree   # or fetch only the listed source ids
npm run assets:build      # Blender + gltf-transform -> public/assets, src/data/generated/assets.json
npm run assets:build:polyhaven            # only the Poly Haven models, textures and skies (no Blender needed)
npm run data:pbdb         # refresh src/data/generated/pbdb.json from the PBDB API
npm run build && npm run verify:screens   # headless Chrome screenshots of all six scenes -> .cache/screens
npm run measure:fps       # frame times and triangles/draw calls per scene and quality tier
npm run verify:motion     # planted-foot slip, tail clearance and NaN check (fails on regression)
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

### Poly Haven models without Blender

`pipeline/build-polyhaven.mjs` builds the Poly Haven (CC0) models that have a `build` spec in `sources.json`, using gltf-transform and meshoptimizer only. It runs after `build-assets.mjs` in `npm run assets:build`. For each model it:

1. Keeps one variant from multi-variant source files (`pick`).
2. **Thins leaf cards.** It keeps a random subset of whole cards (connected components) and enlarges each one about its centre, so the canopy keeps its silhouette. Regular simplification collapses cards.
3. Simplifies the wood. It uses topology-ignoring ("sloppy") simplification for twigs and roots made of many small pieces.
4. Puts the base on y = 0, centres the trunk and scales to a target height.
5. Compresses with meshopt geometry and WebP textures.

The jacaranda tree goes from 3.9 M source triangles to 56k (near) and 14k (`_far` variant).

### Models

| Model | Triangles | Download | Clips |
|---|---|---|---|
| *T. rex* | 10.9k | 0.57 MB | Walk (source, 1.17 s), Idle 8 s, Roar 4 s |
| *Triceratops* | 10.4k | 0.33 MB | Walk (source, 3.25 s), Graze 8 s, Alert 4 s |
| Fossil mount scan | 120k | 4.9 MB | n/a |
| Jacaranda tree (near / far) | 56k / 14k | 2.1 / 0.9 MB | n/a |
| Azhdarchid pterosaur | 24k | 0.37 MB | Flap 0.96 s (one stroke from the source), Glide (held frame) |
| Mosasaur (Tylosaurus sculpt) | 24k | 0.89 MB | Swim 2 s, Idle 6 s (authored) |
| *Champsosaurus* | 14k | 0.25 MB | Swim 2 s, Idle 6 s (authored) |
| Alligatoroid (modern alligator) | 12k | 0.21 MB | Swim 2 s, Idle 6 s (authored) |

The whole `public/assets` folder is about 44 MB. The six HDRIs (25 MB) are the largest part, but each scene loads only its own sky.

### Choosing the models

The two dinosaur models were chosen from about 760 openly licensed dinosaur entries in Objaverse's Sketchfab metadata. Two rights checks shaped the choice:

- **Rejected:** a popular animated *T. rex* (five clips). The same mesh appears in about 20 uploads by different users, the earliest in 2019. That suggests a redistributed third-party asset, so its CC BY claims cannot be trusted.
- **Rejected:** several high-ranked models that are rips from Jurassic World or other games.

## Environment

**Terrain** (`src/world/terrain.ts`) is procedural and deterministic, so terrain, paths and vegetation placement agree:
- A floodplain cut by a meandering river channel, rising to uplands at the edge.
- The grid is about 0.6 m apart near the centre and widens towards the 1.6 km edge.
- The ground material blends moss and leaf litter, bare-soil patches and dark wet mud along the banks. Mud is smoother and glossier. Each layer is sampled at two scales to hide tiling. The post-impact scene adds a pale clay layer.

**Flora** (`src/scene/Vegetation.tsx`) uses modern stand-ins, scattered per habitat (floodplain, forest, aftermath):
- Bald cypress for the taxodiaceous conifers. Its Spanish moss mesh is removed: Spanish moss is a bromeliad, and bromeliads appear long after the Cretaceous.
- Jacaranda (near and far detail levels), a broadleaf sapling and a shrub as stand-ins for the angiosperm trees and undergrowth, which dominate the Hell Creek leaf flora.
- Ferns as ground cover. Most of the cover is a **procedural fern carpet** (`src/three/fernClump.ts`): clumps of arched frond cards, 30–48 triangles each, in three shapes with darker crowns. They use the fern model's frond texture.
- Driftwood and eroded root masses along the channel, fallen logs and stumps.
- **No grass**, because grasslands did not yet exist, and **no boulders**, because the floodplain was built of river sand and mud. The earlier rock and boulder props were removed.
- After the impact: leafless trees, more fallen timber, and denser ferns.
- Per-instance colour variation, wind sway, and per-chunk distance culling for small plants.

**Water** is a dull, silty brown-green with a planar reflection. In the impact scene it surges over the banks twice per 75-second cycle. This is a time-compressed seiche, after the surge deposit described at Tanis.

**Impact effects** (`src/scene/ImpactSky.tsx`):
- About 400 instanced streaks re-entering at shallow angles from bearing 156°, the direction of Chicxulub from the Hell Creek area. The world's compass is set so the late-afternoon sun sits in the west-south-west.
- A fall of glass spherules around the camera, a few still glowing.

**Distant trees are impostors** (`src/three/impostor.ts`). Each tree model is rendered once, side-on, into a 512² texture when the scene loads. Copies are then drawn as instanced quads that turn about the vertical axis to face the camera, mirrored at random, with brightness variation and scene fog. They cover trees beyond about 220 m in every habitat and the outer forest (beyond 100 m from its centre). The low-quality tier used to drop the horizon trees altogether; it now keeps them.

**Birds** (`src/scene/Birds.tsx`). Small flocks circle, glide and flap in every scene except the impact. They are generic dark silhouettes of about 0.9 m wingspan: Hell Creek birds, enantiornithines and early relatives of modern birds, are known mostly from fragments. After the impact, the few birds stand for the dinosaur lineage that survived.

**Sound** (`src/audio/`), off by default. It is synthesised with the Web Audio API, so there are no audio files or licences:
- Gusting wind, and a river that gets louder near the water and surges with the seiche.
- Katydid-like stridulation chirps. Orthopteran stridulation is known from Jurassic fossils.
- In the impact scene, a low rumble with distant booms.
- No dinosaur calls, because their voices are unknown.
- Levels were checked headlessly with an analyser node (RMS −17 to −31 dB per scene), not by ear.

**Tour and transitions.**
- *Tour* slowly orbits the camera, switches the followed species every 18 s, and moves to the next scene every 45 s. Dragging the view ends it.
- Each scene fades in from black.

**Lighting:**
- Each outdoor scene is lit by a CC0 Poly Haven sky HDRI plus a shadow-casting sun.
- The sun direction comes from each HDRI's brightest pixel, using three.js's equirectangular mapping. The method reproduces the original morning and dusk azimuths (74°, 38°).
  - Forest: elevation 48°.
  - Impact: elevation 19°, raised to about 24°.
  - Aftermath: the diffuse brightest region of an overcast sky.
- Morning and dusk keep their raised elevations of about 25° and 15°.
- Image-based light is kept low because the HDRI already contains the sun, which otherwise fills in every shadow.
- Fog colour is matched to each sky's horizon.
- A colour grade before tone mapping: by default a little contrast and saturation; per scene it warms the impact and desaturates the aftermath.
- **Why the scenes looked grey, and the fix (2026-11-17).** Several things stacked up: AgX tone mapping, which compresses highlights and saturation; exponential fog of 0.0024–0.0048 tinted with the grey horizon of hazy skies; low image-based light (0.3); exposure below 1; and a heavy vignette. Compared side by side on one frame, Khronos PBR Neutral kept the blue sky and warm clouds that AgX washed out, and ACES was contrasty but still greyed the sky. The app now uses Neutral, a slight contrast and saturation lift, about 30% less fog with a bluer aerial-perspective tint in the clear scenes, slightly more sky light, and a lighter vignette. `?tm=agx|aces|neutral` switches for comparison.

## Motion

Animals no longer run fixed walk/stop timers along a rigid curve. `src/scene/Dinosaur.tsx` is a small locomotion controller with procedural bone layers applied after the animation mixer.

**Locomotion:**
- **Steering.** Pure-pursuit path following. The turn rate is limited by a minimum turning radius (7 m *T. rex*, 4.5 m *Triceratops*), so animals cannot pivot on the spot. They slow in tight bends and keep their distance from an animal ahead.
- **Speed.** Speed eases in and out over about 2 s. The walk clip's playback rate follows the actual ground speed, so the planted foot stays still.
- **Cruising speeds.** About 1.5 m/s for *T. rex*, near the published preferred walking speed of about 1.3 m/s (van Bijlert et al. 2021). About 1 m/s for *Triceratops*, which is an assumption.
- **Ground fit.** The body is fitted to the ground from samples under the front and hind feet (pitch) and both sides (roll), with a slight lean into turns.
- **Behaviour.** Travel and pause durations are randomised per individual. Occasional one-shot actions. Animals look at each other, at points of interest and sometimes at the viewer. A *Triceratops* goes on alert when a *T. rex* comes within 60 m.

**Procedural layers:**
- Spine and neck bend into turns.
- Head look-at, sprung and split across neck and head, anticipating turns.
- Spring-driven tails that trail through turns and sway with the stride.
- Breathing.
- The mouth closes while walking; the source walk clips leave it hanging open.

**Triceratops tail and legs:**
- **Tail lifted.** In the source walk the tail tip drops to 0.0–0.7 m and scrapes the ground. It is now held at 0.65–1.3 m. Dinosaur trackways rarely show tail drags.
- **Procedural legs** (`src/scene/legGait.ts`). Sampling the source walk deterministically showed that each foot is planted for only 8–16% of the cycle, and that the front feet sweep back 1.8–2.2 m/s against 0.5–0.9 m/s for the hind feet. No single playback rate could keep all four feet still.
  - While walking, the legs follow a lateral-sequence walk (LH, LF, RH, RF; duty factor 0.65).
  - Planted feet stay fixed in world space. Swinging feet arc to a landing point on the terrain that is re-aimed during the swing.
  - Each leg is solved with two-bone IK that keeps the clip's knee and elbow bend plane. The foot keeps its rest orientation.
  - The IK pose is blended over the clip by the walk weight, so grazing and alert poses are unchanged.

`?noproc` turns the procedural layers off to compare against the raw clips. `?debug` exposes the renderer (`window.__three`) and each animal's mixer and state (`window.__dinos`) for headless measurement.

**T. rex legs, turning and pauses (2026-11-17, second pass):**
- *T. rex* now uses the same planted-foot system with two legs: duty factor 0.6 and about 0.42 steps per second per leg at cruise. That gives a stride of about 3.7 m, close to the ~3.9 m implied by the preferred-speed estimate (1.28 m/s at 0.33 Hz). The source walk clip still supplies body, arm and tail rhythm, with its playback rate synced to the step frequency.
- Both species turn sharp corners mostly on the spot, stepping round. Before, they could only turn while walking forward.
- Legs stay on the planted-foot system whenever the body is moving, including under a one-shot clip. Otherwise the feet slid while an alerted *Triceratops* slowed down.
- The *Triceratops* step frequency was raised from 0.62 to 0.72 steps per second. At 0.62 its front feet fell up to 15 cm out of reach at the end of each stance and dragged.
- During pauses a *Triceratops* alternates grazing with a head-up watch pose (a held frame of the Alert clip) and looks around.

**Legs always on the planted-foot system, with pelvis adjustment (third pass):**
- Blending the legs back to the clip poses whenever an animal stopped, grazed or reacted made its feet shuffle across the ground. The procedural legs now stay on at all times; standing feet stay where they last landed.
- Syncing the walk clip to the step rhythm sped up the *Triceratops* body bob about 2.3×, lifting the hips beyond the legs' reach mid-stance and dragging the planted foot. As in game IK rigs, the body is now lowered just enough each frame that every foot target is reachable (up to 0.4 m).
- `verify:motion` now reads stance directly from the gait system rather than guessing it from the lowest foot. It fails above a 0.05 m/s median or a 0.2 m/s 90th-percentile stance slip. After these fixes every animal in the morning, forest and dusk scenes measures 0 m/s on both.

**Measured foot slip.** Horizontal speed of a planted foot while the body moves, 15 s per scene:

| Animal | Before | After |
|---|---|---|
| *Triceratops* (body ≈ 0.95 m/s) | median 1.17 m/s (feet skating faster than the body) | median 0–0.02 m/s |
| *T. rex* (body ≈ 1.47 m/s) | n/a (previous speeds differed) | median 0.08 m/s with the clip legs; 0 m/s with procedural legs |

`npm run verify:motion` repeats this check in the morning, forest and dusk scenes, reading stance from the gait system. It fails on stance slip above 0.05 m/s (median) or 0.2 m/s (90th percentile), a *Triceratops* tail tip below 0.3 m, NaN transforms or page errors. Its runs caught the alert-deceleration slip, the front-foot reach problem and the hip-lift drag described above.

## Pterosaurs and aquatic reptiles

**Choosing the models.** I searched all 160 Objaverse metadata shards (about 800k Sketchfab entries) for pterosaurs, mosasaurs and plesiosaurs, crocodilians and choristoderes, and hadrosaurs, keeping CC BY, CC BY-SA and CC0 only. Candidates were then checked the same way as the dinosaurs.
- **Rejected as likely redistributions:** a mosasaur and an animated alligator whose meshes match earlier uploads by other users (one of them licensed non-commercial), and a widely re-uploaded "Flying Pterodactyl".
- **Rejected on other grounds:** a crocodile modelled on a company mascot; *Pteranodon*, *Deinosuchus* and *Dallasaurus*, which come from older rocks; and low-quality models.
- **No usable Edmontosaurus,** the commonest Hell Creek dinosaur, was found: the only candidates were low-poly or bones.
- The four chosen models are in `pipeline/sources.json` with checksums and rights notes.

**Reference images.** 3D Dinopedia's species images were used only to compare proportions. They are copyrighted (Digital Pattern studio) and nothing from them is used in the app.

**Blender build** (`pipeline/blender/build_creature.py`; Blender 4.2 LTS):
- **Pterosaur.** The source was split into six 65k-vertex chunks. Decimating each chunk separately tore the mesh apart at the seams, so the chunks are joined and welded first. The source flight clip starts in an upright take-off pose and has irregular strokes. The script measures wing-tip height against the body over the clip, keeps one clean stroke (between successive highs) as *Flap*, and holds the frame with level wings as *Glide*.
- **Swimmers** have no rig. The script:
  1. bakes every transform (Sketchfab exports nested centimetre scales);
  2. finds the body centreline by slicing along the body axis;
  3. builds a 12-bone spine from the shoulders forward to the snout and back to the tail tip;
  4. skins each vertex by its position along the body, blending the two nearest bones (more robust than Blender's heat weighting on these meshes);
  5. authors *Swim*, a travelling wave growing towards the tail (tail-driven for the mosasaur and crocodilian, whole-body for *Champsosaurus*), and a slow floating *Idle*.

**In the app** (`src/scene/Fauna.tsx`):
- Swimmers follow loops in the river or sea, alternating swimming with drifting at the surface, where only the back and eyes show. Swim playback follows speed.
- Pterosaurs soar on wide loops at about 11 m/s, banked by the coordinated-turn angle (tan φ = vω/g). They mostly glide, with short flapping bursts.
- Every animal can be followed: the focus buttons list the dinosaurs and the other animals in the scene. The camera pulls in to suit the animal's size, and an information panel shows its group, what the model is, and its source.

**What is shown where:**
- *Champsosaurus* and the alligatoroid appear in the river scenes and after the impact; both groups survived.
- The pterosaur appears in the pre-impact scenes only, because pterosaurs did not survive.
- Mosasaurs appear only on the seaway coast.

**Facts checked** (DOIs resolved on 2026-11-17):
- *Infernodrakon hastacollis*, a medium-sized Hell Creek azhdarchid known from one neck vertebra (Thomas et al. 2024).
- *Mosasaurus hoffmannii* from the Fox Hills Formation of South Dakota, 68.3–67.6 Ma (Harrell & Martin 2014).
- *Champsosaurus* and *Brachychampsa* in the Hell Creek river fauna (Pearson et al. 2002).
- A recollection of a 2025 "freshwater mosasaur from Hell Creek" paper could not be found and is not used.

**The coast world.**
- `setWorld('coast')` switches the shared height function to a shelving sea floor (to −14 m), a sand beach and a low coastal plain inland.
- The same placement rules keep plants off the beach.
- Water is slightly transparent everywhere (opacity 0.86), so animals just below the surface show through.

## Data

`pipeline/fetch-pbdb.mjs` summarises PBDB taxon and occurrence data (CC BY 4.0) into `src/data/generated/pbdb.json`. The panel follows the research invariants:

- **Interval bounds, not an extinction date.** Ages are shown as the bounds of geological intervals. For both species, PBDB's first-appearance bound reaches into the Campanian because of 1–2 Late Campanian occurrences, while most records are Late Maastrichtian. The panel says so.
- **Qualifiers are counted.** Occurrences with qualifiers such as "cf." are counted and shown, not merged silently: 16 of 70 for *T. rex*, 19 of 41 for *Triceratops*.
- **Coordinates kept separate.** Modern collection coordinates and GPlates palaeocoordinates are stored separately. Regions are labelled as collection sites, not a range map.
- **Reconstructions are labelled.** Each one is marked "not a fossil scan" and carries draft notes on what is speculative: colouration, lips, herd staging, and the source of the walk speed.

## Verification performed

On 2026-11-17 the build VM had an NVIDIA A100, used through headless Chromium with `--use-angle=gl-egl`, so verification ran on real GPU rendering. (`ANGLE=gl-egl CHROME_CHANNEL= npm run verify:screens`.)

- Type-check and production build pass.
- All six scenes load with no page errors. The only console message is R3F's `THREE.Clock` deprecation warning.
- The interaction run (Stay, Roar, Walk, focus switch, Look up, scene notes, credits) produced no errors.
- **A bug fixed during the rework.** The impact streak shader could output NaN, from `pow()` of a slightly negative interpolated value. Bloom smeared the NaN over the whole frame and turned it black. After the fix, 450 sampled frames across the forest, impact and aftermath scenes had no black frames, and no NaN transforms appeared in 600 frames of scene-graph checks.
- **Render cost** at 1920×1080, averaged over 10 animation frames with `renderer.info`, all passes included. The original build was measured the same way on the same machine.

  | Scene | Original build | First rework | With impostors | Draw calls now | Low tier now |
  |---|---|---|---|---|---|
  | Morning | 4.15 M | 4.78 M | 3.97 M | 278 | 1.58 M |
  | Forest | | 5.96 M | 5.00 M | 243 | 2.17 M |
  | Dusk | 3.28 M | 3.26 M | 2.61 M | 237 | 1.21 M |
  | Impact | | 4.63 M | 3.93 M | 272 | 1.44 M |
  | After the impact | | 4.24 M | 4.07 M | 228 | 1.63 M |
  | Fossil | 0.84 M | 0.84 M | 0.84 M | 83 | 0.84 M |

  Draw calls in the morning scene went from 491 to 278.

  On the A100 every scene held a 16.7 ms median frame (vsync-limited 60 fps). That says nothing about integrated GPUs.
- Vegetation is instanced in 60 m spatial chunks so off-screen chunks are culled in every pass. Small plants are also hidden per chunk beyond 55–110 m from the camera.
- Each Blender clip was rendered and inspected frame by frame. Walk clips stay on the ground (lowest point within 1 cm of the ground at every frame).

## Not done, and limitations

- **Frame rate on consumer hardware has not been measured.** Rendering was verified on a data-centre GPU (A100) and earlier in software (SwiftShader); neither predicts integrated-GPU or mobile performance. The scene is heavy for integrated GPUs: about 3.3–3.6 M triangles and 380–405 draw calls per frame, including shadow, water-reflection and AO passes. `PerformanceMonitor` lowers the resolution if frame rate drops, and on sustained drops switches to a **low-quality tier**, which can also be forced with `?quality=low`. That tier keeps half the ferns, removes the far forest, replaces the planar water reflection with sky-only reflection, removes AO and MSAA, and uses a 2k shadow map. It measured 1.6 M / 1.3 M triangles and 153 / 137 draw calls per frame (morning / dusk), with half the render passes, and still looks the same apart from detail density (`npm run verify:screens` with `QUALITY=low`). There are no LODs or impostors yet. Mobile has not been tested.
- **Rights.** All CC BY models are uploader-asserted and unverified (see the `rightsReview` fields). The Smithsonian original record could not be fetched during research. A rights review is required before publishing. Attribution is shown in the app's credits panel.
- **Scientific review.** None has happened. The reconstruction and scene notes are editorial drafts. Model proportions were not checked against specimens. Plants are modern stand-ins (jacaranda, for example, is a modern tree, used only for its broadleaf form). The impact scene's streak density, surge timing and sky colour are illustrative.
- **Motion.** Both leg gaits are procedural and generic, with no trackway-specific footfall data. The swing feet follow a simple arc and the toes do not flex. The hip and shoulder motion still comes from the source clips and is not phase-locked to the footfalls.
- **Sound** was verified numerically, not listened to, and is a sketch rather than a field recording. **Impostors** are single-view billboards, so they look identical from every angle, which is acceptable only at a distance.
- **Fossil scan scale.** The scan is shown at the scale its source file provides; the units are assumed to be metres.
- **Not built:** CDN or object-storage hosting, accounts, a continuous timeline (scenes are discrete points in time, joined by fades), surviving mammals, crocodilians and turtles in the post-impact scene (only birds are shown), other Hell Creek dinosaurs (licensed models needed), and recorded audio.
- **Source data is not committed.** `.cache/` holds the downloaded sources and is git-ignored. The built assets in `public/assets` are about 42 MB of binaries; consider Git LFS or object storage before the catalogue grows.
