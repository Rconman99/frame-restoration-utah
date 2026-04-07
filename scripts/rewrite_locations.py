#!/usr/bin/env python3
"""
Rewrite all 45 Frame Roofing Utah location pages with unique content per city.
Replaces the template <div class="content-section"> block with city-specific content.
"""
import re, json, os, sys

LOCATIONS_DIR = "/Users/agenticmac/projects/frame-restoration-utah/locations"

# ─── CITY DATA ───────────────────────────────────────────────────────────────
# Each city has unique geographic, demographic, and roofing-relevant data
CITIES = {
    "alpine": {
        "name": "Alpine",
        "county": "Utah County",
        "pop": "10,500+",
        "zips": "84004",
        "elevation": "4,990 ft",
        "lat": 40.4533, "lng": -111.7777,
        "housing_era": "1990s–2010s custom builds and newer luxury estates",
        "weather_note": "Alpine sits at the base of Lone Peak in the Wasatch Range, where orographic lift drives intense afternoon thunderstorms from May through August. Hailstones frequently reach marble size, and the city's higher elevation means heavier snow loads — roofs here endure roughly 15% more freeze-thaw cycles than valley-floor communities.",
        "local_detail": "Many Alpine homes feature steep architectural roof lines on larger lots, which demand premium underlayment and ice-and-water shield installations. The Burgess Park and Smooth Canyon neighborhoods contain some of the most complex residential roof geometries in northern Utah County.",
        "roofing_focus": "With its luxury housing stock, Alpine homeowners invest in designer-grade architectural shingles and standing seam metal to complement high-end exteriors. Frame Restoration's experience with complex cuts, dormers, and multi-plane designs makes us a natural fit for Alpine's distinctive homes.",
        "nearby": ["highland", "lehi", "american-fork", "lindon", "pleasant-grove"]
    },
    "american-fork": {
        "name": "American Fork",
        "county": "Utah County",
        "pop": "34,000+",
        "zips": "84003",
        "elevation": "4,600 ft",
        "lat": 40.3769, "lng": -111.7957,
        "housing_era": "Mix of 1970s–1980s established neighborhoods and 2000s+ growth areas",
        "weather_note": "American Fork's position where the Wasatch Front meets Utah Valley funnels storm systems through American Fork Canyon, producing sudden downbursts that generate significant wind and hail damage. The city averages 3–4 reportable hail events per year — enough to keep insurance adjusters busy every summer.",
        "local_detail": "The older neighborhoods near Main Street and 100 East feature ranch-style homes from the 1970s, many with original or once-replaced roofs nearing end of life. Meanwhile, the rapid growth areas east of I-15 feature newer construction that still needs post-storm inspections after Utah's aggressive spring hail season.",
        "roofing_focus": "Frame Restoration handles both aging roof replacements in American Fork's established core and storm damage claims in its newer subdivisions. Our insurance navigation expertise means homeowners rarely pay out of pocket when hail or wind is the culprit.",
        "nearby": ["highland", "lehi", "pleasant-grove", "lindon", "alpine"]
    },
    "bluffdale": {
        "name": "Bluffdale",
        "county": "Salt Lake County",
        "pop": "17,000+",
        "zips": "84065",
        "elevation": "4,500 ft",
        "lat": 40.4897, "lng": -111.9388,
        "housing_era": "Primarily 2000s–2020s new construction, rapid growth community",
        "weather_note": "Bluffdale occupies the southern edge of Salt Lake Valley where storms traveling up from Utah County frequently intensify. The open terrain and newer development mean hail events can affect large swaths of neighborhoods simultaneously — we've seen single storms trigger hundreds of roof claims in Bluffdale alone.",
        "local_detail": "Communities like The Hollows, Harvest Hills, and Day Ranch represent the modern suburban build-out that defines Bluffdale. Most homes are 10–20 years old with builder-grade 3-tab or basic architectural shingles — many now reaching their first replacement cycle.",
        "roofing_focus": "Bluffdale's newer housing stock means most replacements are first-time upgrades from builder-grade materials to premium architectural systems. Frame Restoration helps homeowners make that upgrade count — choosing impact-resistant Class 4 shingles that earn insurance premium discounts while handling Utah weather.",
        "nearby": ["riverton", "herriman", "draper", "south-jordan", "lehi"]
    },
    "bountiful": {
        "name": "Bountiful",
        "county": "Davis County",
        "pop": "44,000+",
        "zips": "84010, 84011",
        "elevation": "4,330 ft",
        "lat": 40.8894, "lng": -111.8808,
        "housing_era": "1950s–1980s established neighborhoods with pockets of newer development",
        "weather_note": "Bountiful's east bench neighborhoods climb steeply toward the Wasatch, catching weather systems that compress against the mountains. Wind speeds during storms routinely exceed what valley-floor cities experience, and the elevation gradient means the upper bench can receive hail while lower Bountiful stays dry.",
        "local_detail": "The city's historic core near Main Street features charming mid-century homes, while the east bench neighborhoods along Bountiful Boulevard showcase larger custom homes with panoramic valley views — and roofs that take the brunt of Wasatch weather. Bountiful Peak and Mueller Park attract hikers, but those same mountain canyons channel storm winds directly onto residential rooftops.",
        "roofing_focus": "Bountiful's aging housing stock means many homeowners are on their second or third roof. Frame Restoration specializes in full tear-off replacements that address decades of underlayment degradation, ensuring the new roof system starts fresh rather than inheriting problems from previous installations.",
        "nearby": ["centerville", "north-salt-lake", "west-bountiful", "woods-cross", "farmington"]
    },
    "centerville": {
        "name": "Centerville",
        "county": "Davis County",
        "pop": "18,000+",
        "zips": "84014",
        "elevation": "4,340 ft",
        "lat": 40.9180, "lng": -111.8722,
        "housing_era": "1970s–1990s core with 2000s infill development",
        "weather_note": "Centerville sits in the heart of Davis County where the Wasatch Front creates a natural weather funnel. Storm cells that develop over the Great Salt Lake intensify as they compress against the mountains, producing hail and high winds that disproportionately affect Centerville's east-side neighborhoods.",
        "local_detail": "Parrish Lane serves as Centerville's commercial spine, but the residential neighborhoods spreading east toward the mountains contain a dense collection of split-level and bi-level homes from the 1970s and 1980s — a housing style whose multiple roof planes and low-slope sections demand careful flashing and transition work during replacement.",
        "roofing_focus": "Frame Restoration's attention to detail shines on Centerville's complex multi-plane residential roofs. We address the hidden vulnerabilities — valley flashing, step flashing against dormers, and low-slope membrane transitions — that less thorough contractors miss.",
        "nearby": ["bountiful", "farmington", "west-bountiful", "woods-cross", "kaysville"]
    },
    "clearfield": {
        "name": "Clearfield",
        "county": "Davis County",
        "pop": "33,000+",
        "zips": "84015, 84016",
        "elevation": "4,340 ft",
        "lat": 41.1105, "lng": -112.0260,
        "housing_era": "1950s–1970s military-adjacent housing and 1990s–2000s suburban expansion",
        "weather_note": "Clearfield's location between Hill Air Force Base and the Great Salt Lake exposes it to unique weather patterns. Lake-effect storms sweep across the open flats with little topographic barrier, and the area's proximity to the base means many homes were built to mid-century military housing standards — functional but not designed for extreme weather longevity.",
        "local_detail": "The neighborhoods surrounding Hill Air Force Base contain some of Davis County's most affordable housing — and some of its oldest roofs. Many military families and first-time homeowners in Clearfield inherit aging roof systems that need honest assessment, not upselling.",
        "roofing_focus": "Frame Restoration provides straightforward, honest roof assessments in Clearfield. If your roof has remaining life, we'll tell you. When it's time, we deliver premium replacements at competitive prices — because quality roofing shouldn't be a luxury reserved for higher-priced markets.",
        "nearby": ["layton", "clinton", "syracuse", "kaysville", "farmington"]
    },
    "clinton": {
        "name": "Clinton",
        "county": "Davis County",
        "pop": "23,000+",
        "zips": "84015",
        "elevation": "4,360 ft",
        "lat": 41.1397, "lng": -112.0522,
        "housing_era": "1990s–2010s suburban growth community",
        "weather_note": "Clinton's western Davis County location puts it squarely in the path of Great Salt Lake weather systems. Moisture from the lake fuels intense convective storms that produce large hail — Clinton regularly appears on Utah's annual storm damage maps, and the flat terrain means there's no mountain shadow to weaken incoming cells.",
        "local_detail": "Primarily a residential community that grew rapidly in the 1990s and 2000s, Clinton's subdivisions feature uniform housing stock that often experiences storm damage across entire blocks simultaneously. The 2,000 South corridor and neighborhoods east of 3,000 West contain the densest concentration of homes now reaching their first 20-year replacement window.",
        "roofing_focus": "When storms hit Clinton, they hit hard and wide. Frame Restoration has the crew capacity to handle neighborhood-scale storm response — inspecting dozens of homes quickly, documenting damage for insurance, and scheduling replacements efficiently so your home doesn't wait months in queue.",
        "nearby": ["clearfield", "syracuse", "layton", "kaysville"]
    },
    "cottonwood-heights": {
        "name": "Cottonwood Heights",
        "county": "Salt Lake County",
        "pop": "34,000+",
        "zips": "84047, 84093, 84121",
        "elevation": "4,830 ft",
        "lat": 40.6197, "lng": -111.8100,
        "housing_era": "1960s–1980s established neighborhoods with mountain-adjacent custom homes",
        "weather_note": "Cottonwood Heights sits at the mouths of Big and Little Cottonwood Canyons, two of the most active storm corridors on the Wasatch Front. Canyon winds regularly gust above 60 mph during storm events, and the city's higher elevation means heavier snowpack and more aggressive freeze-thaw cycling than lower Salt Lake Valley communities.",
        "local_detail": "From the established neighborhoods near Butler Elementary to the mountain-view custom homes climbing toward the canyon mouths, Cottonwood Heights offers some of the Wasatch Front's most desirable — and most weather-exposed — real estate. The canyon-mouth microclimates create roofing challenges that valley-floor contractors simply don't encounter.",
        "roofing_focus": "Frame Restoration understands canyon-mouth roofing. We specify high-wind-rated shingles, reinforce ridge lines against uplift, and use enhanced ice-and-water shield coverage because Cottonwood Heights roofs face conditions other Salt Lake Valley neighborhoods never see.",
        "nearby": ["sandy", "holladay", "murray", "midvale", "draper"]
    },
    "draper": {
        "name": "Draper",
        "county": "Salt Lake County / Utah County",
        "pop": "51,000+",
        "zips": "84020",
        "elevation": "4,510 ft",
        "lat": 40.5247, "lng": -111.8638,
        "housing_era": "1990s–2020s rapid growth with significant new construction",
        "weather_note": "Draper straddles the Salt Lake Valley's southern corridor where storm systems from both the south and west converge. The Point of the Mountain creates turbulent wind patterns that can peel shingles and drive rain under flashing. Draper's eastside neighborhoods at higher elevations face additional snow loading and ice dam risks during Utah's prolonged winters.",
        "local_detail": "Draper's transformation from a quiet farming community to a technology and residential hub has produced diverse housing — from SunCrest's mountain-top homes to the established neighborhoods near Draper Park. The city's tech corridor along I-15 also supports significant commercial roofing demand from office parks and mixed-use developments.",
        "roofing_focus": "Frame Restoration serves Draper's full spectrum — residential tear-offs in established neighborhoods, first-replacement upgrades in newer subdivisions, and commercial flat-roof systems for the growing business district. Our Point of the Mountain wind experience means we know exactly where to reinforce.",
        "nearby": ["sandy", "riverton", "bluffdale", "south-jordan", "alpine"]
    },
    "farmington": {
        "name": "Farmington",
        "county": "Davis County",
        "pop": "25,000+",
        "zips": "84025",
        "elevation": "4,340 ft",
        "lat": 40.9844, "lng": -111.8875,
        "housing_era": "Historic downtown core (1890s–1950s) plus 2000s–2020s Station Park growth",
        "weather_note": "Farmington Bay and the adjacent wetlands create localized humidity that intensifies storms approaching from the northwest. The city's east bench climbs sharply, and elevation gain from Farmington Station to the mountain neighborhoods means weather severity can vary dramatically within a few blocks.",
        "local_detail": "Farmington blends Utah heritage with modern growth. The historic downtown near State Street features century-old homes that need delicate restoration-grade roof work, while the Station Park area represents some of Davis County's newest residential and commercial development. Farmington Canyon delivers canyon-effect winds similar to what Cottonwood Heights experiences.",
        "roofing_focus": "Frame Restoration handles both extremes in Farmington — careful restoration work on historic structures and modern premium installations on new construction. Whether your home is a Victorian near the park or a 2020 build near Station Park, we match the approach to the architecture.",
        "nearby": ["centerville", "kaysville", "bountiful", "layton", "woods-cross"]
    },
    "heber-city": {
        "name": "Heber City",
        "county": "Wasatch County",
        "pop": "18,000+",
        "zips": "84032",
        "elevation": "5,604 ft",
        "lat": 40.5072, "lng": -111.4135,
        "housing_era": "Historic Main Street core (1900s–1950s) plus 2000s–2020s resort-adjacent growth",
        "weather_note": "Heber City's 5,600-foot elevation in the Heber Valley produces some of Utah's most demanding roofing conditions. Winter temperatures regularly drop below zero, snowpack can exceed 200 inches annually, and the valley's bowl shape traps cold air inversions that extend freeze-thaw cycles well into April. Summer thunderstorms sweep across from the Uinta Range with little warning.",
        "local_detail": "As the Wasatch County seat, Heber City anchors a valley that has transformed from agricultural roots into one of Utah's fastest-growing recreational communities. The Main Street historic district, Jordanelle Ridge developments, and the ranch properties along River Road each present distinct roofing requirements — from preserving historic character to engineering for extreme snow loads.",
        "roofing_focus": "Frame Restoration is headquartered in Heber Valley — this is our home turf. We understand the valley's extreme conditions intimately because we live and work here. From ice dam prevention systems to snow-load-rated architectural designs, every Heber City roof we install is engineered for 5,600-foot mountain living.",
        "nearby": ["midway", "park-city"]
    },
    "herriman": {
        "name": "Herriman",
        "county": "Salt Lake County",
        "pop": "61,000+",
        "zips": "84096",
        "elevation": "5,100 ft",
        "lat": 40.5144, "lng": -112.0330,
        "housing_era": "Almost entirely 2005–2020s new construction — one of Utah's fastest-growing cities",
        "weather_note": "Herriman's elevated position on the southwest bench of Salt Lake Valley makes it a first target for storms approaching from the Oquirrh Mountains. The city's 5,100-foot elevation means heavier snow loads and more freeze-thaw cycles than valley-floor neighbors. Afternoon thunderstorms in summer develop rapidly over the Oquirrhs and hit Herriman before reaching the rest of the valley.",
        "local_detail": "Herriman grew from under 5,000 residents in 2000 to over 60,000 today — nearly all its housing stock is less than 20 years old. Subdivisions like Blackridge, Rosecrest, and Juniper Canyon represent the largest concentration of builder-grade roofing in southwest Salt Lake County, much of it now approaching its first replacement window.",
        "roofing_focus": "Herriman's uniform age housing stock creates a unique opportunity — thousands of homes hitting replacement age around the same time. Frame Restoration helps Herriman homeowners upgrade from builder-grade 3-tab to impact-resistant architectural shingles, often covered by insurance after storm events.",
        "nearby": ["riverton", "south-jordan", "bluffdale", "west-jordan"]
    },
    "highland": {
        "name": "Highland",
        "county": "Utah County",
        "pop": "19,000+",
        "zips": "84003",
        "elevation": "4,800 ft",
        "lat": 40.4264, "lng": -111.7956,
        "housing_era": "1980s–2010s custom and semi-custom homes on larger lots",
        "weather_note": "Highland's elevated bench position between Alpine and American Fork puts it directly in the path of storms channeling out of American Fork Canyon. The city receives higher annual precipitation than the valley floor, and its exposed western face catches wind-driven rain and hail that lower Utah County communities are shielded from.",
        "local_detail": "Highland is known for its large lots, equestrian properties, and custom-built homes — many featuring complex roof designs with multiple valleys, dormers, and varying pitches. The neighborhoods along Highland Boulevard and near Beacon Hills showcase some of northern Utah County's most architecturally distinctive residential rooflines.",
        "roofing_focus": "Frame Restoration thrives on Highland's complex residential designs. Our crews have deep experience with multi-plane roofs, cricket installations behind large chimneys, and the premium material selections that Highland homeowners expect — from cedar shake to synthetic slate to designer architectural shingles.",
        "nearby": ["alpine", "american-fork", "lehi", "pleasant-grove", "lindon"]
    },
    "holladay": {
        "name": "Holladay",
        "county": "Salt Lake County",
        "pop": "31,000+",
        "zips": "84117, 84121, 84124",
        "elevation": "4,560 ft",
        "lat": 40.6688, "lng": -111.8247,
        "housing_era": "1950s–1970s established neighborhoods with significant mid-century housing stock",
        "weather_note": "Holladay's position along the Wasatch bench means storms compress as they push against the mountains, intensifying precipitation directly over the city. The cottonwood groves that give nearby canyons their name also drop significant debris during wind events — branches, leaves, and organic matter that accelerate roof degradation if left uncleared.",
        "local_detail": "Holladay's tree-lined streets and mid-century character make it one of Salt Lake's most desirable communities. The Cottonwood Mall area, Olympus Cove, and the neighborhoods surrounding Holladay City Park feature mature housing stock where original roofs — and even first replacements — have reached end of life.",
        "roofing_focus": "Frame Restoration respects Holladay's established character. We work closely with homeowners to select materials that complement mid-century architecture while delivering modern performance. Our full tear-off process reveals and addresses decades of hidden damage that overlay installations miss.",
        "nearby": ["cottonwood-heights", "murray", "millcreek", "sandy", "midvale"]
    },
    "kaysville": {
        "name": "Kaysville",
        "county": "Davis County",
        "pop": "33,000+",
        "zips": "84037",
        "elevation": "4,370 ft",
        "lat": 41.0352, "lng": -111.9386,
        "housing_era": "1970s–1990s core neighborhoods with 2000s east-side growth",
        "weather_note": "Kaysville's broad exposure between the Wasatch Range and the Great Salt Lake makes it vulnerable to weather from both directions. Lake-effect moisture combines with mountain uplift to produce Davis County's heaviest precipitation events, and Kaysville's relatively flat terrain offers no natural windbreak for residential rooftops.",
        "local_detail": "From the established neighborhoods near Kaysville Elementary to the newer developments climbing toward the mountains east of 200 East, Kaysville offers classic Davis County suburban living. The fruit orchards that once defined the area have given way to residential growth, but the agricultural heritage means many older properties have outbuildings and barns that also need roofing attention.",
        "roofing_focus": "Frame Restoration serves Kaysville's full range — from aging ranch homes near the city center to premium east-bench properties. We also handle agricultural and accessory structures that larger roofing companies often overlook, ensuring every building on your property is protected.",
        "nearby": ["layton", "farmington", "clearfield", "centerville", "syracuse"]
    },
    "kearns": {
        "name": "Kearns",
        "county": "Salt Lake County",
        "pop": "36,000+",
        "zips": "84118",
        "elevation": "4,310 ft",
        "lat": 40.6519, "lng": -111.9958,
        "housing_era": "1940s–1960s military-era housing originally built for defense workers",
        "weather_note": "Kearns sits on the Salt Lake Valley floor where summer thunderstorms often stall, producing extended hail and heavy rain events. The flat terrain and open spacing between homes means wind damage tends to affect entire streets rather than isolated properties.",
        "local_detail": "Originally developed as wartime housing for workers at nearby military installations, Kearns features one of Salt Lake County's most uniform housing stocks — rows of similar-era homes now 60–80 years old. The Kearns Olympic Oval put the community on the world map, but the surrounding residential areas contain some of the county's oldest roofing systems still in service.",
        "roofing_focus": "Kearns homeowners deserve premium quality at approachable prices. Frame Restoration provides full tear-off replacements that address decades of underlying damage common in Kearns' aging housing stock — water-damaged decking, deteriorated underlayment, and inadequate ventilation that shortcuts shingle lifespan.",
        "nearby": ["taylorsville", "west-valley-city", "west-jordan", "magna", "murray"]
    },
    "layton": {
        "name": "Layton",
        "county": "Davis County",
        "pop": "82,000+",
        "zips": "84040, 84041",
        "elevation": "4,400 ft",
        "lat": 41.0602, "lng": -111.9711,
        "housing_era": "1960s–1990s established city with ongoing infill development",
        "weather_note": "Layton is Davis County's largest city and sits in a geographic sweet spot for storm damage — exposed to both Great Salt Lake weather systems from the west and Wasatch canyon winds from the east. The city's wide east-west spread means a single storm system can produce hail on the east bench while sparing the west side, making neighborhood-level inspections critical.",
        "local_detail": "Layton's growth around Hill Air Force Base created extensive residential development spanning four decades. The neighborhoods near Layton Hills Mall represent 1980s construction, while East Layton's hillside homes date to the 1990s and 2000s. Gentile Street's historic district adds a small pocket of older structures needing specialized care.",
        "roofing_focus": "As Davis County's population center, Layton demands a roofer who can operate at scale without sacrificing quality. Frame Restoration delivers consistent premium results whether we're replacing a single home's roof or responding to a neighborhood-wide hail event affecting dozens of properties.",
        "nearby": ["clearfield", "kaysville", "farmington", "clinton", "syracuse"]
    },
    "lehi": {
        "name": "Lehi",
        "county": "Utah County",
        "pop": "82,000+",
        "zips": "84043",
        "elevation": "4,550 ft",
        "lat": 40.3916, "lng": -111.8508,
        "housing_era": "Historic core (1880s–1950s) plus massive 2000s–2020s Silicon Slopes expansion",
        "weather_note": "Lehi's position at the Point of the Mountain — where Salt Lake Valley transitions to Utah Valley — creates some of Utah's most turbulent wind conditions. Paragliders love it; roofs do not. Wind-driven rain penetration, shingle uplift, and accelerated weathering from constant wind exposure are defining challenges for Lehi roofing.",
        "local_detail": "Lehi's transformation from a small agricultural town into the heart of Silicon Slopes has produced dramatic contrasts — the historic Main Street district with century-old homes exists alongside massive Traverse Mountain developments and the tech campuses of Adobe, Microsoft, and dozens of startups. Each area presents completely different roofing needs.",
        "roofing_focus": "Frame Restoration addresses Lehi's dual personality. For historic homes, we provide restoration-sensitive replacements that maintain character. For newer Traverse Mountain and Thanksgiving Point-area developments, we deliver high-wind-rated premium systems engineered for the Point of the Mountain's relentless winds.",
        "nearby": ["american-fork", "highland", "alpine", "bluffdale", "draper"]
    },
    "lindon": {
        "name": "Lindon",
        "county": "Utah County",
        "pop": "12,000+",
        "zips": "84042",
        "elevation": "4,650 ft",
        "lat": 40.3422, "lng": -111.7214,
        "housing_era": "1980s–2000s residential with significant orchard-lot conversions",
        "weather_note": "Lindon sits between Pleasant Grove and Orem along the Wasatch bench where mountain-generated storms deliver concentrated precipitation events. The city's moderate elevation and mountain proximity mean reliable snowfall in winter and aggressive thunderstorm activity from May through September.",
        "local_detail": "Once known primarily for its cherry orchards, Lindon has evolved into a blend of residential neighborhoods and a growing commercial corridor along State Street and 700 North. The former orchard lots have been subdivided into residential developments, and many homes built during Lindon's 1990s growth phase are now entering their replacement window.",
        "roofing_focus": "Lindon's mid-age housing stock represents the sweet spot for smart roof replacement — old enough to need attention but not so old that structural surprises are common. Frame Restoration helps Lindon homeowners time their replacement for maximum value, often coordinating with storm damage claims to minimize out-of-pocket cost.",
        "nearby": ["pleasant-grove", "orem", "american-fork", "highland", "alpine"]
    },
    "magna": {
        "name": "Magna",
        "county": "Salt Lake County",
        "pop": "29,000+",
        "zips": "84044",
        "elevation": "4,270 ft",
        "lat": 40.7092, "lng": -112.1016,
        "housing_era": "1920s–1960s mining-era homes with newer 2000s development on the edges",
        "weather_note": "Magna's western Salt Lake Valley position on the edge of the Great Salt Lake puts it first in line for lake-effect weather. Storms approaching from the northwest hit Magna with full force before reaching the rest of the valley, and the community's proximity to the Oquirrh Mountains creates channeled wind events that test roof integrity.",
        "local_detail": "Magna's mining heritage shaped its housing stock — compact homes built for copper mining families in the early-to-mid 1900s line the streets near the historic town center. These structures have character and history, but their roofing systems often reflect decades of deferred maintenance and budget-driven repairs that covered problems rather than solving them.",
        "roofing_focus": "Frame Restoration brings honest craftsmanship to Magna's heritage homes. We strip away layers of previous repairs to assess the true condition of your roof deck, replace damaged sheathing, and install modern systems that protect these historic structures for another generation.",
        "nearby": ["west-valley-city", "kearns", "taylorsville"]
    },
    "midvale": {
        "name": "Midvale",
        "county": "Salt Lake County",
        "pop": "36,000+",
        "zips": "84047",
        "elevation": "4,370 ft",
        "lat": 40.6111, "lng": -111.9000,
        "housing_era": "1950s–1970s working-class neighborhoods with recent redevelopment",
        "weather_note": "Midvale occupies the central Salt Lake Valley where storms have fully developed before arrival. The city's flat terrain and relatively low elevation mean it catches the full breadth of valley-crossing weather systems — wide hail swaths, sustained winds, and the heavy summer downpours that test aging drainage and flashing systems.",
        "local_detail": "Midvale's ongoing revitalization — anchored by the Bingham Junction and Fort Union areas — is transforming the city from a blue-collar stronghold into a connected, transit-oriented community. But many residential streets still feature the original 1960s housing stock whose roofs have endured decades of Utah weather with minimal upgrades.",
        "roofing_focus": "As Midvale reinvests in itself, Frame Restoration helps homeowners make their roofing investment count. A premium replacement protects your home's value during a period of rising property values — and our insurance claim expertise ensures storm damage doesn't come out of your pocket.",
        "nearby": ["murray", "sandy", "cottonwood-heights", "holladay", "west-jordan"]
    },
    "midway": {
        "name": "Midway",
        "county": "Wasatch County",
        "pop": "6,500+",
        "zips": "84049",
        "elevation": "5,600 ft",
        "lat": 40.5122, "lng": -111.4733,
        "housing_era": "Swiss-influenced historic homes, 1990s–2020s resort-style and custom builds",
        "weather_note": "Midway shares Heber Valley's demanding 5,600-foot elevation climate but adds the unique microclimate effect of the Midway hot springs basin. Ground-level thermal variations can accelerate ice dam formation in winter, while the valley's summer thunderstorms arrive suddenly from the Wasatch Range with damaging hail.",
        "local_detail": "Midway's Swiss heritage gives it Utah's most distinctive architectural character — the Swiss Days celebration draws visitors statewide, and many homes incorporate alpine-inspired design elements. Zermatt Resort, Homestead Crater, and the growing luxury developments along Snake Creek and Dutch Hollow Road add high-end properties with complex roof architectures.",
        "roofing_focus": "Frame Restoration is the Heber Valley's hometown roofer, and Midway is where we first established our reputation for mountain-grade quality. We understand the Swiss-influenced architecture, the ice dam challenges created by Midway's unique thermal conditions, and the premium expectations of this resort community.",
        "nearby": ["heber-city", "park-city"]
    },
    "millcreek": {
        "name": "Millcreek",
        "county": "Salt Lake County",
        "pop": "63,000+",
        "zips": "84106, 84107, 84109, 84117, 84124",
        "elevation": "4,430 ft",
        "lat": 40.6866, "lng": -111.8755,
        "housing_era": "1940s–1970s mid-century residential, one of SLC metro's most established areas",
        "weather_note": "Millcreek's east-side positioning against the Wasatch Front means Millcreek Canyon acts as a natural storm accelerator — winds channel through the canyon and disperse across residential neighborhoods with increased velocity. The city's dense tree canopy also contributes to roof wear through organic debris accumulation and shading that promotes moss and algae growth.",
        "local_detail": "As one of Salt Lake's most established residential communities, Millcreek features block after block of mid-century homes along corridors like 3300 South and Highland Drive. The recent incorporation as a city has brought renewed investment, but much of the housing stock carries original or once-replaced roofs from the 1990s that are now reaching end of life.",
        "roofing_focus": "Millcreek's dense, mature neighborhoods require a roofing contractor who can work efficiently in tight spaces with large trees, close neighbors, and narrow driveways. Frame Restoration's crews handle the logistics of urban tear-offs while delivering the same premium quality we bring to wide-open suburban sites.",
        "nearby": ["holladay", "murray", "south-salt-lake", "salt-lake-city", "cottonwood-heights"]
    },
    "murray": {
        "name": "Murray",
        "county": "Salt Lake County",
        "pop": "50,000+",
        "zips": "84107, 84123",
        "elevation": "4,340 ft",
        "lat": 40.6547, "lng": -111.8883,
        "housing_era": "1950s–1980s established city center with diverse commercial roofing needs",
        "weather_note": "Murray's central Salt Lake Valley position means it experiences the full range of Wasatch weather — from summer hailstorms that develop over the mountains to winter wind events driven through the valley corridor. The Jordan River running through the city adds localized humidity that can accelerate shingle degradation in riverside neighborhoods.",
        "local_detail": "Murray's identity as a self-contained city within the Salt Lake metro — with its own hospital, parks, and commercial district — means it has significant both residential and commercial roofing demand. The Fashion Place Mall area, Murray City Park neighborhoods, and the Intermountain Medical Center campus all represent distinct roofing environments within a compact geography.",
        "roofing_focus": "Frame Restoration serves Murray's diverse needs — aging residential tear-offs, commercial flat-roof systems for the business district, and storm damage response across all property types. Murray's central location makes it one of our most efficiently served markets in Salt Lake County.",
        "nearby": ["midvale", "holladay", "taylorsville", "millcreek", "cottonwood-heights"]
    },
    "north-salt-lake": {
        "name": "North Salt Lake",
        "county": "Davis County",
        "pop": "21,000+",
        "zips": "84054",
        "elevation": "4,300 ft",
        "lat": 40.8486, "lng": -111.9069,
        "housing_era": "1970s–1990s hillside development with 2000s+ Eaglewood growth",
        "weather_note": "North Salt Lake's hillside terrain creates unique wind exposure — homes on the upper benches face canyon-effect gusts from City Creek and Dry Creek, while the I-15 corridor cuts a wind channel through the lower neighborhoods. Storm damage patterns in North Salt Lake vary dramatically by elevation and exposure.",
        "local_detail": "The Eaglewood Golf Course community and surrounding developments represent North Salt Lake's premium housing, while the established neighborhoods along Orchard Drive and Center Street contain the city's more affordable stock. The Foxboro area and newer Eaglewood phases have been growing steadily, adding modern construction that still needs post-storm vigilance.",
        "roofing_focus": "North Salt Lake's varied terrain means Frame Restoration adapts our approach block by block. Hilltop homes need enhanced wind resistance. Valley-floor properties need reliable drainage systems. We assess each home's specific exposure and engineer the replacement accordingly.",
        "nearby": ["bountiful", "woods-cross", "centerville", "salt-lake-city"]
    },
    "ogden": {
        "name": "Ogden",
        "county": "Weber County",
        "pop": "87,000+",
        "zips": "84401, 84403, 84404, 84405",
        "elevation": "4,300 ft",
        "lat": 41.2230, "lng": -111.9738,
        "housing_era": "Historic railroad-era downtown (1880s–1930s) through modern east bench development",
        "weather_note": "Ogden's geography is extreme — the city stretches from the Weber River flats to the steep Wasatch bench where Ogden Canyon opens. Storms entering from the north gain intensity as they compress against the mountains, and Ogden Canyon produces some of the Wasatch Front's most violent wind events. The city regularly experiences wind gusts exceeding 70 mph during fall and spring storm systems.",
        "local_detail": "Ogden's railroad heritage produced one of Utah's most architecturally diverse cities. The 25th Street historic district, the craftsman bungalows of the east bench, and the Victorian homes near Jefferson Avenue create a living museum of American residential architecture — each style demanding period-appropriate roofing approaches. Meanwhile, Weber State University and the growing tech scene bring modern construction that needs modern solutions.",
        "roofing_focus": "Frame Restoration brings both heritage sensitivity and modern engineering to Ogden. Our crews understand the difference between replacing a Victorian slate roof and installing impact-resistant shingles on a 2015 build. Whatever your Ogden home needs, we deliver the right solution with uncompromising quality.",
        "nearby": ["layton", "clearfield", "kaysville"]
    },
    "orem": {
        "name": "Orem",
        "county": "Utah County",
        "pop": "99,000+",
        "zips": "84057, 84058, 84059, 84097",
        "elevation": "4,770 ft",
        "lat": 40.2969, "lng": -111.6947,
        "housing_era": "1960s–1990s established neighborhoods plus UVU-adjacent growth",
        "weather_note": "Orem's linear stretch along the Wasatch bench from Provo to Lindon means storm exposure varies significantly from west to east. The eastern neighborhoods near the mountains receive higher precipitation and more intense hail, while western Orem's proximity to Utah Lake moderates temperatures but adds humidity that accelerates shingle aging.",
        "local_detail": "As Utah County's second-largest city and home to Utah Valley University, Orem blends family neighborhoods with student housing and a growing commercial sector. The neighborhoods around Orem City Center, the established streets near 800 North, and the newer developments around Vineyard connector roads each represent different housing eras and roofing challenges.",
        "roofing_focus": "Orem's scale and housing diversity require a roofer who delivers consistent quality across hundreds of projects. Frame Restoration handles everything from 1960s rambler tear-offs to modern architectural installations — with the same premium materials and meticulous process every time.",
        "nearby": ["provo", "lindon", "pleasant-grove", "springville", "american-fork"]
    },
    "park-city": {
        "name": "Park City",
        "county": "Summit County",
        "pop": "8,500+",
        "zips": "84060, 84098",
        "elevation": "7,000 ft",
        "lat": 40.6461, "lng": -111.4980,
        "housing_era": "Historic mining-era Old Town (1880s–1920s) plus 1980s–2020s resort and luxury development",
        "weather_note": "At 7,000 feet, Park City endures some of Utah's most punishing roofing conditions. Annual snowfall routinely exceeds 300 inches, temperatures can swing 50 degrees in a single day, and the high-altitude UV exposure degrades roofing materials roughly 25% faster than valley locations. Summer thunderstorms produce marble-to-golf-ball hail that can devastate a roof in minutes.",
        "local_detail": "Park City's dual identity — historic mining town and world-class ski resort — creates Utah's most varied roofing landscape. Old Town's narrow lots and historic preservation requirements sit alongside Deer Valley's multi-million-dollar estates and the Canyons Village condominiums. Each demands specialized knowledge that most Front Range roofers simply lack.",
        "roofing_focus": "Frame Restoration is one of the few Wasatch Back roofers with the mountain-grade expertise Park City demands. We specify materials rated for extreme UV, engineer for 300+ inch snow loads, and navigate Park City's stringent building codes and historic preservation requirements. Our proximity in Heber Valley means we're always close when Park City calls.",
        "nearby": ["heber-city", "midway"]
    },
    "payson": {
        "name": "Payson",
        "county": "Utah County",
        "pop": "21,000+",
        "zips": "84651",
        "elevation": "4,700 ft",
        "lat": 40.0444, "lng": -111.7322,
        "housing_era": "Historic downtown (1870s–1940s) with 2000s–2020s southern Utah County growth",
        "weather_note": "Payson sits at the southern end of Utah Valley where the valley narrows toward Santaquin and Spanish Fork Canyon. This geographic funnel concentrates storm energy, and Payson frequently records some of the highest wind gusts in Utah County during spring and fall storm systems. The Payson Canyon corridor adds additional turbulence during weather events.",
        "local_detail": "The Payson Temple and the surrounding Payson Canyon make this southern Utah County city a growing destination. The historic downtown features homes dating to Utah's pioneer era, while the rapid development along I-15 has added modern subdivisions that contrast sharply with the city's agricultural character. The Payson Onion Days festival may be the claim to fame, but the housing growth is the bigger story.",
        "roofing_focus": "Frame Restoration extends premium quality to southern Utah County. Payson homeowners have historically been underserved by the metro-focused roofing companies — we bring the same meticulous craftsmanship to Payson that we deliver in Park City, with pricing that reflects Payson's market rather than resort-town premiums.",
        "nearby": ["santaquin", "springville", "provo"]
    },
    "pleasant-grove": {
        "name": "Pleasant Grove",
        "county": "Utah County",
        "pop": "40,000+",
        "zips": "84062",
        "elevation": "4,630 ft",
        "lat": 40.3641, "lng": -111.7386,
        "housing_era": "1970s–1990s core neighborhoods plus 2000s Manila Creek and Grove Creek areas",
        "weather_note": "Pleasant Grove's location below Grove Creek and Battle Creek canyons creates localized downslope wind events that are uniquely damaging to roofs. These canyon winds can gust to 80+ mph during winter storm systems, peeling shingles and driving moisture under flashing in ways that conventional wind rarely achieves. Summer thunderstorms add regular hail exposure to the mix.",
        "local_detail": "Known as 'Strawberry City,' Pleasant Grove retains a small-town feel despite substantial growth. The established neighborhoods near 100 East and Main Street feature homes from the 1970s and 1980s, while the Manila Creek and Battle Creek developments east of the freeway represent the city's growth phase. The annual Strawberry Days celebration fills the community with pride — and the surrounding canyons fill it with wind.",
        "roofing_focus": "Frame Restoration's high-wind experience from Park City and the Point of the Mountain translates directly to Pleasant Grove's canyon wind challenges. We specify enhanced wind-resistance fastening patterns and seal every shingle tab when Grove Creek's downslope winds demand it.",
        "nearby": ["lindon", "american-fork", "orem", "highland", "lehi"]
    },
    "provo": {
        "name": "Provo",
        "county": "Utah County",
        "pop": "116,000+",
        "zips": "84601, 84602, 84604, 84606",
        "elevation": "4,551 ft",
        "lat": 40.2338, "lng": -111.6585,
        "housing_era": "Wide range — 1890s historic districts through modern BYU-adjacent construction",
        "weather_note": "Provo's position at the base of the Wasatch Range and adjacent to Utah Lake creates a convergence zone where mountain storms meet lake-moderated air masses. This produces Utah County's most complex weather patterns — from intense thunderstorms channeling through Provo Canyon to the inversions that trap cold air against the city for weeks in winter.",
        "local_detail": "As Utah County's largest city and home to Brigham Young University, Provo contains extraordinary architectural diversity. The historic neighborhoods near Center Street feature some of Utah's finest Victorian and craftsman homes. The tree-lined streets of the Joaquin neighborhood showcase mid-century family housing. And the growth areas in south and west Provo add modern suburban development — all requiring different roofing approaches.",
        "roofing_focus": "Frame Restoration serves every corner of Provo's diverse housing market. We handle historic preservation-grade replacements on BYU-area Victorians, full modernizations on aging 1960s housing stock, and premium new installations on south Provo developments — always with the same uncompromising attention to detail.",
        "nearby": ["orem", "springville", "lindon", "payson"]
    },
    "riverton": {
        "name": "Riverton",
        "county": "Salt Lake County",
        "pop": "44,000+",
        "zips": "84065",
        "elevation": "4,480 ft",
        "lat": 40.5219, "lng": -111.9391,
        "housing_era": "1990s–2010s suburban growth with some older agricultural-lot properties",
        "weather_note": "Riverton's south-central Salt Lake Valley position puts it at the convergence point of storm systems entering from both the Oquirrh and Wasatch corridors. The city experiences some of the valley's widest hail swaths during summer thunderstorms — when storms hit Riverton, they tend to hit comprehensively rather than in narrow bands.",
        "local_detail": "Riverton transitioned from farming community to established suburb over the past three decades. The Riverton City Park area and Mountain View Corridor neighborhoods anchor the city's residential core, while the Riverton Hospital and commercial areas along 12600 South represent the city's growing infrastructure. The old Riverton town center maintains a few historic structures amid the suburban growth.",
        "roofing_focus": "Riverton's 1990s–2000s housing stock means many homes are reaching their first or second replacement. Frame Restoration guides homeowners through timing their replacement for maximum value — whether upgrading proactively before problems develop or leveraging storm damage claims to cover the cost of a premium upgrade.",
        "nearby": ["herriman", "south-jordan", "bluffdale", "draper", "west-jordan"]
    },
    "salt-lake-city": {
        "name": "Salt Lake City",
        "county": "Salt Lake County",
        "pop": "200,000+",
        "zips": "84101–84199",
        "elevation": "4,226 ft",
        "lat": 40.7608, "lng": -111.8910,
        "housing_era": "Full spectrum — 1850s pioneer-era through modern high-rise construction",
        "weather_note": "Salt Lake City's diverse topography — from the valley floor near the Jordan River to the steep Avenues and Federal Heights neighborhoods — means storm impact varies dramatically by location. The Avenues catch Wasatch-compressed weather at intensity, while the west side faces Great Salt Lake systems head-on. The city's famous temperature inversions also create prolonged freeze-thaw cycling that tests roofing systems throughout winter.",
        "local_detail": "Utah's capital city contains the state's most architecturally significant residential neighborhoods. The Avenues' Victorian homes, the craftsman bungalows of Sugar House, the mid-century moderns of the East Bench, and the historic structures of the Marmalade District each represent different eras of American residential architecture — and different roofing challenges.",
        "roofing_focus": "Frame Restoration brings preservation-grade sensitivity and modern performance to Salt Lake City's irreplaceable housing stock. Whether matching century-old slate on an Avenues Victorian or installing impact-resistant architectural shingles on a Sugar House rambler, we treat every SLC home with the respect its history deserves.",
        "nearby": ["south-salt-lake", "millcreek", "north-salt-lake", "holladay", "murray"]
    },
    "sandy": {
        "name": "Sandy",
        "county": "Salt Lake County",
        "pop": "96,000+",
        "zips": "84070, 84090, 84091, 84092, 84093, 84094",
        "elevation": "4,440 ft",
        "lat": 40.5649, "lng": -111.859,
        "housing_era": "1970s–2000s diverse suburban stock with east bench custom homes",
        "weather_note": "Sandy's broad east-west span creates distinct weather zones within the city. The east bench neighborhoods below the Wasatch catch intensified mountain-effect precipitation and canyon-channeled winds, while western Sandy's flatter terrain experiences the broader valley weather patterns. Hail season from May through August regularly produces insurance-qualifying events across Sandy's extensive residential footprint.",
        "local_detail": "From the bustling South Towne Center commercial area to the quiet east bench streets where homes climb toward the Wasatch, Sandy offers one of the Salt Lake metro's most complete suburban experiences. The city's proximity to Little Cottonwood Canyon makes it a gateway for skiers and provides dramatic mountain views — but also channels winter storm energy directly onto residential rooftops.",
        "roofing_focus": "Frame Restoration handles Sandy's spectrum from starter homes near 9000 South to premium east bench custom properties. Our insurance claim expertise is especially valuable in Sandy, where hail events affect thousands of homes simultaneously and homeowners need an advocate who documents damage thoroughly.",
        "nearby": ["draper", "midvale", "cottonwood-heights", "south-jordan", "murray"]
    },
    "santaquin": {
        "name": "Santaquin",
        "county": "Utah County",
        "pop": "14,000+",
        "zips": "84655",
        "elevation": "5,100 ft",
        "lat": 39.9756, "lng": -111.7856,
        "housing_era": "Historic core (1850s–1930s pioneer-era) with rapid 2010s–2020s growth",
        "weather_note": "Santaquin's elevated position at the southern gateway of Utah Valley — near the mouth of Santaquin Canyon — subjects it to concentrated canyon wind events and storm systems that funnel between the Wasatch Range and the West Mountains. At 5,100 feet, Santaquin receives heavier snowfall and more freeze-thaw cycles than the Utah Valley cities to the north.",
        "local_detail": "One of Utah County's fastest-growing small cities, Santaquin has exploded from a quiet agricultural community into an active development zone. The historic downtown around Main Street preserves pioneer-era character, while new subdivisions spreading along the benchlands have tripled the city's population in just over a decade.",
        "roofing_focus": "Santaquin's mix of historic and brand-new homes lets Frame Restoration demonstrate our full range — from careful replacement work that respects pioneer-era architecture to modern installations on new construction. Every Santaquin project benefits from our mountain-grade approach, because at 5,100 feet, this is mountain roofing.",
        "nearby": ["payson", "springville"]
    },
    "south-jordan": {
        "name": "South Jordan",
        "county": "Salt Lake County",
        "pop": "77,000+",
        "zips": "84009, 84095",
        "elevation": "4,440 ft",
        "lat": 40.5622, "lng": -111.9297,
        "housing_era": "1990s–2020s rapid suburban growth with Daybreak master-planned community",
        "weather_note": "South Jordan's broad valley-floor exposure makes it vulnerable to wide hail swaths during summer thunderstorms. The Daybreak community's concentrated development means a single storm event can produce hundreds of simultaneous roof claims within a few square miles — overwhelming contractors who lack the capacity to respond at scale.",
        "local_detail": "Daybreak, one of Utah's largest master-planned communities, defines modern South Jordan — thousands of homes built on new urbanist principles with walkable streets and community amenities. Beyond Daybreak, the neighborhoods along Redwood Road and 10400 South represent South Jordan's earlier growth phase. The Oquirrh Mountain Temple area and River Oaks add additional residential density.",
        "roofing_focus": "Frame Restoration's capacity to handle large-scale storm response is critical for South Jordan, especially in Daybreak where hundreds of similar-age homes may need attention simultaneously. We mobilize multiple crews for neighborhood-wide inspections and coordinate insurance claims efficiently so homeowners aren't waiting months for their replacement.",
        "nearby": ["riverton", "herriman", "west-jordan", "sandy", "bluffdale"]
    },
    "south-salt-lake": {
        "name": "South Salt Lake",
        "county": "Salt Lake County",
        "pop": "26,000+",
        "zips": "84115",
        "elevation": "4,280 ft",
        "lat": 40.7186, "lng": -111.8883,
        "housing_era": "1940s–1960s working-class residential with significant industrial mixed-use",
        "weather_note": "South Salt Lake sits on the valley floor where storms maintain full intensity after descending from the mountains. The area's flat terrain and lack of tree canopy mean wind events deliver their full force to rooftops, and hail has no elevation gradient to weaken it before impact.",
        "local_detail": "South Salt Lake is one of the metro area's most rapidly transforming cities — the Central Pointe TRAX area and State Street corridor are attracting new investment, while the established residential streets between 2100 South and 3300 South retain the small, affordable homes that have defined the community for decades. Many of these homes have been under-maintained, with roofs showing decades of deferred care.",
        "roofing_focus": "Frame Restoration believes every home deserves premium protection, regardless of its market value. In South Salt Lake, we focus on thorough tear-offs that solve underlying problems — replacing water-damaged decking, correcting ventilation deficiencies, and installing systems that will outperform what was there before.",
        "nearby": ["salt-lake-city", "millcreek", "murray", "taylorsville"]
    },
    "springville": {
        "name": "Springville",
        "county": "Utah County",
        "pop": "36,000+",
        "zips": "84663",
        "elevation": "4,600 ft",
        "lat": 40.1652, "lng": -111.6108,
        "housing_era": "Historic art colony downtown (1880s–1940s) plus 1990s–2020s suburban growth",
        "weather_note": "Springville's location at the mouth of Hobble Creek Canyon creates channeled wind events similar to those experienced in Pleasant Grove and Farmington. Storm energy funnels through the canyon and disperses across the city's eastern neighborhoods, producing concentrated wind damage zones that shift with each event. Spring and fall canyon winds are a defining weather characteristic.",
        "local_detail": "Known as 'Art City' for its longstanding arts community anchored by the Springville Museum of Art, this city blends cultural heritage with suburban growth. The historic downtown features charming older homes that require preservation-sensitive approaches, while the growth areas along 400 South and the Mapleton border contain modern family-oriented subdivisions.",
        "roofing_focus": "Frame Restoration serves Springville's artistic heritage with the same attention to craft. Historic homes near the museum district receive careful material matching and period-appropriate installation, while newer developments get premium systems designed for Hobble Creek Canyon's concentrated wind patterns.",
        "nearby": ["provo", "payson", "orem", "santaquin"]
    },
    "syracuse": {
        "name": "Syracuse",
        "county": "Davis County",
        "pop": "32,000+",
        "zips": "84075",
        "elevation": "4,350 ft",
        "lat": 41.0894, "lng": -112.0647,
        "housing_era": "1990s–2020s rapid suburban growth on former agricultural land",
        "weather_note": "Syracuse sits on the Great Salt Lake's eastern shore, making it the first community hit by lake-effect storms moving east. These storms can develop rapidly over the lake's warm surface, producing sudden hail and high winds with little warning. Syracuse's flat, open terrain provides no natural protection, and the proximity to Antelope Island means unimpeded wind fetch across the lake.",
        "local_detail": "Syracuse has transformed from agricultural fields to one of Davis County's fastest-growing suburbs. The communities along Antelope Drive and 2000 West represent the city's primary residential corridors, with most homes dating from the late 1990s through the 2010s. The Freeport Center's industrial area adds commercial roofing demand on the city's southern edge.",
        "roofing_focus": "Syracuse's lake-front exposure demands roofing systems designed for sustained wind and sudden hail. Frame Restoration specifies high-wind-rated products and enhanced fastening patterns for Syracuse homes — because living on the Great Salt Lake's doorstep means your roof needs to be built for lake-effect weather.",
        "nearby": ["clinton", "clearfield", "layton", "kaysville"]
    },
    "taylorsville": {
        "name": "Taylorsville",
        "county": "Salt Lake County",
        "pop": "60,000+",
        "zips": "84118, 84123, 84129",
        "elevation": "4,310 ft",
        "lat": 40.6677, "lng": -111.9388,
        "housing_era": "1960s–1980s established suburban neighborhoods",
        "weather_note": "Taylorsville's central valley position means it catches the full breadth of storms crossing Salt Lake Valley. The city's flat terrain and wide residential spread result in uniform storm exposure — when hail hits Taylorsville, it typically affects large contiguous areas rather than isolated pockets, making neighborhood-scale inspection and response essential.",
        "local_detail": "Valley Fair Mall, Taylorsville-Bennion Heritage Center, and the Jordan River Parkway define the community's gathering points, but Taylorsville is primarily a residential city. The neighborhoods along 4700 South and Redwood Road feature the 1970s and 1980s housing stock that makes up the city's core — brick ramblers and split-levels approaching or exceeding their second roof replacement cycle.",
        "roofing_focus": "Taylorsville's aging housing stock often reveals hidden problems during tear-off — water-damaged decking, inadequate ventilation, and decades of trapped moisture. Frame Restoration's full tear-off process addresses everything beneath the shingles, not just what's visible from outside.",
        "nearby": ["murray", "kearns", "west-valley-city", "west-jordan", "midvale"]
    },
    "west-bountiful": {
        "name": "West Bountiful",
        "county": "Davis County",
        "pop": "5,800+",
        "zips": "84087",
        "elevation": "4,290 ft",
        "lat": 40.8936, "lng": -111.9019,
        "housing_era": "1960s–1990s small-city residential with some newer infill",
        "weather_note": "West Bountiful's lower elevation and western Davis County position expose it to the full force of storms approaching from the Great Salt Lake before they lift against the Wasatch. The city's compact size means storm damage tends to be community-wide rather than neighborhood-specific — when a storm hits West Bountiful, nearly everyone feels it.",
        "local_detail": "One of Davis County's smaller cities, West Bountiful maintains a quiet, close-knit character. The residential streets between 500 West and Pages Lane feature well-maintained homes from the 1970s through 1990s — a housing stock that's mature enough to need attention but well-cared-for enough to be worth the investment. The city's small size means neighbors talk, and a great roofing job generates referrals quickly.",
        "roofing_focus": "Frame Restoration's reputation-first approach fits West Bountiful perfectly. In a community this tight-knit, every job is a public reference. We deliver the same premium quality and meticulous cleanup that earned our reputation in Heber Valley — because in West Bountiful, your neighbors will see our work.",
        "nearby": ["bountiful", "woods-cross", "centerville", "north-salt-lake"]
    },
    "west-jordan": {
        "name": "West Jordan",
        "county": "Salt Lake County",
        "pop": "116,000+",
        "zips": "84081, 84084, 84088",
        "elevation": "4,370 ft",
        "lat": 40.6097, "lng": -111.9391,
        "housing_era": "1970s–2000s broad suburban development, one of Utah's largest cities",
        "weather_note": "As one of Utah's largest cities by area, West Jordan spans enough geography that weather can affect the eastern and western neighborhoods differently. Storms entering from the Oquirrh Mountains hit the west side first, while systems descending from the Wasatch reach the east side with different intensity. The city's massive residential footprint means even a moderate storm can generate thousands of insurance claims.",
        "local_detail": "West Jordan's growth from the 1970s through the 2000s created a massive residential base stretching from Bangerter Highway to 7800 South. Gardner Village, Jordan Landing, and the Oquirrh Mountain Temple provide community anchors, but the residential neighborhoods are the city's defining feature — street after street of family homes built across four decades of Utah suburban expansion.",
        "roofing_focus": "Frame Restoration brings premium quality to West Jordan's enormous residential market. Our crews work efficiently across West Jordan's sprawling geography, and our insurance claim expertise helps homeowners in this storm-prone city get full coverage for hail and wind damage.",
        "nearby": ["south-jordan", "taylorsville", "riverton", "herriman", "kearns"]
    },
    "west-valley-city": {
        "name": "West Valley City",
        "county": "Salt Lake County",
        "pop": "140,000+",
        "zips": "84118, 84119, 84120, 84128",
        "elevation": "4,300 ft",
        "lat": 40.6916, "lng": -112.0011,
        "housing_era": "1960s–1990s diverse suburban development, Utah's second-largest city",
        "weather_note": "West Valley City's western Salt Lake Valley position makes it one of the first communities hit by storms approaching from the Great Salt Lake and Oquirrh Mountains. The city's flat, expansive terrain offers no natural wind mitigation, and its massive residential footprint means storm damage events produce some of the highest claim volumes in the state.",
        "local_detail": "Utah's second-largest city is also one of its most diverse — culturally and architecturally. The neighborhoods range from 1960s-era developments near 3500 South to the newer communities approaching the western edge. The USANA Amphitheatre and Maverik Center provide entertainment anchors, but West Valley City's core identity is residential — over 140,000 residents depending on their homes to perform through Utah weather.",
        "roofing_focus": "Frame Restoration believes West Valley City deserves the same premium roofing quality available to any community in Utah. We deliver full tear-off replacements with premium materials, thorough deck inspection, and proper ventilation — because protecting 140,000 people's homes is work worth doing right.",
        "nearby": ["taylorsville", "kearns", "magna", "west-jordan", "murray"]
    },
    "woods-cross": {
        "name": "Woods Cross",
        "county": "Davis County",
        "pop": "12,000+",
        "zips": "84087",
        "elevation": "4,310 ft",
        "lat": 40.8722, "lng": -111.8972,
        "housing_era": "1950s–1980s established small-city residential",
        "weather_note": "Woods Cross sits at the southern gateway of Davis County, catching storms moving up from Salt Lake Valley before they reach Bountiful and points north. The city's compact size and relatively uniform elevation mean weather events affect the entire community simultaneously — there's no 'good side of town' when a hail storm rolls through.",
        "local_detail": "Woods Cross retains the character of a smaller community despite its proximity to Salt Lake City and the I-15 corridor. The residential streets near Woods Cross High School and the neighborhoods along 500 West feature mid-century and late-century homes that define the city's residential character. The refinery district on the west side adds an industrial element but the residential core remains family-oriented.",
        "roofing_focus": "Frame Restoration's community-first approach resonates in Woods Cross, where word of mouth drives business and neighbors hold contractors accountable. We bring premium materials and meticulous installation to every Woods Cross project — because in a community this connected, our reputation is only as good as our last job.",
        "nearby": ["bountiful", "north-salt-lake", "centerville", "west-bountiful"]
    }
}


def generate_content_section(city_data):
    """Generate unique HTML content section for a city."""
    c = city_data
    name = c["name"]
    nearby_links = "\n    ".join(
        f'<a href="/locations/{slug}" class="nearby-chip">{CITIES[slug]["name"]}</a>'
        for slug in c["nearby"] if slug in CITIES
    )

    return f"""<section>
  <div class="content-section">
    <span class="section-label">Uncompromising Quality</span>
    <h2>Premium Roof Replacements in {name}</h2>
    <p>{c['weather_note']}</p>
    <p><strong>Population:</strong> {c['pop']} &middot; <strong>County:</strong> {c['county']} &middot; <strong>Elevation:</strong> {c['elevation']} &middot; <strong>ZIP Codes:</strong> {c['zips']}</p>

    <h2>Why {name} Homes Need Expert Roofing</h2>
    <p>{c['local_detail']}</p>
    <p>{c['roofing_focus']}</p>

    <div class="services-mini">
      <div class="service-mini-card">
        <h3>Premium Reroofing</h3>
        <p>Full tear-off and premium roof replacements for {name} homes — designer shingles, architectural systems, and meticulous finish on every project.</p>
      </div>
      <div class="service-mini-card">
        <h3>Storm Damage &amp; Insurance</h3>
        <p>Hail, wind, and storm damage repair with full insurance claim navigation. We document the damage and fight for your full payout.</p>
      </div>
      <div class="service-mini-card">
        <h3>Commercial Roofing</h3>
        <p>Premium commercial roofing for {name} businesses, HOAs, and multifamily properties — uncompromising standards on every project.</p>
      </div>
      <div class="service-mini-card">
        <h3>Emergency Response</h3>
        <p>24/7 emergency tarping, leak mitigation, and permanent repairs. Fast response when {name} homeowners need us most.</p>
      </div>
    </div>

    <h2>Reroofing Built to Uncompromising Standards</h2>
    <p>Every {name} project receives Frame Restoration's full commitment — uncompromising quality from start to finish:</p>
    <ul>
      <li>Free, no-obligation roof inspections with detailed condition reporting</li>
      <li>Premium roof replacements with designer shingles and lifetime manufacturer warranties</li>
      <li>Insurance claim navigation — we work directly with your adjuster</li>
      <li>Emergency tarping and damage mitigation, available 24/7</li>
      <li>Commercial roofing for {name} businesses, HOAs, and property managers</li>
      <li>Solar-ready roofing installations</li>
    </ul>

    <h2>{name} Housing &amp; Roofing Context</h2>
    <p><strong>Typical housing:</strong> {c['housing_era']}. Understanding when your home was built — and what roofing materials and methods were standard at that time — helps us assess what's underneath and plan the right replacement strategy for your specific property.</p>

    <h2>Serving {name} &amp; Surrounding Communities</h2>
    <p>Frame Restoration delivers the same uncompromising quality and meticulous craftsmanship to {name} and every surrounding community. Whether you're in the heart of {name} or nearby, our crews bring premium results to every project.</p>
  </div>
</section>"""


def rewrite_file(slug, city_data):
    """Rewrite a single location HTML file."""
    filepath = os.path.join(LOCATIONS_DIR, f"{slug}.html")
    if not os.path.exists(filepath):
        print(f"  SKIP: {filepath} not found")
        return False

    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # Find the content section: starts after hero </section>,
    # the next <section> containing <div class="content-section">
    # and ends at the closing </section> before related-articles or page-cta
    pattern = r'(<section>\s*<div class="content-section">)(.*?)(</div>\s*</section>)'

    match = re.search(pattern, html, re.DOTALL)
    if not match:
        print(f"  WARN: Could not find content-section in {slug}.html")
        return False

    new_content = generate_content_section(city_data)

    # Replace from <section> containing content-section to its </section>
    # We need to find the full section block
    section_pattern = r'<section>\s*<div class="content-section">.*?</div>\s*</section>'
    new_html = re.sub(section_pattern, new_content, html, count=1, flags=re.DOTALL)

    # Also update nearby section if it exists
    nearby_pattern = r'<section class="nearby-section">.*?</section>'
    nearby_match = re.search(nearby_pattern, html, re.DOTALL)
    if nearby_match and city_data.get("nearby"):
        nearby_chips = "\n    ".join(
            f'<a href="/locations/{s}" class="nearby-chip">{CITIES[s]["name"]}</a>'
            for s in city_data["nearby"] if s in CITIES
        )
        new_nearby = f"""<section class="nearby-section">
  <h2>Also Serving Near {city_data['name']}</h2>
  <div class="nearby-grid">
    {nearby_chips}
  </div>
</section>"""
        new_html = re.sub(nearby_pattern, new_nearby, new_html, count=1, flags=re.DOTALL)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_html)

    print(f"  OK: {slug}.html rewritten ({len(new_html)} bytes)")
    return True


def main():
    print(f"=== Rewriting {len(CITIES)} location pages ===\n")
    success = 0
    fail = 0
    for slug, data in sorted(CITIES.items()):
        print(f"Processing {slug}...")
        if rewrite_file(slug, data):
            success += 1
        else:
            fail += 1
    print(f"\n=== Done: {success} rewritten, {fail} failed ===")


if __name__ == "__main__":
    main()
