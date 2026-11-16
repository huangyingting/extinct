# Public reference experiences

Research date: **2026-11-16**.

These references support the clarified **3D application** direction. None was established to implement every desired feature, and no site's implementation stack was inferred from its appearance.

## 1. 3D Dinopedia: closest product reference

- Website: <https://dinopedia.online/en>
- Animal browser: <https://dinopedia.online/en/game/dinos>

The official site presents a virtual encyclopedia of prehistoric life, including animals, plants, geological periods, and biomes. Its animal browser exposes grouping by period, diet, biome, country, and continent. The site advertises 3D models and includes account/login interfaces.

**Study:** species discovery, model-centered presentation, connections between organisms and environments, timeline/taxonomy navigation, and how educational information accompanies an organism.

**Limitations:** the accessible HTML and product descriptions were inspected, not a complete interactive 3D session. Some functionality may require an account; free access to every model or feature was not verified. Product catalogue counts are intentionally omitted because they change. Scientific claims within individual articles were not audited.

## 2. Ancient Earth: time-driven 3D geography

- Website: <https://dinosaurpictures.org/ancient-earth>

Ancient Earth is an interactive globe for exploring Earth's changing geography. Its official page credits Ian Webster, PALEOMAP/Christopher Scotese, paleocoastline data, plate reconstructions, and GPlates.

The page distinguishes younger elevation-based reconstructions from rougher approximations for much older eras, and notes that some visual elements are not adjusted for time.

**Study:** geological time selection, navigation around a 3D globe, connecting a present-day place to ancient geography, visible scientific attribution, and disclosure of reconstruction uncertainty.

**Boundary:** this is a globe/geography reference, not a 3D animal viewer or walkable ecosystem. Selecting time in the proposed application must not imply more geographic precision than the reconstruction supports.

## 3. Smithsonian 3D: scientific specimen presentation

- Collection: <https://3d.si.edu/>
- Example indexed mammoth record: <https://3d.si.edu/object/3d/mammuthus-primigenius-blumbach:341c96cd-f967-4540-8ed1-d3fc56d31f12>
- Official supporting description: <https://www.nps.gov/articles/3dfossilmodels.htm>

The National Park Service documents its collaboration with the Smithsonian to publish interactive fossil models made through digital photogrammetry. The description includes extinct vertebrates and fossil plants, including a fossil pine cone.

**Study:** inspectable scientific specimens, association with collection records, provenance, and the distinction between digitized evidence and a reconstruction of a living organism.

**Limitations:** Smithsonian pages returned HTTP 403 to automated retrieval. The characterization is supported by the accessible official NPS description and indexed Smithsonian record, not a successful live viewer test. Specific download rights must be checked per asset.

## 4. Digital Atlas of Ancient Life: fossils with educational context

- Virtual collection: <https://www.digitalatlasofancientlife.org/vc/>

The Paleontological Research Institution's indexed official page describes photogrammetric fossil models, topically arranged virtual collections, and Sketchfab-hosted interactive viewing. It states that its virtual-collection models use CC0.

**Study:** combining 3D fossil inspection with explanations, grouping specimens by taxonomy, and providing an educational route into scientific collections.

**Limitations:** direct automated retrieval returned HTTP 403; findings rely on indexed official page text. Check the exact model and current license before reuse rather than generalizing the collection statement to every linked asset.

## Synthesis for Extinct

Proposed direction: **Dinopedia's organism exploration + Ancient Earth's geological navigation + Smithsonian's scientific grounding**, with Digital Atlas as a reference for educational specimen context.

Possible interaction flow, not an existing implemented feature:

1. Choose a geological period or environment.
2. Discover relevant extinct plants and animals.
3. Inspect a reconstructed organism or an original fossil scan, clearly labeled.
4. View evidence, uncertainty, and credits alongside the 3D scene.
5. Move between organisms, environments, and time without losing context.

These examples are design references, not authorization to copy their assets, interface artwork, text, or code.

## Verification summary

| Reference | Evidence checked | Full interactive session tested? |
|---|---|---|
| Dinopedia | Official homepage and animal-browser HTML | No |
| Ancient Earth | Official page, methods, and attribution text | No |
| Smithsonian 3D | Indexed specimen page and accessible official NPS description; direct viewer blocked | No |
| Digital Atlas | Indexed official virtual-collection description; direct page blocked | No |

No underlying technology stack, mobile performance, account entitlement, or complete accessibility assessment was verified for these products.
