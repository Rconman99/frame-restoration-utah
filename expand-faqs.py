#!/usr/bin/env python3
"""
Expand FAQ schemas on Frame Roofing Utah location pages.
Replaces 5 generic FAQs with 12 city-specific FAQs per page.
Updates both JSON-LD schema and visible HTML FAQ section.
"""
import json, re, os

BASE = "/Users/agenticmac/projects/frame-restoration-utah/locations"

CITIES = {
    "west-jordan": {
        "name": "West Jordan",
        "county": "Salt Lake County",
        "zips": "84081, 84084, 84088",
        "pop": "116,000+",
        "elev": "4,370",
        "storm_detail": "Storms develop over the Oquirrh Mountains and sweep eastward across the south valley, hitting West Jordan with concentrated hail from May through September. The city's broad geography means western neighborhoods often take the first hit.",
        "housing_era": "1970s through 2000s",
        "neighborhoods": "Gardner Village, Jordan Landing, and neighborhoods along Bangerter Highway and 7800 South",
        "hoa_detail": "Many West Jordan subdivisions built after 1990 have active HOAs with CC&Rs that specify approved roofing materials, colors, and contractors. Check your HOA guidelines before scheduling work — Frame Restoration can help you navigate approval requirements.",
        "permit_detail": "Salt Lake County requires a building permit for full roof replacements in West Jordan. The permit ensures work meets current Utah building code including ice-and-water shield requirements. Frame Restoration handles all permit paperwork as part of every project.",
        "cost_range": "$8,000 to $22,000",
        "insurance_detail": "West Jordan's position in the south valley hail corridor means most major insurers expect claims from this area. After a storm, document damage with photos, call your insurer within 72 hours, and schedule a professional inspection. Frame Restoration handles the entire claim process at no extra cost.",
        "winter_detail": "West Jordan's 4,370-foot elevation means winter temperatures regularly drop below freezing, but roof replacements can still be done in mild winter windows (above 40°F). We use cold-weather adhesive techniques when necessary.",
        "emergency_detail": "West Jordan's exposure to Oquirrh Mountain storms means emergency situations arise quickly. Frame Restoration provides 24/7 emergency tarping and leak mitigation across all West Jordan ZIP codes.",
        "material_detail": "Impact-resistant (Class 4) shingles are strongly recommended for West Jordan due to frequent hail. Many insurers offer 10-28% premium discounts for Class 4 installations. Architectural shingles rated for 130+ mph winds handle the canyon-effect gusts common in the south valley.",
        "signs_detail": "In West Jordan, watch for granule loss in gutters after storms, curling or lifting shingles (common on 1990s-era roofs), dark streaks from algae growth, and any visible dents on roof vents or flashing. Homes built before 2000 with original roofs are past their expected lifespan.",
        "timeline_detail": "A standard West Jordan residential reroof takes 1-3 days depending on roof size and complexity. Insurance claim projects may take 2-4 weeks from initial inspection to completion due to adjuster scheduling."
    },
    "sandy": {
        "name": "Sandy",
        "county": "Salt Lake County",
        "zips": "84070, 84090, 84091, 84092, 84093, 84094",
        "pop": "96,000+",
        "elev": "4,440",
        "storm_detail": "Sandy's position at the base of Little Cottonwood Canyon creates a unique weather funnel. Storms descend from the Wasatch Range and hit the east bench with intensified force, while western Sandy catches broader valley weather patterns. Hail season runs May through August with multiple insurance-qualifying events annually.",
        "housing_era": "1970s through 2000s",
        "neighborhoods": "South Towne Center area, east bench neighborhoods below Little Cottonwood Canyon, and residential streets from 9000 South to Draper border",
        "hoa_detail": "Sandy's east bench communities and newer developments typically have strict HOA requirements specifying architectural shingle styles, approved color palettes, and sometimes pre-approved contractor lists. Frame Restoration works with Sandy HOAs regularly and can provide compliance documentation.",
        "permit_detail": "Sandy City requires a building permit for roof replacements. Permits are processed through the Sandy City Building Division and ensure compliance with current International Building Code standards adopted by Utah. Frame Restoration handles all permitting.",
        "cost_range": "$9,000 to $25,000",
        "insurance_detail": "Sandy's east bench homes with steeper pitches tend to have higher replacement costs but are also more likely to sustain hail damage due to elevation exposure. File your claim within 72 hours of a storm, and request a professional inspection — not just an adjuster drive-by. Frame Restoration meets with your adjuster on-site to ensure all damage is documented.",
        "winter_detail": "Sandy's higher east bench elevation (up to 5,200 feet) means heavier snow loads and more freeze-thaw cycles than the valley floor. Winter installations are possible during mild periods, but spring and fall are ideal.",
        "emergency_detail": "Sandy's proximity to the Wasatch Range means sudden canyon-driven storms can cause immediate damage. Frame Restoration provides 24/7 emergency response across all Sandy ZIP codes, from the east bench to South Towne.",
        "material_detail": "East bench Sandy homes benefit from Class 4 impact-resistant shingles and enhanced ice-and-water shield coverage due to heavy snow accumulation. The steeper pitches common on east bench custom homes require specialized installation techniques that Frame Restoration's crews are trained for.",
        "signs_detail": "Sandy homeowners should watch for ice dam staining along eaves (common on east bench homes), granule loss after hailstorms, wind-lifted shingles from canyon gusts, and cracked or missing flashing around skylights. Homes built in the 1980s-1990s with original 3-tab shingles are overdue for replacement.",
        "timeline_detail": "Standard Sandy reroofs take 1-3 days. East bench homes with steep pitches and complex rooflines may take 3-5 days. Insurance claim timelines average 2-4 weeks from inspection to completion."
    },
    "draper": {
        "name": "Draper",
        "county": "Salt Lake County",
        "zips": "84020",
        "pop": "51,000+",
        "elev": "4,505",
        "storm_detail": "Draper sits at the Point of the Mountain where Salt Lake and Utah valleys meet, creating a natural wind and storm convergence zone. This geography channels both Wasatch downdrafts and cross-valley storm systems directly over Draper's residential areas. Hail events from May through August are frequent and often severe.",
        "housing_era": "1990s through 2020s",
        "neighborhoods": "SunCrest, Hidden Canyon, Draper Historic District, and the neighborhoods along Highland Drive and 13200 South",
        "hoa_detail": "Draper has some of the most active HOAs along the Wasatch Front. SunCrest, Hidden Canyon, and most post-2000 developments require architectural review before any exterior modification including roofing. Frame Restoration provides HOA-compliant material selections and pre-approval documentation.",
        "permit_detail": "Draper City requires building permits for roof replacements, processed through the Draper City Community Development Department. Inspections are required after installation. Frame Restoration handles all permit applications and coordinates inspections.",
        "cost_range": "$12,000 to $30,000",
        "insurance_detail": "Draper's higher home values and complex rooflines mean replacement costs are above the Salt Lake County average, but insurance should cover storm damage in full. Frame Restoration's detailed documentation process is critical for Draper homes where supplemental claims for ridge caps, pipe boots, and skylight flashing are common.",
        "winter_detail": "Draper's Point of the Mountain location creates significant wind exposure year-round. Winter installations require calm-wind windows and cold-weather adhesive protocols. SunCrest homes at 5,500+ feet see heavy snow loads requiring enhanced underlayment.",
        "emergency_detail": "The Point of the Mountain wind corridor can tear shingles and cause sudden damage even without storms. Frame Restoration provides 24/7 emergency response throughout Draper, including SunCrest and the upper neighborhoods.",
        "material_detail": "Draper's wind exposure makes high-wind-rated shingles (130+ mph) essential. For SunCrest and upper-elevation homes, Class 4 impact-resistant shingles with enhanced ice-and-water shield are recommended. Many Draper HOAs require designer-grade architectural shingles.",
        "signs_detail": "Draper homeowners should check for wind-lifted shingles (especially common at the Point of the Mountain), worn sealant strips on newer homes, ice dam evidence on north-facing slopes, and hail dents on metal vents and gutters. SunCrest homes should be inspected after any significant wind event.",
        "timeline_detail": "Draper reroofs average 2-4 days due to larger home sizes and complex rooflines. SunCrest and upper-mountain homes may take 3-5 days. Insurance projects run 2-4 weeks."
    },
    "murray": {
        "name": "Murray",
        "county": "Salt Lake County",
        "zips": "84107, 84117, 84121, 84123, 84157",
        "pop": "50,000+",
        "elev": "4,295",
        "storm_detail": "Murray's central Salt Lake Valley position means it catches weather from both the Wasatch Range to the east and storm systems moving across the valley floor. The city's moderate elevation and flat-to-gentle topography create uniform storm exposure across most neighborhoods. Hail season peaks May through August.",
        "housing_era": "1940s through 1990s",
        "neighborhoods": "Fashion Place area, neighborhoods along State Street and 4800 South, Murray Park, and the residential streets between I-15 and I-215",
        "hoa_detail": "Murray has fewer HOA-governed communities than newer south valley cities, but some townhome and condo developments near Fashion Place Mall and along Vine Street do have CC&Rs. Older single-family neighborhoods generally have no HOA restrictions on roofing materials or colors.",
        "permit_detail": "Murray City requires building permits for roof replacements, processed through the Murray City Building and Safety Division. The city follows International Building Code standards adopted by Utah. Frame Restoration handles all permit paperwork.",
        "cost_range": "$7,500 to $20,000",
        "insurance_detail": "Murray's older housing stock often has roofing that predates current building standards, which can complicate insurance claims. Adjusters may depreciate older roofs significantly — having Frame Restoration document current condition and storm damage before the adjuster visit is critical to getting a fair payout.",
        "winter_detail": "Murray's moderate valley-floor elevation means less severe winter conditions than east bench or mountain communities. Roof replacements can often be scheduled later into fall and earlier in spring compared to higher-elevation cities.",
        "emergency_detail": "Murray's central location means Frame Restoration crews can reach any Murray address within 30 minutes for emergency tarping and leak mitigation. Available 24/7 across all Murray ZIP codes.",
        "material_detail": "For Murray's older homes (1940s-1970s), proper deck assessment is critical before material selection — some may need plywood decking replacement before new shingles. Architectural shingles with Class 4 impact resistance provide the best value for Murray's storm-exposed position.",
        "signs_detail": "Murray's older homes are especially vulnerable. Watch for sagging roof decks (common on pre-1970 homes), multiple layers of shingles from past roof-overs, daylight visible through attic boards, and moss or algae growth on north-facing slopes. Any Murray home with a roof over 20 years old should be inspected.",
        "timeline_detail": "Murray reroofs typically take 1-2 days for standard homes. Older homes requiring deck repairs may take 2-3 days. Insurance claim projects average 2-3 weeks."
    },
    "south-jordan": {
        "name": "South Jordan",
        "county": "Salt Lake County",
        "zips": "84009, 84095",
        "pop": "77,000+",
        "elev": "4,390",
        "storm_detail": "South Jordan's position between the Oquirrh and Wasatch ranges creates a storm channel that funnels hail and severe weather across the city's residential areas. The Daybreak master-planned community on the west side and established neighborhoods along 10600 South both experience frequent hail events from May through September.",
        "housing_era": "1980s through 2020s",
        "neighborhoods": "Daybreak, River Park, The District, and residential areas along Redwood Road and 10600 South",
        "hoa_detail": "South Jordan has significant HOA governance, especially in Daybreak where the community association strictly regulates exterior modifications. Daybreak requires specific roofing materials and color palettes approved by the architectural review committee. Frame Restoration has extensive experience navigating Daybreak's approval process.",
        "permit_detail": "South Jordan City requires building permits for roof replacements. The city's Building Division processes permits and requires a final inspection. In Daybreak, you need both a city permit AND HOA architectural approval. Frame Restoration handles both.",
        "cost_range": "$9,000 to $24,000",
        "insurance_detail": "South Jordan's newer homes (especially Daybreak, built 2004-present) may still have builder-grade roofing that's approaching its first replacement cycle. Insurance companies are familiar with the area's hail exposure. File claims promptly and have Frame Restoration document damage before the adjuster visit.",
        "winter_detail": "South Jordan's valley-floor position provides slightly milder winter conditions than higher-elevation cities, but the open terrain between the mountain ranges creates significant wind exposure that can damage roofing in any season.",
        "emergency_detail": "South Jordan's storm exposure means emergency situations are common during hail season. Frame Restoration provides 24/7 emergency tarping and damage mitigation across South Jordan, including all Daybreak villages.",
        "material_detail": "For Daybreak homes, material selection must comply with HOA requirements — Frame Restoration stocks Daybreak-approved shingle styles and colors. For established South Jordan neighborhoods, Class 4 impact-resistant shingles with high-wind ratings provide optimal protection against the cross-valley storm pattern.",
        "signs_detail": "South Jordan homeowners should check for hail dimpling on shingles after storms, lifted edges from wind exposure, and premature aging on south-facing roof planes. Daybreak homes built 2004-2010 with original builder-grade shingles are approaching replacement age.",
        "timeline_detail": "South Jordan reroofs take 1-3 days. Daybreak homes with HOA requirements may add 1-2 weeks for architectural review approval before work begins. Insurance projects average 2-4 weeks."
    },
    "cottonwood-heights": {
        "name": "Cottonwood Heights",
        "county": "Salt Lake County",
        "zips": "84047, 84093, 84121",
        "pop": "34,000+",
        "elev": "4,600",
        "storm_detail": "Cottonwood Heights sits at the mouths of Big and Little Cottonwood Canyons, creating extreme weather exposure. Canyon-effect winds accelerate through the canyon mouths and hit Cottonwood Heights neighborhoods with amplified force. Mountain storms descend rapidly, bringing hail, heavy rain, and sudden temperature drops from May through September.",
        "housing_era": "1960s through 2000s",
        "neighborhoods": "neighborhoods along Wasatch Boulevard, Fort Union area, areas near Big Cottonwood Canyon mouth, and the residential streets between 6200 South and 7800 South",
        "hoa_detail": "Cottonwood Heights has a mix of HOA-governed and non-HOA neighborhoods. Newer developments and townhome communities generally have CC&Rs, while established single-family areas along the east bench often do not. Check your specific community's requirements — Frame Restoration can help verify.",
        "permit_detail": "Cottonwood Heights City requires building permits for roof replacements. The city follows Utah's adoption of the International Building Code. Given the canyon-effect wind exposure, proper installation to manufacturer wind-rating specifications is especially critical here. Frame Restoration handles all permitting.",
        "cost_range": "$10,000 to $28,000",
        "insurance_detail": "Cottonwood Heights' canyon-mouth position creates some of the highest wind and hail exposure in the Salt Lake Valley. Insurance companies know this area generates frequent claims. Thorough damage documentation is essential — canyon-effect damage patterns differ from standard valley hail and adjusters need to see the full scope.",
        "winter_detail": "Cottonwood Heights' east bench elevation (4,600-5,200 feet) means heavy snow loads, frequent freeze-thaw cycling, and significant ice dam risk. Enhanced ice-and-water shield coverage is essential. Winter installations require careful scheduling around canyon weather events.",
        "emergency_detail": "Canyon-mouth storms can develop and strike within minutes. Frame Restoration provides rapid emergency response throughout Cottonwood Heights, with crews able to reach any address for 24/7 tarping and leak mitigation.",
        "material_detail": "Cottonwood Heights demands premium roofing materials: Class 4 impact-resistant shingles, 130+ mph wind ratings, and enhanced ice-and-water shield on all eaves, valleys, and north-facing slopes. The canyon-effect wind exposure means standard installations will fail prematurely — proper nailing patterns and starter course installation are critical.",
        "signs_detail": "Cottonwood Heights homes should be inspected after any canyon windstorm. Look for lifted or creased shingles, exposed nails from wind uplift, ice dam staining along eaves (especially north-facing), and deteriorated flashing around canyon-facing roof edges. Homes built in the 1960s-1970s with original roofing are critically overdue.",
        "timeline_detail": "Cottonwood Heights reroofs take 2-4 days due to steeper pitches and complex rooflines common on east bench homes. Canyon weather can cause scheduling delays. Insurance projects average 2-4 weeks."
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
    schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": []
    }
    for faq in faqs:
        schema["mainEntity"].append({
            "@type": "Question",
            "name": faq["q"],
            "acceptedAnswer": {
                "@type": "Answer",
                "text": faq["a"]
            }
        })
    return json.dumps(schema, indent=2, ensure_ascii=False)

def build_html_faq(city_name, faqs):
    details = []
    for i, faq in enumerate(faqs):
        open_attr = ' open' if i == 0 else ''
        details.append(f'''    <details style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:0.75rem;overflow:hidden;"{open_attr}>
      <summary style="padding:1rem 1.25rem;font-weight:700;color:#0B4060;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;background:#fff;">
        {faq["q"]}
        <span style="font-size:1.25rem;flex-shrink:0;margin-left:1rem;">+</span>
      </summary>
      <div style="padding:1rem 1.25rem;background:#fff;border-top:1px solid #e2e8f0;color:#374151;line-height:1.6;">
        {faq["a"]}
      </div>
    </details>''')

    return f'''<section class="location-faq" style="padding:3rem 0;background:#f8f9fa;">
  <div style="max-width:800px;margin:0 auto;padding:0 1.5rem;">
    <h2 style="font-size:1.6rem;font-weight:800;color:#0B4060;margin-bottom:1.5rem;">Roofing FAQs for {city_name} Residents</h2>
    
{chr(10).join(details)}
  </div>
</section>'''

def process_city(city_key, city):
    filepath = os.path.join(BASE, f"{city_key}.html")
    if not os.path.exists(filepath):
        print(f"SKIP: {filepath} not found")
        return False

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    faqs = generate_faqs(city_key, city)
    new_jsonld = build_jsonld(faqs)
    new_html = build_html_faq(city["name"], faqs)

    # Find and replace FAQPage JSON-LD using start/end markers
    faq_start_marker = '"@type": "FAQPage"'
    alt_marker = '"@type":"FAQPage"'
    
    # Find the script tag containing FAQPage
    faq_idx = content.find(faq_start_marker)
    if faq_idx == -1:
        faq_idx = content.find(alt_marker)
    
    if faq_idx == -1:
        print(f"  ✗ Could not find FAQPage JSON-LD for {city['name']}")
        return False
    
    # Walk backwards to find the <script> tag
    script_start = content.rfind('<script type="application/ld+json">', 0, faq_idx)
    if script_start == -1:
        print(f"  ✗ Could not find script tag before FAQPage for {city['name']}")
        return False
    
    # Walk forward to find </script>
    script_end = content.find('</script>', faq_idx)
    if script_end == -1:
        print(f"  ✗ Could not find closing script tag for FAQPage for {city['name']}")
        return False
    script_end += len('</script>')
    
    replacement_jsonld = f'<script type="application/ld+json">\n{new_jsonld}\n</script>'
    content = content[:script_start] + replacement_jsonld + content[script_end:]
    print(f"  ✓ Replaced FAQPage JSON-LD ({len(faqs)} questions)")

    # Find and replace visible FAQ section
    faq_section_start = content.find('<section class="location-faq"')
    if faq_section_start == -1:
        print(f"  ✗ Could not find visible FAQ section for {city['name']}")
        return False
    
    # Find the closing </section> for this specific section
    depth = 0
    pos = faq_section_start
    section_end = -1
    while pos < len(content):
        if content[pos:pos+8] == '<section':
            depth += 1
        elif content[pos:pos+10] == '</section>':
            depth -= 1
            if depth == 0:
                section_end = pos + 10
                break
        pos += 1
    
    if section_end == -1:
        print(f"  ✗ Could not find closing tag for FAQ section for {city['name']}")
        return False
    
    content = content[:faq_section_start] + new_html + content[section_end:]
    print(f"  ✓ Replaced visible FAQ section ({len(faqs)} accordion items)")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"  ✓ Saved {filepath}")
    return True

print("=" * 60)
print("EXPANDING FAQ SCHEMAS — PRIORITY CITIES")
print("=" * 60)
success = 0
for city_key in ["west-jordan", "sandy", "draper", "murray", "south-jordan", "cottonwood-heights"]:
    print(f"\n→ Processing {CITIES[city_key]['name']}...")
    if process_city(city_key, CITIES[city_key]):
        success += 1

print(f"\n{'=' * 60}")
print(f"COMPLETE: {success}/6 priority cities updated")
print(f"{'=' * 60}")
