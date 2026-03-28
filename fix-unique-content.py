#!/usr/bin/env python3
"""Replace cookie-cutter bullet lists and serving paragraphs with unique city-specific content."""
import os, re

LOC_DIR = "/Users/agenticmac/projects/frame-restoration-utah/locations"

# City-specific bullet lists and serving paragraphs
CITY_DATA = {
    "heber-city": {
        "bullets": [
            "Free mountain-home roof inspections with snow load and ice dam assessment",
            "Enhanced ice-and-water shield coverage (6 ft from eaves) for Heber Valley's heavy snow",
            "Insurance claim specialists for Wasatch County hail and wind damage",
            "Materials rated for 5,600-ft elevation, sub-zero temps, and 200+ inches of annual snow",
            "Experience with Red Ledges, Jordanelle, Timber Lakes, and historic Main Street properties",
            "CertainTeed and Tamko certified installer with lifetime manufacturer warranties",
            "10-year workmanship warranty on every Heber City project"
        ],
        "serving": "We serve all of Heber Valley — from the ranches along Center Street to custom homes in Red Ledges, lakefront properties near Jordanelle Reservoir, and the historic buildings on Main Street. Neighboring communities including Midway, Daniel, Charleston, Timber Lakes, and Wallsburg all receive the same mountain-grade roofing expertise."
    },
    "sandy": {
        "bullets": [
            "Free inspections for Sandy homes from Dimple Dell to the canyon foothills",
            "East bench expertise — materials and methods tailored to Sandy's 4,400-to-5,500-ft elevation range",
            "Wasatch Range hailstorm specialists with full insurance claim coordination",
            "Premium impact-resistant shingles for foothill homes exposed to canyon-effect storms",
            "Trusted by Sandy homeowners in 84070, 84091, 84092, 84093, and 84094 ZIP codes",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty backed by local Utah presence"
        ],
        "serving": "Our Sandy coverage extends from the established neighborhoods around 9400 South and Dimple Dell Regional Park to the luxury east bench homes near Little Cottonwood Canyon. We also serve neighboring Draper, Midvale, Cottonwood Heights, South Jordan, and Murray — covering the entire south Salt Lake Valley."
    },
    "bountiful": {
        "bullets": [
            "Free inspections for Bountiful homes from the valley floor to the east bench foothills",
            "Wind-rated shingle systems for Bountiful's exposed hilltop and bench properties",
            "Insurance claim navigation for Davis County storm damage — hail, wind, and heavy snow",
            "Experience with Bountiful's mix of established 1960s-1980s homes and newer bench construction",
            "Premium materials for Bountiful's climate — hot summers, heavy winter snow, and rapid freeze-thaw",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty on every Davis County project"
        ],
        "serving": "We cover all of Bountiful from the neighborhoods along Main Street and 500 South to the scenic east bench properties overlooking the valley. Neighboring communities including North Salt Lake, Centerville, Woods Cross, and West Bountiful receive the same premium roofing quality."
    },
    "centerville": {
        "bullets": [
            "Free roof inspections for Centerville homeowners with honest condition assessments",
            "Expertise with Centerville's 1970s-2000s housing stock now reaching reroof age",
            "Storm damage claim specialists for Davis County hail and wind events",
            "Premium architectural shingles that match Centerville's well-maintained neighborhood aesthetics",
            "Parrish Lane commercial corridor roofing for businesses and retail properties",
            "CertainTeed and Tamko certified installer with manufacturer-backed warranties",
            "10-year workmanship guarantee on residential and commercial projects"
        ],
        "serving": "Our Centerville service area covers the full city from the neighborhoods along Parrish Lane to the foothill developments on the east side. We also serve neighboring Bountiful, Farmington, West Bountiful, and the greater Davis County area."
    },
    "clearfield": {
        "bullets": [
            "Free roof inspections for Clearfield residential and military-adjacent properties",
            "Affordable premium reroofing built for Clearfield's budget-conscious homeowners",
            "Wind-rated systems for properties near Hill Air Force Base's open terrain",
            "Insurance claim specialists for northern Davis County storm damage",
            "Fast turnaround times — we understand military families' relocation timelines",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty on every Clearfield project"
        ],
        "serving": "We serve all of Clearfield including the neighborhoods near Hill Air Force Base, the Clearfield Station area, and residential developments along State Street. Neighboring communities including Layton, Clinton, Syracuse, and Roy receive the same quality and service."
    },
    "clinton": {
        "bullets": [
            "Free no-pressure roof inspections for Clinton homeowners",
            "Premium reroofing for Clinton's newer subdivisions and established 1990s-2000s homes",
            "Storm damage and insurance claim coordination for Davis County weather events",
            "Wind-resistant shingle installations for Clinton's open western exposure",
            "HOA-compliant material options that meet community architectural standards",
            "CertainTeed and Tamko certified with manufacturer-backed warranties",
            "10-year workmanship warranty — local Utah contractor accountability"
        ],
        "serving": "We serve all of Clinton from the neighborhoods along 1800 North to the residential areas near the Great Salt Lake shoreline. Neighboring Syracuse, Clearfield, West Point, and Layton are all within our Davis County service area."
    },
    "farmington": {
        "bullets": [
            "Free roof inspections for Farmington homeowners — historic homes to Station Park condos",
            "Expertise with Farmington's diverse housing — pioneer-era cottages, mid-century ramblers, and modern builds",
            "Premium materials that complement Farmington's tree-lined historic districts",
            "Storm damage specialists for the Wasatch Range downdraft storms hitting Davis County",
            "Commercial roofing for Station Park and Lagoon-area business properties",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty on every Farmington project"
        ],
        "serving": "Our Farmington coverage extends from the historic downtown district near State Street to newer developments along the I-15 corridor and the Station Park area. We also serve neighboring Centerville, Kaysville, Bountiful, and the full Davis County region."
    },
    "kaysville": {
        "bullets": [
            "Free roof inspections for Kaysville properties from the valley floor to Fruit Heights",
            "Expertise with Kaysville's established neighborhoods now reaching 25-35 year reroof windows",
            "Insurance claim specialists for Davis County hail corridors and mountain wind events",
            "Premium materials that maintain Kaysville's family-neighborhood curb appeal",
            "East bench and Fruit Heights experience with higher-elevation snow loads",
            "CertainTeed and Tamko certified installer — manufacturer warranty support",
            "10-year workmanship warranty on all residential and commercial projects"
        ],
        "serving": "We serve all of Kaysville including the established neighborhoods along Main Street, the east bench developments near Fruit Heights, and newer construction in the city's southern corridor. Neighboring Layton, Farmington, and Fruit Heights are all covered."
    },
    "layton": {
        "bullets": [
            "Free inspections for Layton homes — from Gentile Street to the east bench foothills",
            "Hail and wind damage experts for Layton's frequent Davis County storm corridor events",
            "Premium reroofing for Layton's fast-growing mix of new builds and 1980s-2000s homes",
            "Hill Air Force Base area coverage with fast scheduling for military families",
            "Commercial roofing for Layton Hills Mall corridor and Main Street businesses",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty on every project in Layton"
        ],
        "serving": "Our Layton service area covers the entire city — from the commercial corridors near I-15 and Layton Hills Mall to the residential east bench neighborhoods climbing toward the Wasatch foothills. We also serve neighboring Kaysville, Clearfield, Hill Air Force Base, and Syracuse."
    },
    "midway": {
        "bullets": [
            "Free mountain-home roof inspections with elevation-specific damage assessment",
            "Materials and installation methods rated for Midway's 5,500-ft elevation and heavy snowfall",
            "Ice dam prevention systems with extended underlayment coverage for Heber Valley's freeze-thaw",
            "Resort property and luxury cabin roofing near Homestead, Zermatt, and Soldier Hollow",
            "Insurance claim specialists for Wasatch County hailstorms and snow damage",
            "CertainTeed and Tamko certified — manufacturer warranties valid at mountain elevation",
            "10-year workmanship warranty on every Midway project"
        ],
        "serving": "We serve all of Midway and the surrounding Heber Valley — from Swiss-inspired village homes along Main Street to luxury properties near the Homestead Resort, Zermatt, and the Soldier Hollow Olympic venue. Neighboring Heber City, Charleston, Daniel, and Wallsburg are all within our mountain service area."
    },
    "north-salt-lake": {
        "bullets": [
            "Free roof inspections for North Salt Lake homeowners — Foxboro to Eaglewood",
            "Wind-rated installations for NSL's exposed hillside and ridgeline properties",
            "Insurance claim coordination for Davis/Salt Lake County border storm events",
            "Expertise with North Salt Lake's rapid-growth 2000s-2010s subdivisions now aging",
            "Commercial roofing for Redwood Road corridor businesses and industrial properties",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty backed by local Utah accountability"
        ],
        "serving": "Our North Salt Lake coverage includes the Foxboro and Eaglewood neighborhoods, the developments along Redwood Road and Center Street, and the hillside homes with valley views. We also serve Bountiful, Woods Cross, West Bountiful, and Salt Lake City's northern neighborhoods."
    },
    "ogden": {
        "bullets": [
            "Free inspections across Ogden — from Historic 25th Street to east bench estates",
            "Expertise with Ogden's century-old craftsman homes and their unique roofing requirements",
            "Storm damage specialists for Weber County's intense mountain-effect hailstorms",
            "Premium materials that preserve Ogden's historic district architectural character",
            "Commercial roofing for downtown revitalization projects and Business Depot properties",
            "CertainTeed and Tamko certified with manufacturer-backed lifetime warranties",
            "10-year workmanship warranty on residential and commercial projects"
        ],
        "serving": "We serve all of Ogden from the historic neighborhoods around 25th Street and Jefferson Avenue to the luxury east bench properties at the base of the Wasatch Range. Our Weber County coverage also includes South Ogden, North Ogden, Riverdale, and Roy."
    },
    "provo": {
        "bullets": [
            "Free roof inspections for Provo homeowners — campus area to east bench foothills",
            "Expertise reroofing Provo's large inventory of 1960s-1990s family homes now at end of roof life",
            "Storm damage and insurance claim navigation for Utah County weather events",
            "Student rental property roofing for landlords near BYU campus and downtown",
            "Premium materials that handle Provo's hot summers, heavy winter snow, and canyon winds",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty on every Provo project"
        ],
        "serving": "Our Provo coverage extends from the neighborhoods near BYU and downtown to the east bench foothills along Provo Canyon, and west to the I-15 corridor. We also serve neighboring Orem, Springville, Spanish Fork, and the full Utah County region."
    },
    "salt-lake-city": {
        "bullets": [
            "Free inspections across SLC — from Avenues bungalows to Sugar House to the west side",
            "Historic home roofing expertise for Salt Lake's century-old neighborhoods",
            "Premium materials and techniques for the Avenues' steep pitches and ornamental details",
            "Storm damage specialists for Salt Lake Valley's summer hail and winter ice events",
            "Commercial flat roofing for downtown, Granary District, and Gateway area properties",
            "CertainTeed and Tamko certified with manufacturer-backed lifetime warranties",
            "10-year workmanship warranty on residential and commercial projects across SLC"
        ],
        "serving": "We serve all of Salt Lake City — from the historic Avenues and Federal Heights to Sugar House, Liberty Park, Rose Park, Glendale, and the west side. Our SLC coverage also extends to Millcreek, South Salt Lake, Holladay, and the entire Salt Lake Valley."
    },
    "syracuse": {
        "bullets": [
            "Free roof inspections for Syracuse homeowners in all subdivisions",
            "Premium reroofing for Syracuse's newer 2000s-2020s construction with builder-grade upgrades",
            "Wind-resistant shingle systems for Syracuse's open Great Salt Lake exposure",
            "Insurance claim navigation for Davis County hail and windstorm damage",
            "HOA-compatible materials meeting Syracuse community design standards",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty on every Syracuse project"
        ],
        "serving": "We serve all of Syracuse from the Bluff Road neighborhoods to the developments near Antelope Island and the Great Salt Lake. Neighboring Clinton, Clearfield, West Point, and Layton are all within our northern Davis County service area."
    },
    "wallsburg": {
        "bullets": [
            "Free mountain-property roof inspections with snow load and access assessment",
            "Rural and ranch property roofing expertise — large roofs, metal options, steep terrain",
            "Materials rated for Wallsburg's 6,000+ ft elevation and extreme winter conditions",
            "Ice dam prevention with extended underlayment coverage for heavy snow country",
            "Insurance claim coordination for isolated Wasatch County storm events",
            "CertainTeed and Tamko certified installer with manufacturer warranties",
            "10-year workmanship warranty — we come back even to remote mountain properties"
        ],
        "serving": "We serve the entire Wallsburg Valley and surrounding Wasatch County mountain communities. Our coverage extends to neighboring Heber City, Midway, and the broader Heber Valley. We're experienced with the access and logistics challenges of mountain and rural properties."
    },
    "west-bountiful": {
        "bullets": [
            "Free roof inspections for West Bountiful's compact residential neighborhoods",
            "Expertise with West Bountiful's 1960s-1990s housing stock now reaching reroof age",
            "Affordable premium options — quality materials at competitive Davis County pricing",
            "Storm damage specialists for the I-15 corridor hail and wind events",
            "Quick turnaround for West Bountiful's smaller lot sizes and accessible rooflines",
            "CertainTeed and Tamko certified with manufacturer-backed warranties",
            "10-year workmanship warranty on every West Bountiful project"
        ],
        "serving": "We serve all of West Bountiful from the residential areas near 800 West to the neighborhoods along Pages Lane and 500 South. Our Davis County coverage also includes neighboring Bountiful, Woods Cross, North Salt Lake, and Centerville."
    },
    "west-jordan": {
        "bullets": [
            "Free roof inspections for West Jordan homes — from Oquirrh foothills to 7800 South corridor",
            "Premium reroofing for West Jordan's diverse housing — 1980s subdivisions to modern Daybreak",
            "Hail damage and insurance claim specialists for southwest Salt Lake Valley storms",
            "Daybreak community expertise — HOA-compliant materials and quick-turnaround scheduling",
            "Commercial roofing for West Jordan's Mountain View Corridor business parks",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty on every West Jordan project"
        ],
        "serving": "Our West Jordan service area covers the full city — from the Oquirrh Mountain foothills and Daybreak community to the established neighborhoods along Redwood Road and the 7800 South commercial corridor. We also serve South Jordan, Herriman, Taylorsville, and Kearns."
    },
    "west-valley-city": {
        "bullets": [
            "Free inspections for West Valley's extensive 1970s-2000s housing inventory",
            "Affordable premium reroofing — top-quality materials at competitive west valley pricing",
            "Insurance claim navigation for Salt Lake County's most hail-impacted area",
            "Experience with West Valley's flat and low-slope commercial roofing near Valley Fair Mall",
            "Multi-family and rental property roofing for West Valley landlords and investors",
            "CertainTeed and Tamko certified with manufacturer-backed lifetime warranties",
            "10-year workmanship warranty on residential and commercial West Valley projects"
        ],
        "serving": "We serve all of West Valley City from the neighborhoods near Valley Fair Mall and the Maverik Center to the residential areas along 3500 South, 4100 South, and Bangerter Highway. Neighboring Taylorsville, Kearns, Magna, and West Jordan are all within our service area."
    },
    "woods-cross": {
        "bullets": [
            "Free roof inspections for Woods Cross homeowners — no pressure, just honest assessments",
            "Expertise with Woods Cross's 1960s-1990s established neighborhoods now needing reroofs",
            "Storm damage and insurance claim coordination for I-15 corridor weather events",
            "Premium materials that match Woods Cross's well-maintained residential character",
            "Commercial and light industrial roofing along the 500 South and I-15 business corridor",
            "CertainTeed and Tamko certified with lifetime manufacturer warranties",
            "10-year workmanship warranty on every Woods Cross project"
        ],
        "serving": "We serve all of Woods Cross from the residential neighborhoods along 500 South and Center Street to the commercial properties near the I-15 corridor. Our Davis County coverage also includes neighboring Bountiful, North Salt Lake, West Bountiful, and Centerville."
    }
}

# Generic patterns to find and replace
GENERIC_BULLET_PATTERN = r'(<h2>Why .*?Homeowners Choose .*?</h2>\s*<ul>)\s*<li>Free, no-obligation roof inspections.*?</ul>'
GENERIC_SERVING_PATTERN = r'(<h2>Serving .*?Surrounding Communities</h2>)\s*<p>Frame Roofing Utah delivers the same premium quality.*?</p>'

fixed = 0
for city, data in CITY_DATA.items():
    fpath = os.path.join(LOC_DIR, f"{city}.html")
    if not os.path.exists(fpath):
        print(f"  SKIP: {city}.html not found")
        continue
    
    with open(fpath, 'r') as f:
        content = f.read()
    original = content
    
    # Replace bullet list
    bullets_html = "\n".join(f"      <li>{b}</li>" for b in data["bullets"])
    def replace_bullets(m):
        return f"{m.group(1)}\n{bullets_html}\n    </ul>"
    content = re.sub(GENERIC_BULLET_PATTERN, replace_bullets, content, flags=re.DOTALL)
    
    # Replace serving paragraph
    def replace_serving(m):
        return f'{m.group(1)}\n    <p>{data["serving"]}</p>'
    content = re.sub(GENERIC_SERVING_PATTERN, replace_serving, content, flags=re.DOTALL)
    
    if content != original:
        with open(fpath, 'w') as f:
            f.write(content)
        fixed += 1
        print(f"  UPDATED: {city}.html")
    else:
        print(f"  NO MATCH: {city}.html (may already be unique)")

print(f"\nUpdated {fixed} pages with unique content.")
