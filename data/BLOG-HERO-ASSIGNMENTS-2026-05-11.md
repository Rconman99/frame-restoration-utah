# Blog Hero Photo Assignments — SLV Premium Round 1
**Created:** 2026-05-11
**Source:** Landon's "Pics for Website" Google Drive folder (`1qo-NobzWJ8ux6NhA1l09EvV4BlxeeTbM`)
**Pulled via:** iframe-download from logged-in Drive session, 14 JPGs total

All hero photos converted to webp 1600×900 (16:9 landscape), 85% quality, ~300-520 KB. Saved to `/images/projects/cities/`. Each is a real-Landon photo, verified unused via og:image grep.

## Locked assignments (use these when drafting each post)

| # | Blog post | Source JPG | Hero filename | Why |
|---|---|---|---|---|
| 1 | SLV Premium Flagship (LIVE) | IMG_2673 | `salt-lake-valley-east-bench-aerial-2026.webp` | Mt. Olympus + crew + autumn canopy + premium home corner |
| 2 | Cottonwood Heights premium reroof | 77967352729 | `cottonwood-heights-mountain-modern-reroof-2026.webp` | Mountain-modern premium home + Frame yard sign + crew + dump truck = Top of the World / Bell Canyon aesthetic |
| 3 | Holladay architectural-vs-metal | IMG_2532 | `holladay-mt-olympus-architectural-install-2026.webp` | Same Mt. Olympus job as flagship but different angle — CertainTeed Landmark shingle bundles visible = perfect "architectural shingle decision" hook |
| 4 | SLC East Bench Historic | IMG_1905 | `salt-lake-city-east-bench-tearoff-2026.webp` | Open sheathing tear-off — perfect for the 1900-1950 historic-home sheathing replacement angle the post covers |
| 5 | Sandy East Bench premium | IMG_6144 | `sandy-east-bench-architectural-install-2026.webp` | Steep premium architectural shingle install with snowy canyon-foothill backdrop = Pepperwood / Granite / Alta-foothill |
| 6 | Millcreek + Murray mid-tier | IMG_1892 | `millcreek-murray-rambler-reroof-2026.webp` | Established brick rambler + crew on roof + Frame yard sign = first-cycle upgrade story for 1980s-90s mid-tier homes |

## Backup / round-2 candidates (saved in /tmp/frame-drive-pull/ for now)

| Photo | Description | Future use |
|---|---|---|
| IMG_1720 | Aerial premium suburban backyard + crew + Wasatch backdrop | Backup hero for any SLV premium post; alternate for Holladay or Sandy |
| IMG_2672 | Same Mt. Olympus job as flagship — alternate angle | Reserve as alternate hero for flagship if we ever swap |
| IMG_8421 | Cedar/wood-shake roof + mountain backdrop, custom hillside home | Round 2 — Park City when reactivated; or Cottonwood Heights Top of the World shake angle |
| IMG_2199 | Wide rural panorama (mountains + valley + single home + RV) | Round 2 — Heber Valley when reactivated; rural panoramic feel |
| IMG_9956 | Frame crew member + customer family + dog + finished roof in bg | NOT a service hero — perfect for a TESTIMONIAL / review section, customer-story sidebar |
| image000001 | Aerial mid-tear-off + sheathing + premium home in bg | Could be hero for a "what tear-off day looks like" process post in round 2 |
| IMG_0295 + IMG_0313 | Multifamily condo tear-off, mid-tier | Drop from premium round; reserve for commercial-roofing content |

## How to use these in the blog posts

When drafting each post, replicate the SLV flagship pattern:

1. **img src** — `/images/projects/cities/{filename}.webp`
2. **og:image** — same full URL
3. **twitter:image** — same
4. **JSON-LD BlogPosting.image** — same
5. **blog/index.html card thumb** — same path in `background-image`
6. **alt text** — describe what's IN the photo (Mt. Olympus, autumn canopy, crew on roof, premium home, etc.) and tie to the post's geographic angle
7. **Inline figure style** — `max-height: 480px` (matches flagship, gives more vertical room than the legacy 400px)

## Drive folder context

The "Pics for Website" folder has more photos than the 14 we pulled today. HEIC files (IMG_6485, IMG_7729, IMG_7919, IMG_7849, IMG_1053, IMG_0861) and PNGs (IMG_3099, IMG_3093) weren't downloaded this pass — they need HEIC→JPG conversion or are likely screenshots. Round 2 may pull a curated HEIC subset.

Drive folder URL: https://drive.google.com/drive/folders/1qo-NobzWJ8ux6NhA1l09EvV4BlxeeTbM

## Build-rule compliance

All 5 new hero files satisfy:
- ✅ Unique og:image (verified via grep across blog/ — none of these filenames appear yet)
- ✅ Real-Landon photo, no fabrication, no AI
- ✅ No drone-inspection marketing (Landon directive — aerial photos are fine as composition, just not pitching drone as a service)
- ✅ Landscape 1600×900 for hero use
- ✅ Webp format, 85% quality, ~300-520 KB each
