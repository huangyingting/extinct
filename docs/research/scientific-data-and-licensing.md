# Scientific data, provenance, and licensing

Research date: **2026-11-16**.

These findings apply to both the initial atlas idea and the clarified 3D application. They are research guidance, not legal advice or permission to republish a dataset.

## Source selection

| Source | Appropriate use | Important limits |
|---|---|---|
| GBIF | Historical occurrence/specimen records and source-specific taxonomy | Not a complete extinction catalogue; locations and dates need interpretation; dataset and media rights differ |
| Paleobiology Database (PBDB) | Fossil occurrences, ages, intervals, taxonomy, and references | Fossil collection coordinates and reconstructed paleocoordinates are different; fossil age is not an exact extinction date |
| IUCN Red List | Relevant conservation assessments and links, subject to permission | API access is not redistribution permission; commercial and reuse restrictions require review |
| Wikimedia Commons | Individually licensed images and illustrations | Review each file's rights and attribution; metadata is not a rights warranty |

## GBIF

GBIF's occurrence API and asynchronous bulk downloads support taxonomic and geographic selection. Bulk downloads require an account and receive a DOI, useful for reproducibility and attribution. Record the checklist used for taxonomic matching instead of assuming a default is the desired authority.[^gbif-downloads]

Occurrence data can carry CC0, CC BY, or CC BY-NC terms. Check the actual record/dataset license and attribution requirements; exclude incompatible data for the intended commercial or noncommercial use.[^gbif-terms]

Coordinates can be missing, uncertain, generalized, or erroneous. Preserve coordinate uncertainty and quality flags. A recorded specimen/observation locality is not automatically an organism's complete range, last population, or extinction location.[^gbif-quality]

Attached photographs and other multimedia can have different licenses from the occurrence record, or incomplete rights metadata. Clear them separately.[^gbif-media]

## Paleobiology Database

PBDB's v1.2 API exposes occurrences, collections, taxonomic opinions, identification qualifiers, and references. Occurrence queries include geological intervals, age bounds, and paleolocation options.[^pbdb-api]

Keep separate:

- Modern fossil collection coordinates.
- Model-dependent reconstructed paleocoordinates.
- The geological age used for a reconstruction.
- The reconstruction model and early/mid/late age selection where relevant.

The youngest known fossil is not automatically the true extinction time. Preserve age ranges, uncertainty, and references rather than inventing a precise extinction date.

PBDB Navigator states that PBDB data are released under CC BY 4.0. Attribute the database and retain underlying references. That statement does not independently grant rights to reproduce linked papers, figures, or photographs.[^pbdb-license]

A modern map is not a paleomap. Ancient geography needs age-specific reconstruction data and a documented model; GPlates is a relevant reference for reconstruction concepts.[^gplates]

## IUCN: permission-sensitive source

Research found that the API requires an account/key and prohibits commercial API use. The Red List terms impose additional restrictions on data use and redistribution; access credentials do not override those terms.[^iucn]

**Important qualification:** direct retrieval of the IUCN API, terms, and taxonomy guidance returned HTTP 403. Some statements were checked through indexed official excerpts; the API prohibition was corroborated through the IUCN-supported client. Indexed excerpts do not settle the legal treatment of a particular transformed display.

Research also found an assessment-scope exclusion for taxa known to have gone extinct before 1500 AD. Treat this as a reported limitation requiring fresh confirmation, not evidence that IUCN is a prehistoric catalogue.[^iucn-taxonomy]

**Conservative initial approach:** link to IUCN pages without copying its assessments, statuses, or images until intended use is clarified. Obtain current written permission or clarification where required, especially for commercial use. Linking is a practical risk-reduction recommendation, not a legal guarantee.

## Wikimedia Commons and other media

Check licenses at the individual file level. Record creator, source page, license name and URL, required attribution, and modifications. Meet applicable share-alike terms.[^commons]

The MediaWiki `imageinfo` API can assist metadata retrieval, but missing or incorrect metadata remains possible. Verify the file description and rights before publication.[^imageinfo]

The same principle applies to 3D models: public viewing, download availability, and scientific value are not substitutes for a license. Do not assume a website's code license covers its models, textures, audio, or scientific content.

## Proposed data model

| Area | Suggested fields |
|---|---|
| Identity | Stable internal ID; scientific/common names; rank; synonyms; source-specific taxon IDs |
| Classification | Kingdom/group; accepted-name authority; disputed or unresolved matches |
| Extinction | Status; global/regional scope; authority; assessment date; uncertainty |
| Time | Last observation; estimated extinction interval; fossil age bounds; units |
| Geography | Locality; modern coordinates; uncertainty; optional paleocoordinates/model/age |
| Provenance | Claim and source URL; source record ID; retrieval date; source version/query; download DOI; reference; license |
| Assets | Model/image/audio source; creator; rights; attribution; modifications; scale; reconstruction versus scan |
| Publishing | Draft/review/published state; reviewer; unresolved scientific questions |

This is a proposed application schema, not a claim that every external source supplies all fields.

## Scientific invariants

- Global extinction, extinction in the wild, regional extinction, and possible extinction must remain distinct, with scope and authority.[^iucn-faq]
- A last observation, estimated extinction interval, and fossil age interval are separate claims.
- Preserve competing taxonomic opinions and identification qualifiers; do not merge sources solely on a name match.
- Do not present historical occurrence points as complete ranges.
- Distinguish an original fossil scan from an artistic or scientific reconstruction.
- A reconstructed living organism's colors, soft tissues, behavior, and habitat may contain inference; retain evidence and qualifications.
- Structural schema validation does not establish scientific truth.

The first four principles follow from the source semantics above. Reconstruction labeling and review are proposed editorial requirements, not verified claims about any particular model.

## Recommended import and review approach

Start with a small curated catalogue. Preserve source-specific identifiers, retrieval information, licenses, and claims. Review uncertain matches and contradictory evidence instead of silently overwriting one source with another. Publish only approved records and assets.

Do not expose API secrets in the browser. Account-specific imports and privileged writes belong in an appropriate server-side or controlled import workflow, if introduced.

## Sources

[^gbif-downloads]: GBIF, [API downloads](https://techdocs.gbif.org/en/data-use/api-downloads) and [citation guidelines](https://www.gbif.org/citation-guidelines).
[^gbif-terms]: GBIF, [terms](https://www.gbif.org/terms) and [occurrence license processing](https://data-blog.gbif.org/post/gbif-occurrence-license-processing/).
[^gbif-quality]: GBIF, [occurrence issues and flags](https://techdocs.gbif.org/en/data-use/occurrence-issues-and-flags).
[^gbif-media]: GBIF, [multimedia guidance](https://data-blog.gbif.org/post/gbif-multimedia/).
[^pbdb-api]: PBDB, [v1.2 API](https://paleobiodb.org/data1.2/) and [occurrence query documentation](https://paleobiodb.org/data1.2/occs/list).
[^pbdb-license]: PBDB, [Navigator and database license notice](https://paleobiodb.org/navigator/).
[^gplates]: GPlates, [reconstructions documentation](https://www.gplates.org/docs/user-manual/Reconstructions/).
[^iucn]: IUCN, [API](https://api.iucnredlist.org/), [v4 documentation](https://api.iucnredlist.org/api-docs/index.html), [terms](https://www.iucnredlist.org/terms), and [IUCN-supported client guidance](https://github.com/IUCN-UK/iucnredlist/blob/main/README.md#api-usage). See access limitations above; the client URL is mutable.
[^iucn-taxonomy]: IUCN, [taxonomic sources](https://www.iucnredlist.org/resources/tax-sources) and the [guidelines route encountered during research](https://www.iucnredlist.org/resources/guidelines/tax-sources). Direct access was blocked.
[^iucn-faq]: IUCN, [frequently asked questions](https://www.iucnredlist.org/about/faqs).
[^commons]: Wikimedia Commons, [reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia); Wikimedia, [licensing guidance](https://attribution.wikimedia.org/attribution-signals/license.html).
[^imageinfo]: MediaWiki, [Imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo).
