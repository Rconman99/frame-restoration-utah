#!/usr/bin/env python3
"""
Expand FAQ schemas on remaining 38 Frame Roofing Utah location pages.
Each city gets 12 city-specific FAQs with local weather, permits, HOA, insurance details.
"""
import json, re, os

BASE = "/Users/agenticmac/projects/frame-restoration-utah/locations"

# Remaining 38 cities with city-specific data
CITIES = {
    "alpine": {
        "name": "Alpine", "county": "Utah County", "zips": "84004", "pop": "10,500+", "elev": "4,980",
        "storm_detail": "Alpine's elevated position on the east bench of northern Utah County exposes it to intense Wasatch Range downdrafts and mountain-generated hailstorms. The city's higher elevation means heavier precipitation events and more freeze-thaw cycles from May through September.",
        "hoa_detail": "Alpine is known for strict HOAs and large-lot zoning. Most subdivisions require architectural review for any exterior modification, including roofing materials and colors. Frame Restoration provides HOA-compliant material packages and handles all pre-approval documentation.",
        "permit_detail": "Alpine City requires building permits for roof replacements, processed through the Alpine City Building Department under Utah County jurisdiction. Frame Restoration handles all permitting and coordinates required inspections.",
        "cost_range": "$14,000 to $35,000",
        "insurance_detail": "Alpine's larger custom homes mean higher replacement costs. Insurance claims require detailed documentation of damage scope across complex rooflines. Frame Restoration's thorough inspection process captures all damage — ridge caps, valleys, pipe boots, skylights — to maximize your claim payout.",
        "winter_detail": "Alpine's nearly 5,000-foot elevation brings heavy snow loads and extended freeze periods. Winter installations require careful scheduling around mountain weather. Enhanced ice-and-water shield coverage is essential on all eaves and north-facing slopes.",
        "emergency_detail": "Mountain storms can strike Alpine with little warning. Frame Restoration provides 24/7 emergency tarping and leak mitigation throughout Alpine.",
        "material_detail": "Alpine's elevation and wind exposure demand premium materials: Class 4 impact-resistant shingles, 130+ mph wind ratings, and enhanced underlayment. Many Alpine HOAs require designer-grade architectural shingles that match the community's upscale aesthetic.",
        "signs_detail": "Alpine homeowners should check for ice dam evidence on eaves, wind-lifted shingles from Wasatch downdrafts, granule accumulation in gutters, and cracked flashing around chimneys and valleys. The elevation accelerates UV degradation on south-facing slopes.",
        "timeline_detail": "Alpine reroofs take 2-5 days due to larger home sizes and complex rooflines. HOA approval may add 1-2 weeks. Insurance projects average 3-4 weeks."
    },
    "american-fork": {
        "name": "American Fork", "county": "Utah County", "zips": "84003", "pop": "33,000+", "elev": "4,554",
        "storm_detail": "American Fork sits at the mouth of American Fork Canyon, channeling mountain storms directly into residential areas. Hail events from May through August are common, with canyon-effect winds amplifying storm damage across the city's mix of historic and newer neighborhoods.",
        "hoa_detail": "American Fork has a mix of older non-HOA neighborhoods and newer developments with active CC&Rs. Subdivisions near the Meadows and along the canyon bench typically have architectural review requirements. Frame Restoration can verify your community's requirements.",
        "permit_detail": "American Fork City requires building permits for roof replacements. Permits are processed through the city's Community Development Department. Frame Restoration handles all paperwork and coordinates inspections.",
        "cost_range": "$8,000 to $22,000",
        "insurance_detail": "American Fork's canyon-mouth exposure generates frequent insurance claims. File within 72 hours of a storm, document damage with photos, and schedule a professional inspection. Frame Restoration coordinates with your adjuster to ensure full damage documentation.",
        "winter_detail": "American Fork Canyon channels cold air and heavy snow into the city. Winter installations are possible in mild windows but spring and fall are preferred for optimal material performance.",
        "emergency_detail": "Canyon storms can intensify rapidly over American Fork. Frame Restoration provides 24/7 emergency tarping and leak response across all American Fork neighborhoods.",
        "material_detail": "Class 4 impact-resistant shingles are recommended for American Fork's hail exposure. Canyon-adjacent homes benefit from high-wind-rated materials (130+ mph) due to canyon-effect gusts.",
        "signs_detail": "Watch for wind damage on canyon-facing roof planes, hail dimpling after summer storms, ice dam staining on north-facing eaves, and deteriorated flashing. Historic district homes may have multiple shingle layers that need full tear-off.",
        "timeline_detail": "Standard American Fork reroofs take 1-3 days. Insurance claim projects average 2-3 weeks from initial inspection to completion."
    },
    "bluffdale": {
        "name": "Bluffdale", "county": "Salt Lake County", "zips": "84065", "pop": "16,000+", "elev": "4,425",
        "storm_detail": "Bluffdale's position at the southern end of the Salt Lake Valley catches cross-valley storms moving between the Oquirrh and Wasatch ranges. The city's rapid residential growth means thousands of homes built with builder-grade roofing that's approaching its first replacement cycle. Hail season runs May through September.",
        "hoa_detail": "Most Bluffdale neighborhoods are newer developments with active HOAs. Communities like Day Ranch, Maple Hills, and areas near the Point of the Mountain have CC&Rs requiring architectural approval for roofing. Frame Restoration navigates Bluffdale HOA requirements regularly.",
        "permit_detail": "Bluffdale City requires building permits for roof replacements. Frame Restoration handles all permit applications through the city's Building Department and coordinates final inspections.",
        "cost_range": "$9,000 to $24,000",
        "insurance_detail": "Bluffdale's newer homes (many built 2005-2020) may be approaching their first reroof. Insurance covers storm damage regardless of roof age. Frame Restoration documents all hail and wind damage and handles the entire claim process.",
        "winter_detail": "Bluffdale's valley-floor position provides moderate winter conditions, though Point of the Mountain winds create year-round exposure. Roof replacements can be scheduled in mild winter windows.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency tarping and leak mitigation throughout Bluffdale, with rapid response across all neighborhoods.",
        "material_detail": "For Bluffdale's newer homes, upgrading from builder-grade 3-tab to Class 4 impact-resistant architectural shingles provides significant storm protection and can qualify for insurance premium discounts of 10-28%.",
        "signs_detail": "Bluffdale homeowners should check for premature aging on builder-grade shingles, hail dimpling after storms, wind-lifted edges (common near the Point of the Mountain), and granule loss in gutters.",
        "timeline_detail": "Bluffdale reroofs take 1-3 days. HOA approval may add 1-2 weeks. Insurance projects average 2-3 weeks."
    },
    "bountiful": {
        "name": "Bountiful", "county": "Davis County", "zips": "84010, 84011", "pop": "44,000+", "elev": "4,327",
        "storm_detail": "Bountiful's east bench position directly below the Wasatch Range creates concentrated storm exposure. Mountain-effect precipitation hits Bountiful harder than the valley floor, with hail and wind events common from May through August. The city's established neighborhoods have weathered decades of Utah storms.",
        "hoa_detail": "Bountiful's older neighborhoods generally have no HOA restrictions, giving homeowners full choice of materials and colors. Newer developments along the east bench and near 400 North may have CC&Rs. Frame Restoration can verify your specific requirements.",
        "permit_detail": "Bountiful City requires building permits for roof replacements, processed through the Bountiful Building Department under Davis County jurisdiction. Frame Restoration handles all permitting.",
        "cost_range": "$8,000 to $22,000",
        "insurance_detail": "Bountiful's older housing stock means many roofs have significant depreciation. Thorough storm damage documentation is critical to overcome depreciation deductions. Frame Restoration's detailed photo documentation and adjuster coordination helps maximize claim payouts for Bountiful homeowners.",
        "winter_detail": "Bountiful's east bench elevation brings heavier snow than the Davis County valley floor. Ice-and-water shield coverage on eaves is essential. Winter installations are possible during mild periods.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Bountiful and Davis County, with rapid tarping and leak mitigation.",
        "material_detail": "For Bountiful's mix of older and newer homes, architectural shingles with Class 4 impact resistance provide the best storm protection. Older homes may need deck assessment before new shingle installation.",
        "signs_detail": "Bountiful homeowners should watch for multiple shingle layers from past roof-overs, moss growth on north-facing slopes (common on east bench homes), sagging areas on older decks, and storm damage from Wasatch downdrafts.",
        "timeline_detail": "Bountiful reroofs take 1-3 days. Older homes needing deck repairs may add 1-2 days. Insurance projects average 2-3 weeks."
    },
    "centerville": {
        "name": "Centerville", "county": "Davis County", "zips": "84014", "pop": "18,000+", "elev": "4,314",
        "storm_detail": "Centerville's compact footprint along the Wasatch Front in Davis County means the entire city shares similar storm exposure. Mountain storms sweep across Centerville's residential areas with hail and high winds from May through August.",
        "hoa_detail": "Centerville has a moderate mix of HOA and non-HOA communities. Newer subdivisions typically have CC&Rs while established neighborhoods along Main Street and the east bench do not. Frame Restoration can verify your community's requirements.",
        "permit_detail": "Centerville City requires building permits for roof replacements. Frame Restoration handles all permit applications and inspections through the city's Building Department.",
        "cost_range": "$8,000 to $20,000",
        "insurance_detail": "Centerville homeowners should file storm damage claims within 72 hours. Frame Restoration documents all damage and coordinates with your adjuster to ensure nothing is missed in the claim process.",
        "winter_detail": "Centerville's east bench neighborhoods see heavier snow than the valley floor. Standard ice-and-water shield requirements apply. Winter installations are feasible during mild periods.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Centerville with rapid tarping and leak mitigation services.",
        "material_detail": "Class 4 impact-resistant architectural shingles are recommended for Centerville's Wasatch Front storm exposure. High-wind ratings protect against mountain downdrafts.",
        "signs_detail": "Watch for granule loss after hailstorms, curling shingles on homes built before 2000, and ice dam staining on east bench properties. Annual inspections are recommended after Utah's hail season.",
        "timeline_detail": "Centerville reroofs take 1-2 days for standard homes. Insurance projects average 2-3 weeks."
    },
    "clearfield": {
        "name": "Clearfield", "county": "Davis County", "zips": "84015, 84016", "pop": "32,000+", "elev": "4,334",
        "storm_detail": "Clearfield's position in the northern Davis County corridor exposes it to broad valley storm systems. Proximity to Hill Air Force Base's flat terrain means storms maintain energy across the area. Hail events occur regularly from May through August.",
        "hoa_detail": "Clearfield has relatively few HOA-governed neighborhoods compared to south valley cities. Most residential areas allow homeowner choice of roofing materials and colors. Some newer developments near Freeport Center may have CC&Rs.",
        "permit_detail": "Clearfield City requires building permits for roof replacements. Frame Restoration handles all permit applications through the city's Building Department.",
        "cost_range": "$7,000 to $18,000",
        "insurance_detail": "Clearfield's moderate home values keep replacement costs reasonable, but insurance should still cover storm damage in full. Frame Restoration documents all damage and handles the claim process.",
        "winter_detail": "Clearfield's Davis County valley position provides moderate winter conditions. Roof replacements are feasible year-round in mild weather windows.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Clearfield with rapid tarping and leak mitigation.",
        "material_detail": "Architectural shingles with Class 4 impact resistance provide excellent value for Clearfield homes. Standard ice-and-water shield coverage protects against Utah's freeze-thaw cycles.",
        "signs_detail": "Check for hail damage after summer storms, aging shingles on homes built before 2000, and wind-lifted edges. Military families on short rotations should verify roof condition before selling.",
        "timeline_detail": "Clearfield reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "clinton": {
        "name": "Clinton", "county": "Davis County", "zips": "84015", "pop": "23,000+", "elev": "4,310",
        "storm_detail": "Clinton's location in western Davis County exposes it to storms moving across the Great Salt Lake and Antelope Island corridor. The flat terrain offers little natural storm shelter. Hail and wind events occur from May through August.",
        "hoa_detail": "Clinton has a mix of established non-HOA neighborhoods and newer developments with CC&Rs. Frame Restoration can verify your specific community requirements.",
        "permit_detail": "Clinton City requires building permits for roof replacements. Frame Restoration handles all permit applications and coordinates inspections.",
        "cost_range": "$7,000 to $18,000",
        "insurance_detail": "Clinton homeowners should file claims promptly after storms. Frame Restoration provides thorough damage documentation and handles the insurance process from start to finish.",
        "winter_detail": "Clinton's valley-floor position provides moderate winter conditions suitable for roof replacements during mild weather windows.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Clinton with rapid tarping and leak repair.",
        "material_detail": "Wind-resistant shingles are especially important in Clinton due to the open terrain and lake-effect weather patterns. Class 4 impact-resistant options provide dual protection against hail and wind.",
        "signs_detail": "Clinton homeowners should watch for wind-lifted shingles from lake-effect winds, granule loss after hailstorms, and aging materials on homes built during the city's rapid 1990s-2000s growth.",
        "timeline_detail": "Clinton reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "farmington": {
        "name": "Farmington", "county": "Davis County", "zips": "84025", "pop": "25,000+", "elev": "4,314",
        "storm_detail": "Farmington's Wasatch Front location and Farmington Canyon mouth create concentrated storm patterns. Mountain storms funnel through the canyon and hit residential areas with amplified wind and hail from May through August.",
        "hoa_detail": "Farmington has significant HOA-governed development, especially in Station Park area and east bench neighborhoods. Many communities require architectural review for roofing materials. Frame Restoration provides HOA-compliant options.",
        "permit_detail": "Farmington City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Community Development Department.",
        "cost_range": "$9,000 to $25,000",
        "insurance_detail": "Farmington's canyon-mouth exposure generates frequent insurance claims. Frame Restoration documents canyon-effect damage patterns that adjusters may not recognize without professional assessment.",
        "winter_detail": "Farmington Canyon channels cold air and heavy snow into the city. Enhanced ice-and-water shield coverage is recommended, especially on canyon-facing roof planes.",
        "emergency_detail": "Canyon storms can intensify rapidly. Frame Restoration provides 24/7 emergency response throughout Farmington.",
        "material_detail": "Farmington's canyon exposure demands high-wind-rated shingles (130+ mph) and Class 4 impact resistance. Canyon-facing roof planes need enhanced underlayment and nailing patterns.",
        "signs_detail": "Check for wind damage on canyon-facing slopes, ice dam evidence on north-facing eaves, and hail damage after summer storms. East bench homes with steeper pitches require professional inspection access.",
        "timeline_detail": "Farmington reroofs take 1-3 days. Insurance projects average 2-4 weeks."
    },
    "heber-city": {
        "name": "Heber City", "county": "Wasatch County", "zips": "84032", "pop": "18,000+", "elev": "5,604",
        "storm_detail": "Heber City's 5,600-foot elevation in the Heber Valley creates intense mountain weather exposure. Heavy snowfall, dramatic temperature swings, and summer thunderstorms with hail are all common. The valley's geographic bowl shape can trap and intensify storm cells from May through September.",
        "hoa_detail": "Heber City has a range of HOA situations — from non-restrictive older neighborhoods to strict CC&Rs in newer master-planned communities like Red Ledges and Jordanelle developments. Frame Restoration works with all Heber Valley HOAs.",
        "permit_detail": "Heber City requires building permits for roof replacements, processed through Wasatch County Building Services. Mountain elevation means stricter snow load requirements apply. Frame Restoration ensures all installations meet mountain-grade building codes.",
        "cost_range": "$10,000 to $30,000",
        "insurance_detail": "Heber City's mountain climate generates frequent insurance claims from hail, wind, and heavy snow damage. The higher cost of materials and labor in mountain communities means thorough documentation is critical. Frame Restoration's headquarters is in Heber City — we know the local adjusters and claim patterns.",
        "winter_detail": "Heber City's 5,600-foot elevation means heavy snow (200+ inches annually in some years), extended freeze periods, and significant ice dam risk. Winter installations require careful scheduling. Enhanced underlayment and proper ventilation are critical.",
        "emergency_detail": "As Frame Restoration's home base, Heber City gets our fastest emergency response. 24/7 tarping and leak mitigation available year-round, including during heavy snow events.",
        "material_detail": "Heber City demands mountain-grade roofing: Class 4 impact-resistant shingles rated for extreme temperature swings (-20°F to 100°F), enhanced ice-and-water shield on all eaves, valleys, and penetrations, and proper ventilation to prevent ice dams. Metal roofing is also popular for snow shedding.",
        "signs_detail": "Heber City homeowners should check for ice dam damage on eaves every spring, inspect for heavy-snow stress cracks, look for granule loss from hail, and assess ventilation adequacy. The mountain UV intensity accelerates shingle aging on south-facing slopes.",
        "timeline_detail": "Heber City reroofs take 2-4 days depending on complexity. Mountain weather can cause scheduling delays. Insurance projects average 2-4 weeks."
    },
    "herriman": {
        "name": "Herriman", "county": "Salt Lake County", "zips": "84096", "pop": "55,000+", "elev": "4,856",
        "storm_detail": "Herriman's southwest Salt Lake County position and elevated terrain catch storms sweeping off the Oquirrh Mountains. The city's rapid growth means tens of thousands of newer homes are exposed to frequent hail events from May through September.",
        "hoa_detail": "Herriman is predominantly newer development with active HOAs throughout. Most communities require architectural approval for roofing. Frame Restoration has extensive experience with Herriman's various HOA architectural review processes.",
        "permit_detail": "Herriman City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Building Department.",
        "cost_range": "$9,000 to $24,000",
        "insurance_detail": "Herriman's newer homes (many built 2005-2020) with builder-grade roofing are approaching their first replacement cycle. Insurance covers storm damage at any age. Frame Restoration documents all damage for maximum claim recovery.",
        "winter_detail": "Herriman's higher elevation (4,856 feet) means colder temperatures and heavier snow than the valley floor. Enhanced ice-and-water shield is recommended. Mild winter windows allow installations.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Herriman with rapid tarping and damage mitigation.",
        "material_detail": "Upgrading from builder-grade to Class 4 impact-resistant architectural shingles is the smartest investment for Herriman homeowners — better storm protection plus potential insurance premium discounts of 10-28%.",
        "signs_detail": "Herriman's newer homes may show premature aging if built with builder-grade materials. Check for hail dimpling, wind-lifted edges, and granule loss. Homes built 2005-2012 are entering the replacement window.",
        "timeline_detail": "Herriman reroofs take 1-3 days. HOA approval typically takes 1-2 weeks. Insurance projects average 2-3 weeks."
    },
    "highland": {
        "name": "Highland", "county": "Utah County", "zips": "84003", "pop": "19,000+", "elev": "4,757",
        "storm_detail": "Highland's elevated position along the Alpine-Highland bench creates exposure to both Wasatch Range storms and cross-valley weather systems. The city's larger lots and custom homes face significant hail and wind events from May through August.",
        "hoa_detail": "Highland is known for strict zoning and active HOAs. Most subdivisions require architectural review for roofing changes, with specific material and color requirements. Frame Restoration provides HOA-compliant packages for Highland communities.",
        "permit_detail": "Highland City requires building permits for roof replacements. The city's stricter zoning regulations mean compliance documentation is important. Frame Restoration handles all permitting.",
        "cost_range": "$12,000 to $32,000",
        "insurance_detail": "Highland's larger homes with complex rooflines mean higher replacement costs. Detailed damage documentation is essential for full insurance recovery. Frame Restoration captures all damage across Highland's typically complex roof geometries.",
        "winter_detail": "Highland's elevated bench position brings heavier snow and more freeze-thaw cycling. Enhanced ice-and-water shield coverage is recommended on all eaves and valleys.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Highland with rapid tarping and leak mitigation.",
        "material_detail": "Highland homes typically require premium materials: designer-grade architectural shingles, Class 4 impact resistance, and colors approved by the community's architectural standards. Frame Restoration stocks Highland-appropriate premium options.",
        "signs_detail": "Highland homeowners should inspect for wind-lifted shingles, ice dam staining on eaves, granule loss, and deteriorated flashing around the complex roof penetrations common on larger homes.",
        "timeline_detail": "Highland reroofs take 2-5 days due to larger home sizes. HOA approval adds 1-2 weeks. Insurance projects average 3-4 weeks."
    },
    "holladay": {
        "name": "Holladay", "county": "Salt Lake County", "zips": "84117, 84121, 84124", "pop": "31,000+", "elev": "4,380",
        "storm_detail": "Holladay's east bench position in the central Salt Lake Valley catches Wasatch Range storms as they descend. The Cottonwood Mall area and neighborhoods stretching toward the mountains experience concentrated hail and wind from May through August.",
        "hoa_detail": "Holladay has a mix — older Cottonwood neighborhoods have no HOA while newer townhome and condo developments typically do. Frame Restoration verifies requirements for each specific property.",
        "permit_detail": "Holladay City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Building Department.",
        "cost_range": "$9,000 to $26,000",
        "insurance_detail": "Holladay's established homes with mature landscaping and larger roof areas benefit from Frame Restoration's detailed documentation process. We ensure all damage — including hard-to-see areas behind trees and dormers — is captured for your insurance claim.",
        "winter_detail": "Holladay's east bench elevation means moderately heavier snow than the valley floor. Standard ice-and-water shield requirements apply. Winter installations are possible in mild periods.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Holladay with rapid tarping and leak repair.",
        "material_detail": "Holladay's mix of architectural styles benefits from premium material options. Class 4 impact-resistant shingles provide storm protection, and the wide selection of designer colors helps maintain Holladay's established neighborhood aesthetics.",
        "signs_detail": "Holladay homeowners should watch for aging on mature homes (many built 1950s-1980s), multiple shingle layers from past roof-overs, and storm damage patterns typical of east bench exposure.",
        "timeline_detail": "Holladay reroofs take 1-3 days. Insurance projects average 2-3 weeks."
    },
    "kaysville": {
        "name": "Kaysville", "county": "Davis County", "zips": "84037", "pop": "33,000+", "elev": "4,348",
        "storm_detail": "Kaysville's central Davis County position along the Wasatch Front exposes it to mountain-generated storms. Hail events sweep across Kaysville's residential neighborhoods regularly from May through August, often continuing into the northern Davis corridor.",
        "hoa_detail": "Kaysville has a moderate number of HOA communities, primarily in newer east-side developments. Many established neighborhoods have no HOA restrictions. Frame Restoration can verify your specific requirements.",
        "permit_detail": "Kaysville City requires building permits for roof replacements. Frame Restoration handles all permit applications and coordinates inspections.",
        "cost_range": "$8,000 to $22,000",
        "insurance_detail": "Kaysville's frequent hail exposure means insurance companies are familiar with claims from this area. Frame Restoration documents all damage and handles the full claim process to maximize your payout.",
        "winter_detail": "Kaysville's Davis County valley position provides moderate winter conditions. Standard ice-and-water shield requirements apply. Installations are feasible during mild winter windows.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Kaysville and Davis County.",
        "material_detail": "Class 4 impact-resistant architectural shingles provide the best protection for Kaysville's regular hail exposure. High-wind ratings protect against Wasatch Front gusts.",
        "signs_detail": "Check for hail damage after summer storms, aging shingles on homes 20+ years old, wind-lifted edges on west-facing slopes, and deteriorated flashing around chimneys and vents.",
        "timeline_detail": "Kaysville reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "kearns": {
        "name": "Kearns", "county": "Salt Lake County", "zips": "84118", "pop": "36,000+", "elev": "4,304",
        "storm_detail": "Kearns' central west valley location catches storms sweeping across from the Oquirrh Mountains. The flat terrain provides no natural shelter, exposing Kearns' residential areas to the full force of hail and wind events from May through September.",
        "hoa_detail": "Kearns has relatively few HOA-governed neighborhoods, giving most homeowners full choice of roofing materials and colors without architectural review requirements.",
        "permit_detail": "Kearns falls under Salt Lake County jurisdiction for building permits. Frame Restoration handles all county permit applications for roof replacements.",
        "cost_range": "$7,000 to $18,000",
        "insurance_detail": "Kearns' moderate home values mean affordable replacement costs, but insurance should cover storm damage in full. Frame Restoration documents all damage and handles the entire claim process at no extra cost.",
        "winter_detail": "Kearns' valley-floor position provides moderate winter conditions suitable for roof replacements during mild weather windows.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Kearns with rapid tarping and leak mitigation.",
        "material_detail": "Architectural shingles with Class 4 impact resistance provide excellent value for Kearns homeowners — better storm protection than builder-grade materials at a reasonable upgrade cost.",
        "signs_detail": "Kearns homeowners should check for aging shingles (many homes have 1970s-1990s original roofs), hail damage after storms, and signs of poor ventilation like ice dams or attic heat buildup.",
        "timeline_detail": "Kearns reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "layton": {
        "name": "Layton", "county": "Davis County", "zips": "84040, 84041", "pop": "80,000+", "elev": "4,396",
        "storm_detail": "Layton's position as Davis County's largest city means its extensive residential footprint catches the full range of Wasatch Front storms. Proximity to Hill Air Force Base and the broad northern Davis corridor means storms maintain intensity across the area. Hail events are frequent from May through August.",
        "hoa_detail": "Layton has a mix of established non-HOA neighborhoods and newer developments with CC&Rs. Areas near East Gate, Kays Creek, and north Layton developments typically have architectural review requirements.",
        "permit_detail": "Layton City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Building Division.",
        "cost_range": "$7,500 to $20,000",
        "insurance_detail": "Layton's large residential base generates significant insurance claims during hail season. Frame Restoration provides efficient, thorough damage documentation and handles the claim process from inspection to completion.",
        "winter_detail": "Layton's northern Davis County position means moderate winter conditions. Standard ice-and-water shield requirements apply. Installations are feasible year-round in mild weather.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Layton's extensive residential areas.",
        "material_detail": "Class 4 impact-resistant architectural shingles provide the best value for Layton's regular hail exposure. The wide selection of styles and colors works for both established and newer neighborhoods.",
        "signs_detail": "Layton homeowners should inspect for hail damage after storms, check for aging on homes 20+ years old, look for wind-lifted shingles, and assess flashing condition around vents and chimneys.",
        "timeline_detail": "Layton reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "lehi": {
        "name": "Lehi", "county": "Utah County", "zips": "84043", "pop": "75,000+", "elev": "4,550",
        "storm_detail": "Lehi's position at the north end of Utah Valley catches storms from the Point of the Mountain corridor. The city's explosive growth — from rural community to one of Utah's fastest-growing cities — means a massive mix of housing ages exposed to hail events from May through September.",
        "hoa_detail": "Lehi's newer developments (Traverse Mountain, Thanksgiving Point area, North Shore) have active HOAs with architectural review requirements. Older Lehi neighborhoods along Main Street generally have no HOA restrictions.",
        "permit_detail": "Lehi City requires building permits for roof replacements. The city's rapid growth means the Building Department is busy — Frame Restoration expedites permit processing for our clients.",
        "cost_range": "$8,000 to $24,000",
        "insurance_detail": "Lehi's diverse housing ages mean insurance claims vary widely. Newer Traverse Mountain homes may have first-time claims, while older homes near Main Street face depreciation challenges. Frame Restoration tailors documentation to each situation.",
        "winter_detail": "Lehi's Point of the Mountain location creates significant wind exposure year-round. Winter installations require calm-wind windows. The higher Traverse Mountain areas see heavier snow.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Lehi, from Traverse Mountain to the original downtown area.",
        "material_detail": "Lehi's wind exposure at the Point of the Mountain makes high-wind-rated shingles essential. Class 4 impact resistance handles the frequent hail. Traverse Mountain homes benefit from enhanced underlayment for heavier snow loads.",
        "signs_detail": "Lehi homeowners should check for wind damage (especially near the Point of the Mountain), hail dimpling after storms, and premature aging on builder-grade shingles installed during the 2005-2015 building boom.",
        "timeline_detail": "Lehi reroofs take 1-3 days. HOA approval in newer developments adds 1-2 weeks. Insurance projects average 2-3 weeks."
    },
    "lindon": {
        "name": "Lindon", "county": "Utah County", "zips": "84042", "pop": "11,000+", "elev": "4,639",
        "storm_detail": "Lindon's position between Orem and Pleasant Grove along the Wasatch Front exposes it to mountain-generated storms. The city's smaller footprint means concentrated impact during hail events from May through August.",
        "hoa_detail": "Lindon has a mix of established non-HOA properties and newer developments with CC&Rs. Frame Restoration can verify your specific community's requirements.",
        "permit_detail": "Lindon City requires building permits for roof replacements under Utah County jurisdiction. Frame Restoration handles all permitting.",
        "cost_range": "$8,000 to $22,000",
        "insurance_detail": "Lindon homeowners should document storm damage promptly and contact their insurer within 72 hours. Frame Restoration provides professional damage assessment and handles the entire claim process.",
        "winter_detail": "Lindon's east bench areas see heavier snow than the valley floor. Standard ice-and-water shield requirements apply for the elevation.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Lindon.",
        "material_detail": "Class 4 impact-resistant architectural shingles with high-wind ratings provide optimal protection for Lindon's Wasatch Front exposure.",
        "signs_detail": "Check for storm damage after hail events, aging on roofs 20+ years old, and wind-lifted shingles on exposed west-facing slopes.",
        "timeline_detail": "Lindon reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "magna": {
        "name": "Magna", "county": "Salt Lake County", "zips": "84044", "pop": "29,000+", "elev": "4,280",
        "storm_detail": "Magna's position in the western Salt Lake Valley at the base of the Oquirrh Mountains means it's the first residential area hit by storms moving east across the valley. This front-line exposure creates significant hail and wind damage from May through September.",
        "hoa_detail": "Magna has relatively few HOA-governed neighborhoods. Most residential areas allow homeowner choice of roofing materials without architectural review.",
        "permit_detail": "Magna falls under Salt Lake County jurisdiction for building permits. Frame Restoration handles all county permit applications for roof replacements.",
        "cost_range": "$7,000 to $17,000",
        "insurance_detail": "Magna's front-line storm exposure means insurance companies expect claims from this area. Frame Restoration documents all damage and handles the claim process to ensure you receive your full payout.",
        "winter_detail": "Magna's valley-floor position provides moderate winter conditions. Roof replacements are feasible year-round during mild weather windows.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Magna with rapid tarping and leak mitigation.",
        "material_detail": "Impact-resistant shingles are strongly recommended for Magna's front-line storm exposure. Class 4 rated shingles can qualify for insurance premium discounts of 10-28%.",
        "signs_detail": "Magna homeowners should check for hail damage after every significant storm, aging on older homes (many built 1940s-1980s), and wind damage from Oquirrh Mountain gusts.",
        "timeline_detail": "Magna reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "midvale": {
        "name": "Midvale", "county": "Salt Lake County", "zips": "84047", "pop": "36,000+", "elev": "4,340",
        "storm_detail": "Midvale's central Salt Lake Valley position exposes it to broad valley storm systems. The city's mix of residential, commercial, and industrial properties all face hail and wind events from May through August.",
        "hoa_detail": "Midvale has a growing number of HOA communities, especially in newer townhome and mixed-use developments. Older single-family neighborhoods generally have no HOA restrictions.",
        "permit_detail": "Midvale City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Community Development Department.",
        "cost_range": "$7,500 to $20,000",
        "insurance_detail": "Midvale homeowners should file claims promptly after storms. Frame Restoration's thorough documentation helps maximize payouts, especially for older homes where depreciation may be a factor.",
        "winter_detail": "Midvale's central valley position provides moderate winter conditions. Standard ice-and-water shield requirements apply.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Midvale.",
        "material_detail": "Architectural shingles with Class 4 impact resistance provide excellent storm protection for Midvale's central valley exposure. A wide range of styles fit the city's diverse housing stock.",
        "signs_detail": "Midvale homeowners should check for aging shingles on older homes, hail damage after storms, and wind-lifted edges. Properties near I-15 may show accelerated wear from vibration and environmental exposure.",
        "timeline_detail": "Midvale reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "midway": {
        "name": "Midway", "county": "Wasatch County", "zips": "84049", "pop": "6,000+", "elev": "5,575",
        "storm_detail": "Midway's position in the Heber Valley at 5,575 feet creates mountain-grade weather exposure. The town's Swiss-village character belies its intense storm exposure — heavy snow, summer hail, and dramatic temperature swings from May through September.",
        "hoa_detail": "Midway has a mix of non-restricted properties and newer developments with CC&Rs. The town's architectural character means many homeowners prefer materials that match the community's aesthetic tradition.",
        "permit_detail": "Midway Town requires building permits for roof replacements under Wasatch County jurisdiction. Mountain building codes with enhanced snow load requirements apply. Frame Restoration ensures compliance.",
        "cost_range": "$10,000 to $28,000",
        "insurance_detail": "Midway's mountain climate generates frequent damage claims. Higher labor costs in mountain communities make thorough documentation essential. Frame Restoration's local Heber Valley presence means faster response and better adjuster relationships.",
        "winter_detail": "Midway's 5,575-foot elevation means heavy annual snowfall, extended freeze periods, and significant ice dam risk. Enhanced ice-and-water shield coverage and proper ventilation are critical. Winter installations require careful scheduling.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout the Heber Valley, including Midway, with rapid tarping and leak mitigation even during heavy snow events.",
        "material_detail": "Midway demands mountain-grade materials: Class 4 impact-resistant shingles rated for extreme temperature ranges, enhanced underlayment, and proper ventilation systems. Metal roofing is popular for snow-shedding performance.",
        "signs_detail": "Midway homeowners should inspect for ice dam damage every spring, check for heavy-snow stress on decking, look for UV-accelerated aging on south-facing slopes, and assess ventilation adequacy.",
        "timeline_detail": "Midway reroofs take 2-4 days. Mountain weather can cause delays. Insurance projects average 2-4 weeks."
    },
    "millcreek": {
        "name": "Millcreek", "county": "Salt Lake County", "zips": "84106, 84107, 84109, 84117", "pop": "63,000+", "elev": "4,357",
        "storm_detail": "Millcreek's broad east-side Salt Lake County position catches Wasatch Range storms as they descend into the valley. Millcreek Canyon funnels wind and precipitation directly into the community's residential areas. Hail and wind events are common from May through August.",
        "hoa_detail": "Millcreek is predominantly established single-family neighborhoods with minimal HOA governance. Most homeowners have full choice of roofing materials. Some newer townhome developments may have CC&Rs.",
        "permit_detail": "Millcreek City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Building Department.",
        "cost_range": "$8,000 to $24,000",
        "insurance_detail": "Millcreek's older housing stock requires careful documentation to overcome depreciation. Frame Restoration's detailed photo evidence and on-site adjuster meetings help Millcreek homeowners maximize their claim payouts.",
        "winter_detail": "Millcreek's east-side position means heavier snow than the valley floor, with Millcreek Canyon channeling cold air into the community. Standard to enhanced ice-and-water shield coverage is recommended.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Millcreek with rapid tarping and leak mitigation.",
        "material_detail": "Millcreek's diverse housing stock benefits from a range of material options. Class 4 impact-resistant architectural shingles provide the best storm protection. Older homes may need deck assessment before installation.",
        "signs_detail": "Millcreek homeowners should check for multiple shingle layers on older homes, canyon-wind damage, moss growth on shaded north-facing slopes, and aging on homes built in the 1950s-1970s era.",
        "timeline_detail": "Millcreek reroofs take 1-3 days. Older homes needing deck work may add 1-2 days. Insurance projects average 2-3 weeks."
    },
    "north-salt-lake": {
        "name": "North Salt Lake", "county": "Davis County", "zips": "84054", "pop": "21,000+", "elev": "4,310",
        "storm_detail": "North Salt Lake's position at the southern gateway to Davis County, directly below the Wasatch Range, exposes it to concentrated mountain storms. The narrow valley between the mountains and the lake funnels weather across the city. Hail events occur regularly from May through August.",
        "hoa_detail": "North Salt Lake has a mix of established and newer neighborhoods. Foxboro and newer east-side developments typically have HOA requirements. Older neighborhoods along Highway 89 generally do not.",
        "permit_detail": "North Salt Lake City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Building Department.",
        "cost_range": "$8,000 to $22,000",
        "insurance_detail": "North Salt Lake's concentrated storm exposure means timely claims are important. Frame Restoration documents all damage and handles the full insurance process.",
        "winter_detail": "North Salt Lake's northern position means slightly colder winters than the Salt Lake Valley center. Standard ice-and-water shield requirements apply.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout North Salt Lake.",
        "material_detail": "Class 4 impact-resistant shingles with high-wind ratings protect against the funneled storm patterns common in North Salt Lake's narrow valley position.",
        "signs_detail": "Check for hail damage after storms, wind-lifted shingles from valley-funneled gusts, and aging on homes built during the city's growth periods.",
        "timeline_detail": "North Salt Lake reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "ogden": {
        "name": "Ogden", "county": "Weber County", "zips": "84401, 84403, 84404, 84405, 84414", "pop": "87,000+", "elev": "4,299",
        "storm_detail": "Ogden's position at the convergence of the Ogden and Weber rivers, backed by the Wasatch Range, creates diverse storm exposure. Canyon-effect winds from Ogden Canyon and broad valley storms both hit the city's extensive residential footprint. Hail events run May through August.",
        "hoa_detail": "Ogden has a wide range — from no-HOA historic neighborhoods downtown to strict CC&Rs in newer east bench and South Ogden-adjacent developments. Frame Restoration verifies requirements for each property.",
        "permit_detail": "Ogden City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Community Development Division.",
        "cost_range": "$7,000 to $20,000",
        "insurance_detail": "Ogden's diverse housing ages mean insurance claims vary significantly. Historic district homes may face depreciation challenges. Frame Restoration tailors documentation to each situation for maximum claim recovery.",
        "winter_detail": "Ogden's proximity to major ski resorts reflects its serious winter weather. East bench homes see heavy snow loads. Standard to enhanced ice-and-water shield coverage is recommended based on elevation.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Ogden's extensive residential areas.",
        "material_detail": "Ogden's diverse housing stock requires material selection matched to each home's specific exposure. Canyon-adjacent homes need high-wind ratings. East bench properties benefit from enhanced underlayment. Historic homes may require period-appropriate aesthetic options.",
        "signs_detail": "Ogden homeowners should check for canyon-wind damage, aging on historic homes, ice dam evidence on east bench properties, and hail damage after summer storms.",
        "timeline_detail": "Ogden reroofs take 1-3 days depending on home size and complexity. Insurance projects average 2-3 weeks."
    },
    "orem": {
        "name": "Orem", "county": "Utah County", "zips": "84057, 84058, 84059", "pop": "97,000+", "elev": "4,756",
        "storm_detail": "Orem's position along the central Wasatch Front in Utah County exposes it to mountain-generated storms. Provo Canyon to the south and the broad valley to the west create diverse weather patterns. Hail events are common from May through August.",
        "hoa_detail": "Orem has a mix of older non-HOA neighborhoods and newer developments with CC&Rs. Developments near the university area and east Orem bench typically have architectural requirements.",
        "permit_detail": "Orem City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Community Development Department.",
        "cost_range": "$8,000 to $22,000",
        "insurance_detail": "Orem's large residential base generates significant insurance claims during hail season. Frame Restoration's efficient documentation process handles the volume while ensuring thorough coverage for each homeowner.",
        "winter_detail": "Orem's Utah County valley position provides moderate winter conditions. East bench areas see heavier snow. Standard ice-and-water shield requirements apply.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Orem's extensive residential areas.",
        "material_detail": "Class 4 impact-resistant architectural shingles provide the best value for Orem's regular hail exposure. East bench homes benefit from enhanced underlayment and wind-rated options.",
        "signs_detail": "Orem homeowners should inspect for hail damage after storms, check for aging on homes 20+ years old, and look for wind-lifted shingles on east bench properties.",
        "timeline_detail": "Orem reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "park-city": {
        "name": "Park City", "county": "Summit County", "zips": "84060, 84068, 84098", "pop": "8,500+", "elev": "6,902",
        "storm_detail": "Park City's 6,900-foot elevation creates the most extreme weather exposure in the Frame Roofing Utah service area. Mountain thunderstorms bring intense hail, the annual snowfall exceeds 300 inches in some years, and temperature swings from -15°F to 90°F stress roofing materials to their limits. Storm season runs May through October.",
        "hoa_detail": "Park City has extensive HOA governance across most neighborhoods. Deer Valley, The Canyons, Promontory, and virtually all resort-adjacent communities require strict architectural review. Material, color, and even contractor pre-approval may be required. Frame Restoration has deep experience with Park City HOAs.",
        "permit_detail": "Park City and Summit County require building permits for roof replacements. Mountain building codes have enhanced requirements for snow load, wind resistance, and fire rating. Frame Restoration ensures full code compliance.",
        "cost_range": "$15,000 to $45,000",
        "insurance_detail": "Park City's premium home values and extreme weather exposure mean insurance claims can be substantial. Thorough documentation of mountain-specific damage patterns is critical. Frame Restoration captures all damage for maximum claim recovery.",
        "winter_detail": "Park City's extreme elevation means extensive winter — heavy snow, deep freezes, and ice dam conditions lasting 5-6 months. Installations are limited to the June-October weather window in most years. Enhanced ice-and-water shield on the full roof deck is recommended.",
        "emergency_detail": "Mountain emergencies require specialized response. Frame Restoration provides 24/7 emergency tarping and leak mitigation in Park City, including during heavy snow events.",
        "material_detail": "Park City demands the highest-grade materials: Class 4 impact-resistant shingles rated for extreme cold (-20°F flexibility), maximum wind ratings (130+ mph), full-deck ice-and-water shield, and proper ridge ventilation. Metal roofing and synthetic slate are popular premium options.",
        "signs_detail": "Park City homeowners should check for ice dam damage every spring, inspect for heavy-snow stress on decking and trusses, look for UV degradation (intensified at altitude), and assess ventilation adequacy. The short building season means scheduling inspections early.",
        "timeline_detail": "Park City reroofs take 3-7 days due to home complexity and elevation challenges. HOA approval may add 2-4 weeks. Insurance projects average 3-6 weeks."
    },
    "payson": {
        "name": "Payson", "county": "Utah County", "zips": "84651", "pop": "21,000+", "elev": "4,551",
        "storm_detail": "Payson's position in the southern Utah Valley catches storms descending from the Wasatch Range and Nebo Loop corridor. The city's agricultural heritage means open terrain with minimal storm shelter. Hail events occur from May through August.",
        "hoa_detail": "Payson has relatively few HOA communities. Most residential neighborhoods allow homeowner choice of materials without architectural review. Some newer developments on the east side may have CC&Rs.",
        "permit_detail": "Payson City requires building permits for roof replacements under Utah County jurisdiction. Frame Restoration handles all permitting.",
        "cost_range": "$7,000 to $18,000",
        "insurance_detail": "Payson homeowners should document storm damage promptly. Frame Restoration provides professional assessment and handles the entire insurance claim process.",
        "winter_detail": "Payson's southern Utah Valley position provides moderate winter conditions. Standard ice-and-water shield requirements apply.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Payson.",
        "material_detail": "Class 4 impact-resistant architectural shingles provide excellent value and storm protection for Payson's open-terrain exposure.",
        "signs_detail": "Check for hail damage after summer storms, aging on homes 20+ years old, and wind damage from open-terrain exposure.",
        "timeline_detail": "Payson reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "pleasant-grove": {
        "name": "Pleasant Grove", "county": "Utah County", "zips": "84062", "pop": "38,000+", "elev": "4,606",
        "storm_detail": "Pleasant Grove sits at the base of Mount Timpanogos, creating concentrated storm exposure from mountain-generated weather. Canyon-effect winds and hail events hit the city from May through August with particular intensity.",
        "hoa_detail": "Pleasant Grove has a moderate number of HOA communities, primarily in newer east-side developments. Established neighborhoods along Main Street and the western portions generally have no HOA restrictions.",
        "permit_detail": "Pleasant Grove City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Building Department.",
        "cost_range": "$8,000 to $22,000",
        "insurance_detail": "Pleasant Grove's mountain-base exposure generates regular insurance claims. Frame Restoration documents all damage patterns — including canyon-effect wind damage that adjusters may not recognize — for maximum claim recovery.",
        "winter_detail": "Pleasant Grove's proximity to Mount Timpanogos means heavier snow than the valley floor. Enhanced ice-and-water shield is recommended for east-facing and north-facing slopes.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Pleasant Grove.",
        "material_detail": "High-wind-rated shingles (130+ mph) and Class 4 impact resistance are recommended for Pleasant Grove's mountain-base exposure. Enhanced underlayment protects against the heavier precipitation.",
        "signs_detail": "Watch for wind damage from mountain downdrafts, ice dam staining on east-facing eaves, hail dimpling after storms, and aging on homes built during the 1990s-2000s growth period.",
        "timeline_detail": "Pleasant Grove reroofs take 1-3 days. Insurance projects average 2-3 weeks."
    },
    "provo": {
        "name": "Provo", "county": "Utah County", "zips": "84601, 84602, 84604, 84606", "pop": "115,000+", "elev": "4,551",
        "storm_detail": "Provo's position at the mouth of Provo Canyon creates one of Utah County's most concentrated storm funnels. Canyon-effect winds and mountain-generated hail hit the city's diverse residential areas from May through August. The east bench neighborhoods face the most intense exposure.",
        "hoa_detail": "Provo has a wide range — from no-HOA student housing areas to strict CC&Rs in east bench developments and newer subdivisions near Rock Canyon. Frame Restoration verifies requirements for each property.",
        "permit_detail": "Provo City requires building permits for roof replacements. The city's Building Division processes permits and requires final inspection. Frame Restoration handles all paperwork.",
        "cost_range": "$7,500 to $24,000",
        "insurance_detail": "Provo's canyon-mouth exposure generates frequent insurance claims. Frame Restoration's documentation process captures canyon-effect damage patterns that standard adjusters may miss. We coordinate directly with your adjuster on-site.",
        "winter_detail": "Provo Canyon channels cold air and heavy snow into the city. East bench homes see heavier winter conditions. Enhanced ice-and-water shield coverage is recommended based on elevation and exposure.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Provo's extensive residential footprint.",
        "material_detail": "Provo's canyon exposure demands high-wind-rated shingles and Class 4 impact resistance. East bench homes benefit from enhanced underlayment and proper ventilation to prevent ice dams.",
        "signs_detail": "Provo homeowners should check for canyon-wind damage, hail dimpling after storms, ice dam evidence on east bench homes, and aging on the city's extensive older housing stock.",
        "timeline_detail": "Provo reroofs take 1-3 days. Insurance projects average 2-3 weeks."
    },
    "riverton": {
        "name": "Riverton", "county": "Salt Lake County", "zips": "84065", "pop": "44,000+", "elev": "4,459",
        "storm_detail": "Riverton's south valley position catches storms from both the Oquirrh and Wasatch ranges. The city's rapid residential growth means a large inventory of homes exposed to frequent hail events from May through September.",
        "hoa_detail": "Riverton has numerous HOA-governed developments. Most subdivisions built after 1995 have CC&Rs with architectural review requirements for roofing. Frame Restoration navigates Riverton HOA approval processes regularly.",
        "permit_detail": "Riverton City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Building Department.",
        "cost_range": "$9,000 to $24,000",
        "insurance_detail": "Riverton's storm corridor position means insurance companies are familiar with claims from this area. Frame Restoration documents all damage and handles the full claim process for Riverton homeowners.",
        "winter_detail": "Riverton's south valley position provides moderate winter conditions. Standard ice-and-water shield requirements apply. Installations are feasible during mild winter windows.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Riverton.",
        "material_detail": "Class 4 impact-resistant architectural shingles provide excellent storm protection for Riverton's cross-valley hail exposure. HOA-approved options are available for all major Riverton developments.",
        "signs_detail": "Check for hail damage after storms, premature aging on builder-grade shingles from the 2000s-2010s building boom, and wind-lifted edges on exposed roof planes.",
        "timeline_detail": "Riverton reroofs take 1-3 days. HOA approval adds 1-2 weeks. Insurance projects average 2-3 weeks."
    },
    "salt-lake-city": {
        "name": "Salt Lake City", "county": "Salt Lake County", "zips": "84101-84199", "pop": "200,000+", "elev": "4,226",
        "storm_detail": "Salt Lake City's expansive geography creates diverse storm exposure — from the Capitol Hill and Avenues neighborhoods directly below the Wasatch to the west side's open valley terrain. Storms sweeping across the valley hit different neighborhoods with varying intensity. Hail season runs May through August.",
        "hoa_detail": "Salt Lake City has minimal HOA governance in most neighborhoods. The Avenues, Sugar House, Liberty Park, and most established areas have no HOA. Some newer mixed-use and townhome developments may have CC&Rs. Historic districts have preservation guidelines that may affect material choices.",
        "permit_detail": "Salt Lake City requires building permits for roof replacements. Historic district properties may require additional review from the Historic Landmarks Commission. Frame Restoration handles all permitting and historic compliance requirements.",
        "cost_range": "$8,000 to $28,000",
        "insurance_detail": "Salt Lake City's diverse housing stock creates varied insurance claim situations. Historic Avenues homes, Sugar House bungalows, and modern downtown condos all require different documentation approaches. Frame Restoration tailors the claim process to each property type.",
        "winter_detail": "Salt Lake City's famous 'Greatest Snow on Earth' affects roofing significantly. East-side neighborhoods see heavier snow. Proper ventilation and ice-and-water shield are critical for the city's many older homes.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response across all Salt Lake City neighborhoods, from the Avenues to the west side.",
        "material_detail": "Salt Lake City's diverse architecture demands material flexibility. Historic homes may need period-appropriate options. Modern properties can leverage Class 4 impact-resistant technology. Frame Restoration matches materials to each neighborhood's character and each home's specific exposure.",
        "signs_detail": "Salt Lake City homeowners should check for aging on the city's extensive older housing stock, ice dam evidence on historic homes with limited ventilation, hail damage after storms, and deteriorated flashing on complex older rooflines.",
        "timeline_detail": "Salt Lake City reroofs take 1-4 days depending on property type. Historic district reviews may add 2-4 weeks. Insurance projects average 2-4 weeks."
    },
    "santaquin": {
        "name": "Santaquin", "county": "Utah County", "zips": "84655", "pop": "13,000+", "elev": "5,108",
        "storm_detail": "Santaquin's elevated position in southern Utah County, near the Wasatch Range foothills, creates concentrated storm exposure. The city's higher elevation means more intense precipitation events and hail from May through August.",
        "hoa_detail": "Santaquin has minimal HOA governance in established neighborhoods. Newer developments may have CC&Rs. Frame Restoration can verify your specific requirements.",
        "permit_detail": "Santaquin City requires building permits for roof replacements under Utah County jurisdiction. Frame Restoration handles all permitting.",
        "cost_range": "$7,500 to $20,000",
        "insurance_detail": "Santaquin homeowners should file claims promptly after storms. Frame Restoration provides professional damage documentation and handles the insurance process.",
        "winter_detail": "Santaquin's 5,100-foot elevation means heavier snow and longer freeze periods than the valley floor. Enhanced ice-and-water shield coverage is recommended.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Santaquin.",
        "material_detail": "Class 4 impact-resistant shingles with enhanced underlayment provide optimal protection for Santaquin's elevated position and storm exposure.",
        "signs_detail": "Check for ice dam damage, hail dimpling after storms, aging on homes 20+ years old, and wind damage from foothill exposure.",
        "timeline_detail": "Santaquin reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "south-salt-lake": {
        "name": "South Salt Lake", "county": "Salt Lake County", "zips": "84115", "pop": "25,000+", "elev": "4,292",
        "storm_detail": "South Salt Lake's central valley position exposes it to broad storm systems crossing the Salt Lake Valley. The city's dense mix of residential and commercial properties all face hail and wind events from May through August.",
        "hoa_detail": "South Salt Lake has relatively few HOA-governed residential neighborhoods. Most properties have full choice of roofing materials without architectural review requirements.",
        "permit_detail": "South Salt Lake City requires building permits for roof replacements. Frame Restoration handles all permitting.",
        "cost_range": "$7,000 to $18,000",
        "insurance_detail": "South Salt Lake's older and more affordable housing stock benefits from Frame Restoration's thorough documentation to overcome depreciation deductions and maximize insurance payouts.",
        "winter_detail": "South Salt Lake's central valley position provides moderate winter conditions. Standard ice-and-water shield requirements apply.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout South Salt Lake.",
        "material_detail": "Architectural shingles with Class 4 impact resistance provide excellent value for South Salt Lake homes. Older properties may need deck assessment before installation.",
        "signs_detail": "South Salt Lake homeowners should check for aging on the city's older housing stock, multiple shingle layers from past roof-overs, hail damage, and poor ventilation indicators.",
        "timeline_detail": "South Salt Lake reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "springville": {
        "name": "Springville", "county": "Utah County", "zips": "84663", "pop": "35,000+", "elev": "4,551",
        "storm_detail": "Springville's south-central Utah Valley position catches storms moving along the Wasatch Front. The 'Art City' community's mix of historic and modern homes faces hail events from May through August.",
        "hoa_detail": "Springville has a mix of non-HOA historic neighborhoods and newer developments with CC&Rs. The city's art district and older areas generally have no restrictions.",
        "permit_detail": "Springville City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Building Department.",
        "cost_range": "$7,500 to $20,000",
        "insurance_detail": "Springville homeowners should document storm damage and file claims within 72 hours. Frame Restoration handles the entire claim process for maximum recovery.",
        "winter_detail": "Springville's Utah Valley position provides moderate winter conditions. Standard ice-and-water shield requirements apply.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Springville.",
        "material_detail": "Class 4 impact-resistant architectural shingles provide solid storm protection for Springville. Historic homes may benefit from material options that complement the neighborhood character.",
        "signs_detail": "Check for aging on historic homes, hail damage after storms, wind-lifted shingles, and deteriorated flashing on older rooflines.",
        "timeline_detail": "Springville reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "syracuse": {
        "name": "Syracuse", "county": "Davis County", "zips": "84075", "pop": "32,000+", "elev": "4,290",
        "storm_detail": "Syracuse's western Davis County position near the Great Salt Lake exposes it to lake-effect weather patterns and storms moving across the open terrain. Wind events are particularly common. Hail season runs May through August.",
        "hoa_detail": "Syracuse has numerous HOA-governed developments built during the city's rapid 2000s-2020s growth. Most newer subdivisions require architectural review for roofing. Frame Restoration navigates Syracuse HOA requirements regularly.",
        "permit_detail": "Syracuse City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Building Department.",
        "cost_range": "$8,000 to $22,000",
        "insurance_detail": "Syracuse's open terrain and lake-effect exposure generate regular insurance claims. Frame Restoration documents wind and hail damage patterns specific to the area.",
        "winter_detail": "Syracuse's proximity to the Great Salt Lake moderates extreme cold but creates unique lake-effect precipitation. Standard ice-and-water shield requirements apply.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Syracuse.",
        "material_detail": "High-wind-rated shingles are especially important in Syracuse due to lake-effect wind patterns. Class 4 impact resistance provides hail protection. Wind-resistant starter courses and proper nailing patterns are critical.",
        "signs_detail": "Syracuse homeowners should check for wind-lifted shingles (common with lake-effect gusts), hail damage, and premature aging on builder-grade materials from the recent building boom.",
        "timeline_detail": "Syracuse reroofs take 1-2 days. HOA approval adds 1-2 weeks. Insurance projects average 2-3 weeks."
    },
    "taylorsville": {
        "name": "Taylorsville", "county": "Salt Lake County", "zips": "84118, 84119, 84123, 84129", "pop": "60,000+", "elev": "4,306",
        "storm_detail": "Taylorsville's central-west Salt Lake Valley position catches storms from both the Oquirrh Mountains and broad valley systems. The city's large residential footprint with homes from multiple decades all face regular hail events from May through September.",
        "hoa_detail": "Taylorsville has a moderate number of HOA communities. Newer subdivisions and townhome developments typically have CC&Rs, while established 1970s-1990s neighborhoods generally do not.",
        "permit_detail": "Taylorsville City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Community Development Department.",
        "cost_range": "$7,500 to $20,000",
        "insurance_detail": "Taylorsville's diverse housing ages mean varied insurance scenarios. Frame Restoration tailors documentation for each property — maximizing payouts on older homes with depreciation and ensuring full coverage on newer properties.",
        "winter_detail": "Taylorsville's central valley position provides moderate winter conditions. Standard ice-and-water shield requirements apply. Installations are feasible year-round in mild weather.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Taylorsville's extensive residential areas.",
        "material_detail": "Architectural shingles with Class 4 impact resistance provide excellent protection for Taylorsville's central valley storm exposure. A range of price points fits the city's diverse housing stock.",
        "signs_detail": "Taylorsville homeowners should check for aging on 1970s-1990s homes, hail damage after storms, multiple shingle layers from past roof-overs, and ventilation issues causing ice dams or attic heat.",
        "timeline_detail": "Taylorsville reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "wallsburg": {
        "name": "Wallsburg", "county": "Wasatch County", "zips": "84082", "pop": "350+", "elev": "5,702",
        "storm_detail": "Wallsburg's remote Wasatch County valley position at 5,700 feet creates mountain-grade weather exposure with heavy snow, summer thunderstorms, and dramatic temperature swings. The small community faces concentrated weather events from May through September.",
        "hoa_detail": "Wallsburg has minimal HOA governance. Most properties are rural or large-lot residential with no architectural review requirements.",
        "permit_detail": "Wallsburg falls under Wasatch County jurisdiction for building permits. Mountain building codes with enhanced snow load requirements apply. Frame Restoration handles all permitting.",
        "cost_range": "$10,000 to $28,000",
        "insurance_detail": "Wallsburg's remote mountain location may require specialized documentation for insurance claims. Frame Restoration's Heber Valley presence means we understand mountain-specific damage patterns and local adjuster expectations.",
        "winter_detail": "Wallsburg's 5,700-foot elevation in a mountain valley means extreme winter conditions — heavy snow, deep freezes, and extended ice dam risk. Enhanced ice-and-water shield and proper ventilation are critical.",
        "emergency_detail": "Frame Restoration provides emergency response to Wallsburg from our Heber Valley base, with 24/7 tarping and leak mitigation.",
        "material_detail": "Mountain-grade materials are essential: Class 4 impact-resistant shingles rated for extreme cold, enhanced underlayment for heavy snow loads, and proper ventilation systems. Metal roofing is a strong option for snow shedding.",
        "signs_detail": "Wallsburg homeowners should inspect for ice dam damage every spring, check for heavy-snow stress on decking, look for UV-accelerated aging, and assess overall roof condition given the extreme mountain climate.",
        "timeline_detail": "Wallsburg reroofs take 2-4 days. Mountain weather can cause scheduling delays. Insurance projects average 3-4 weeks."
    },
    "west-bountiful": {
        "name": "West Bountiful", "county": "Davis County", "zips": "84087", "pop": "6,000+", "elev": "4,265",
        "storm_detail": "West Bountiful's position in western Davis County exposes it to storms moving across the valley. The compact community's residential areas face hail and wind events from May through August.",
        "hoa_detail": "West Bountiful has relatively few HOA-governed neighborhoods. Most properties have full choice of roofing materials without architectural review.",
        "permit_detail": "West Bountiful City requires building permits for roof replacements. Frame Restoration handles all permitting.",
        "cost_range": "$7,500 to $18,000",
        "insurance_detail": "West Bountiful homeowners should file storm claims promptly. Frame Restoration documents all damage and handles the insurance process.",
        "winter_detail": "West Bountiful's Davis County valley position provides moderate winter conditions. Standard ice-and-water shield requirements apply.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout West Bountiful.",
        "material_detail": "Class 4 impact-resistant architectural shingles provide solid protection for West Bountiful's valley storm exposure.",
        "signs_detail": "Check for aging on established homes, hail damage after storms, and wind-lifted edges on exposed roof planes.",
        "timeline_detail": "West Bountiful reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "west-valley-city": {
        "name": "West Valley City", "county": "Salt Lake County", "zips": "84119, 84120, 84128", "pop": "140,000+", "elev": "4,304",
        "storm_detail": "West Valley City's massive footprint in the central-west Salt Lake Valley catches the full force of storms sweeping from the Oquirrh Mountains. As Utah's second-largest city, tens of thousands of homes face hail and wind events from May through September.",
        "hoa_detail": "West Valley City has a growing number of HOA communities in newer developments, but the majority of established neighborhoods have no HOA restrictions, giving homeowners full choice of materials.",
        "permit_detail": "West Valley City requires building permits for roof replacements. Frame Restoration handles all permitting through the city's Community Development Department.",
        "cost_range": "$7,000 to $19,000",
        "insurance_detail": "West Valley City's Oquirrh Mountain storm exposure generates heavy insurance claim volume during hail season. Frame Restoration's efficient process handles the volume while ensuring thorough documentation for each homeowner.",
        "winter_detail": "West Valley City's central valley position provides moderate winter conditions. Standard ice-and-water shield requirements apply. Installations are feasible year-round.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response across West Valley City's extensive residential areas.",
        "material_detail": "Class 4 impact-resistant shingles are strongly recommended for West Valley City's front-line storm exposure. The insurance premium discount (10-28%) makes them especially cost-effective for this area.",
        "signs_detail": "West Valley City homeowners should check for hail damage after every significant storm, aging on homes built in the 1970s-1990s growth era, wind damage from open valley exposure, and poor ventilation indicators.",
        "timeline_detail": "West Valley City reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    },
    "woods-cross": {
        "name": "Woods Cross", "county": "Davis County", "zips": "84087", "pop": "12,000+", "elev": "4,292",
        "storm_detail": "Woods Cross's position in southern Davis County, adjacent to North Salt Lake, exposes it to Wasatch Front storms funneling through the narrow valley. Hail and wind events are regular from May through August.",
        "hoa_detail": "Woods Cross has a mix of established non-HOA neighborhoods and newer developments with CC&Rs. Frame Restoration can verify your specific requirements.",
        "permit_detail": "Woods Cross City requires building permits for roof replacements. Frame Restoration handles all permitting.",
        "cost_range": "$7,500 to $18,000",
        "insurance_detail": "Woods Cross homeowners should file storm claims promptly. Frame Restoration provides thorough damage documentation and handles the full insurance process.",
        "winter_detail": "Woods Cross's Davis County position provides moderate winter conditions. Standard ice-and-water shield requirements apply.",
        "emergency_detail": "Frame Restoration provides 24/7 emergency response throughout Woods Cross.",
        "material_detail": "Class 4 impact-resistant architectural shingles provide solid protection for Woods Cross's Wasatch Front storm exposure.",
        "signs_detail": "Check for hail damage after storms, aging on homes 20+ years old, and wind-lifted shingles from valley-funneled gusts.",
        "timeline_detail": "Woods Cross reroofs take 1-2 days. Insurance projects average 2-3 weeks."
    }
}

def generate_faqs(city_key, city):
    name = city["name"]
    return [
        {"q": f"How often does {name} get hail damage that requires roof repair?",
         "a": city["storm_detail"] + f" Frame Roofing Utah recommends a free professional inspection after any significant storm event — hail damage invisible from the ground can shorten your roof's life by 5-10 years if left unaddressed."},
        {"q": f"Do I need a building permit to replace my roof in {name}?",
         "a": city["permit_detail"]},
        {"q": f"Does my {name} HOA need to approve a roof replacement?",
         "a": city["hoa_detail"]},
        {"q": f"How do I file a roof insurance claim in {name} after a storm?",
         "a": city["insurance_detail"]},
        {"q": f"What roofing materials are best for {name}'s climate?",
         "a": city["material_detail"]},
        {"q": f"How much does a roof replacement cost in {name}?",
         "a": f"Roof replacement costs in {name} typically range from {city['cost_range']} for a standard residential home, depending on square footage, roof pitch, material choice, and damage extent. If your roof was damaged by hail or wind, insurance may cover most or all of the replacement cost. Frame Roofing Utah provides free written estimates with no obligation."},
        {"q": f"How long does a roof replacement take in {name}?",
         "a": city["timeline_detail"]},
        {"q": f"What are the signs my {name} roof needs replacement?",
         "a": city["signs_detail"]},
        {"q": f"Does Frame Roofing Utah offer free roof inspections in {name}?",
         "a": f"Yes — Frame Roofing Utah provides 100% free, no-obligation roof inspections throughout {name} and {city['county']}. There is no cost and no pressure. Call 435-302-4422 or schedule online and a licensed Utah roofing specialist will come to you, typically within 24-48 hours."},
        {"q": f"Can I get my roof replaced during winter in {name}?",
         "a": city["winter_detail"] + " Contact Frame Roofing Utah to discuss timing — we'll recommend the best installation window for your specific situation."},
        {"q": f"Does Frame Roofing Utah handle emergency roof repairs in {name}?",
         "a": city["emergency_detail"]},
        {"q": f"Is Frame Roofing Utah licensed and insured to work in {name}?",
         "a": f"Yes. Frame Roofing Utah is fully licensed and insured to perform roofing and restoration work throughout Utah, including {name} and all of {city['county']}. We hold Utah DOPL contractor license #14256097-5501, carry full general liability insurance and workers' compensation on every job, and are BBB A+ accredited."}
    ]

def build_jsonld(faqs):
    schema = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": []}
    for faq in faqs:
        schema["mainEntity"].append({"@type": "Question", "name": faq["q"], "acceptedAnswer": {"@type": "Answer", "text": faq["a"]}})
    return json.dumps(schema, indent=2, ensure_ascii=False)

def build_html_faq(city_name, faqs):
    details = []
    for i, faq in enumerate(faqs):
        open_attr = ' open' if i == 0 else ''
        details.append(f'    <details style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:0.75rem;overflow:hidden;"{open_attr}>\n      <summary style="padding:1rem 1.25rem;font-weight:700;color:#0B4060;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;background:#fff;">\n        {faq["q"]}\n        <span style="font-size:1.25rem;flex-shrink:0;margin-left:1rem;">+</span>\n      </summary>\n      <div style="padding:1rem 1.25rem;background:#fff;border-top:1px solid #e2e8f0;color:#374151;line-height:1.6;">\n        {faq["a"]}\n      </div>\n    </details>')
    return f'<section class="location-faq" style="padding:3rem 0;background:#f8f9fa;">\n  <div style="max-width:800px;margin:0 auto;padding:0 1.5rem;">\n    <h2 style="font-size:1.6rem;font-weight:800;color:#0B4060;margin-bottom:1.5rem;">Roofing FAQs for {city_name} Residents</h2>\n    \n' + '\n'.join(details) + '\n  </div>\n</section>'

def process_city(city_key, city):
    filepath = os.path.join(BASE, f"{city_key}.html")
    if not os.path.exists(filepath):
        print(f"  SKIP: {filepath} not found")
        return False
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    faqs = generate_faqs(city_key, city)
    new_jsonld = build_jsonld(faqs)
    new_html = build_html_faq(city["name"], faqs)

    faq_idx = content.find('"FAQPage"')
    if faq_idx == -1:
        print(f"  ✗ No FAQPage JSON-LD found")
        return False
    script_start = content.rfind('<script type="application/ld+json">', 0, faq_idx)
    script_end = content.find('</script>', faq_idx) + len('</script>')
    if script_start == -1 or script_end < len('</script>'):
        print(f"  ✗ Script tag boundaries not found")
        return False
    content = content[:script_start] + f'<script type="application/ld+json">\n{new_jsonld}\n</script>' + content[script_end:]
    print(f"  ✓ JSON-LD replaced (12 FAQs)")

    faq_section_start = content.find('<section class="location-faq"')
    if faq_section_start == -1:
        print(f"  ✗ No visible FAQ section found")
        return False
    depth, pos = 0, faq_section_start
    while pos < len(content):
        if content[pos:pos+8] == '<section':
            depth += 1
        elif content[pos:pos+10] == '</section>':
            depth -= 1
            if depth == 0:
                content = content[:faq_section_start] + new_html + content[pos+10:]
                break
        pos += 1
    else:
        print(f"  ✗ Section end not found")
        return False
    print(f"  ✓ HTML FAQ replaced (12 accordions)")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  ✓ Saved")
    return True

print("=" * 60)
print("EXPANDING FAQ SCHEMAS — REMAINING 38 CITIES")
print("=" * 60)
success, total = 0, len(CITIES)
for city_key in sorted(CITIES.keys()):
    print(f"\n→ {CITIES[city_key]['name']}...")
    if process_city(city_key, CITIES[city_key]):
        success += 1
print(f"\n{'=' * 60}")
print(f"COMPLETE: {success}/{total} cities updated")
print(f"{'=' * 60}")
