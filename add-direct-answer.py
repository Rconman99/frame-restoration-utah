#!/usr/bin/env python3
"""
Add direct-answer blocks to the first section of each location page.
These are concise, AI-extractable summary blocks that appear right after
the hero section — optimized for Google AI Overviews and ChatGPT citations.
"""
import re, os

BASE = "/Users/agenticmac/projects/frame-restoration-utah/locations"

# City data for direct-answer blocks
CITY_DATA = {
    "alpine": {"name": "Alpine", "county": "Utah County", "elev": "4,980", "pop": "10,500+", "cost": "$14,000–$35,000", "hail": "May–August", "zips": "84004"},
    "american-fork": {"name": "American Fork", "county": "Utah County", "elev": "4,554", "pop": "33,000+", "cost": "$8,000–$22,000", "hail": "May–August", "zips": "84003"},
    "bluffdale": {"name": "Bluffdale", "county": "Salt Lake County", "elev": "4,425", "pop": "16,000+", "cost": "$9,000–$24,000", "hail": "May–September", "zips": "84065"},
    "bountiful": {"name": "Bountiful", "county": "Davis County", "elev": "4,327", "pop": "44,000+", "cost": "$8,000–$22,000", "hail": "May–August", "zips": "84010, 84011"},
    "centerville": {"name": "Centerville", "county": "Davis County", "elev": "4,314", "pop": "18,000+", "cost": "$8,000–$20,000", "hail": "May–August", "zips": "84014"},
    "clearfield": {"name": "Clearfield", "county": "Davis County", "elev": "4,334", "pop": "32,000+", "cost": "$7,000–$18,000", "hail": "May–August", "zips": "84015, 84016"},
    "clinton": {"name": "Clinton", "county": "Davis County", "elev": "4,310", "pop": "23,000+", "cost": "$7,000–$18,000", "hail": "May–August", "zips": "84015"},
    "cottonwood-heights": {"name": "Cottonwood Heights", "county": "Salt Lake County", "elev": "4,600", "pop": "34,000+", "cost": "$10,000–$28,000", "hail": "May–September", "zips": "84047, 84093, 84121"},
    "draper": {"name": "Draper", "county": "Salt Lake County", "elev": "4,505", "pop": "51,000+", "cost": "$12,000–$30,000", "hail": "May–August", "zips": "84020"},
    "farmington": {"name": "Farmington", "county": "Davis County", "elev": "4,314", "pop": "25,000+", "cost": "$9,000–$25,000", "hail": "May–August", "zips": "84025"},
    "heber-city": {"name": "Heber City", "county": "Wasatch County", "elev": "5,604", "pop": "18,000+", "cost": "$10,000–$30,000", "hail": "May–September", "zips": "84032"},
    "herriman": {"name": "Herriman", "county": "Salt Lake County", "elev": "4,856", "pop": "55,000+", "cost": "$9,000–$24,000", "hail": "May–September", "zips": "84096"},
    "highland": {"name": "Highland", "county": "Utah County", "elev": "4,757", "pop": "19,000+", "cost": "$12,000–$32,000", "hail": "May–August", "zips": "84003"},
    "holladay": {"name": "Holladay", "county": "Salt Lake County", "elev": "4,380", "pop": "31,000+", "cost": "$9,000–$26,000", "hail": "May–August", "zips": "84117, 84121, 84124"},
    "kaysville": {"name": "Kaysville", "county": "Davis County", "elev": "4,348", "pop": "33,000+", "cost": "$8,000–$22,000", "hail": "May–August", "zips": "84037"},
    "kearns": {"name": "Kearns", "county": "Salt Lake County", "elev": "4,304", "pop": "36,000+", "cost": "$7,000–$18,000", "hail": "May–September", "zips": "84118"},
    "layton": {"name": "Layton", "county": "Davis County", "elev": "4,396", "pop": "80,000+", "cost": "$7,500–$20,000", "hail": "May–August", "zips": "84040, 84041"},
    "lehi": {"name": "Lehi", "county": "Utah County", "elev": "4,550", "pop": "75,000+", "cost": "$8,000–$24,000", "hail": "May–September", "zips": "84043"},
    "lindon": {"name": "Lindon", "county": "Utah County", "elev": "4,639", "pop": "11,000+", "cost": "$8,000–$22,000", "hail": "May–August", "zips": "84042"},
    "magna": {"name": "Magna", "county": "Salt Lake County", "elev": "4,280", "pop": "29,000+", "cost": "$7,000–$17,000", "hail": "May–September", "zips": "84044"},
    "midvale": {"name": "Midvale", "county": "Salt Lake County", "elev": "4,340", "pop": "36,000+", "cost": "$7,500–$20,000", "hail": "May–August", "zips": "84047"},
    "midway": {"name": "Midway", "county": "Wasatch County", "elev": "5,575", "pop": "6,000+", "cost": "$10,000–$28,000", "hail": "May–September", "zips": "84049"},
    "millcreek": {"name": "Millcreek", "county": "Salt Lake County", "elev": "4,357", "pop": "63,000+", "cost": "$8,000–$24,000", "hail": "May–August", "zips": "84106, 84107, 84109, 84117"},
    "murray": {"name": "Murray", "county": "Salt Lake County", "elev": "4,295", "pop": "50,000+", "cost": "$7,500–$20,000", "hail": "May–August", "zips": "84107, 84117, 84121, 84123, 84157"},
    "north-salt-lake": {"name": "North Salt Lake", "county": "Davis County", "elev": "4,310", "pop": "21,000+", "cost": "$8,000–$22,000", "hail": "May–August", "zips": "84054"},
    "ogden": {"name": "Ogden", "county": "Weber County", "elev": "4,299", "pop": "87,000+", "cost": "$7,000–$20,000", "hail": "May–August", "zips": "84401, 84403, 84404, 84405, 84414"},
    "orem": {"name": "Orem", "county": "Utah County", "elev": "4,756", "pop": "97,000+", "cost": "$8,000–$22,000", "hail": "May–August", "zips": "84057, 84058, 84059"},
    "park-city": {"name": "Park City", "county": "Summit County", "elev": "6,902", "pop": "8,500+", "cost": "$15,000–$45,000", "hail": "May–October", "zips": "84060, 84068, 84098"},
    "payson": {"name": "Payson", "county": "Utah County", "elev": "4,551", "pop": "21,000+", "cost": "$7,000–$18,000", "hail": "May–August", "zips": "84651"},
    "pleasant-grove": {"name": "Pleasant Grove", "county": "Utah County", "elev": "4,606", "pop": "38,000+", "cost": "$8,000–$22,000", "hail": "May–August", "zips": "84062"},
    "provo": {"name": "Provo", "county": "Utah County", "elev": "4,551", "pop": "115,000+", "cost": "$7,500–$24,000", "hail": "May–August", "zips": "84601, 84602, 84604, 84606"},
    "riverton": {"name": "Riverton", "county": "Salt Lake County", "elev": "4,459", "pop": "44,000+", "cost": "$9,000–$24,000", "hail": "May–September", "zips": "84065"},
    "salt-lake-city": {"name": "Salt Lake City", "county": "Salt Lake County", "elev": "4,226", "pop": "200,000+", "cost": "$8,000–$28,000", "hail": "May–August", "zips": "84101–84199"},
    "sandy": {"name": "Sandy", "county": "Salt Lake County", "elev": "4,440", "pop": "96,000+", "cost": "$9,000–$25,000", "hail": "May–August", "zips": "84070, 84090–84094"},
    "santaquin": {"name": "Santaquin", "county": "Utah County", "elev": "5,108", "pop": "13,000+", "cost": "$7,500–$20,000", "hail": "May–August", "zips": "84655"},
    "south-jordan": {"name": "South Jordan", "county": "Salt Lake County", "elev": "4,390", "pop": "77,000+", "cost": "$9,000–$24,000", "hail": "May–September", "zips": "84009, 84095"},
    "south-salt-lake": {"name": "South Salt Lake", "county": "Salt Lake County", "elev": "4,292", "pop": "25,000+", "cost": "$7,000–$18,000", "hail": "May–August", "zips": "84115"},
    "springville": {"name": "Springville", "county": "Utah County", "elev": "4,551", "pop": "35,000+", "cost": "$7,500–$20,000", "hail": "May–August", "zips": "84663"},
    "syracuse": {"name": "Syracuse", "county": "Davis County", "elev": "4,290", "pop": "32,000+", "cost": "$8,000–$22,000", "hail": "May–August", "zips": "84075"},
    "taylorsville": {"name": "Taylorsville", "county": "Salt Lake County", "elev": "4,306", "pop": "60,000+", "cost": "$7,500–$20,000", "hail": "May–September", "zips": "84118, 84119, 84123, 84129"},
    "wallsburg": {"name": "Wallsburg", "county": "Wasatch County", "elev": "5,702", "pop": "350+", "cost": "$10,000–$28,000", "hail": "May–September", "zips": "84082"},
    "west-bountiful": {"name": "West Bountiful", "county": "Davis County", "elev": "4,265", "pop": "6,000+", "cost": "$7,500–$18,000", "hail": "May–August", "zips": "84087"},
    "west-jordan": {"name": "West Jordan", "county": "Salt Lake County", "elev": "4,370", "pop": "116,000+", "cost": "$8,000–$22,000", "hail": "May–September", "zips": "84081, 84084, 84088"},
    "west-valley-city": {"name": "West Valley City", "county": "Salt Lake County", "elev": "4,304", "pop": "140,000+", "cost": "$7,000–$19,000", "hail": "May–September", "zips": "84119, 84120, 84128"},
    "woods-cross": {"name": "Woods Cross", "county": "Davis County", "elev": "4,292", "pop": "12,000+", "cost": "$7,500–$18,000", "hail": "May–August", "zips": "84087"}
}

def build_direct_answer(city):
    """Build a direct-answer summary block for AI extraction."""
    return f'''    <div class="direct-answer" style="background:#f0f7ff;border-left:4px solid #0B4060;padding:20px 24px;margin:24px 0 32px;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 8px;font-weight:700;color:#0B4060;font-size:1.05rem;">Roof Replacement in {city["name"]}, Utah — Quick Facts</p>
      <p style="margin:0;color:#374151;line-height:1.7;font-size:0.95rem;">
        A roof replacement in {city["name"]} ({city["county"]}, elevation {city["elev"]} ft) typically costs <strong>{city["cost"]}</strong> depending on home size and materials. {city["name"]} experiences hail season from <strong>{city["hail"]}</strong>, and insurance often covers storm damage in full. Frame Roofing Utah provides free inspections, handles all insurance claims and {city["county"]} building permits, and backs every project with a 10-year workmanship warranty. Licensed Utah contractor (DOPL #14256097-5501), BBB A+ accredited. Serving ZIP codes {city["zips"]}. Call <strong>435-302-4422</strong> for a free inspection.
      </p>
    </div>'''

def process_file(filepath, city_key):
    """Add direct-answer block after the section-label span."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if already added
    if 'class="direct-answer"' in content:
        print(f"  SKIP: Direct-answer block already exists")
        return True
    
    city = CITY_DATA.get(city_key)
    if not city:
        print(f"  ✗ No city data for {city_key}")
        return False
    
    answer_block = build_direct_answer(city)
    
    # Insert after the <span class="section-label"> line and the <h2> that follows it
    # Target: after the first <h2>...</h2> inside content-section
    marker = '<span class="section-label">Uncompromising Quality</span>'
    idx = content.find(marker)
    if idx == -1:
        # Try alternate markers
        marker = '<span class="section-label">'
        idx = content.find(marker)
    
    if idx == -1:
        print(f"  ✗ No section-label found")
        return False
    
    # Find the first <h2> after the section label
    h2_start = content.find('<h2>', idx)
    if h2_start == -1:
        print(f"  ✗ No h2 found after section label")
        return False
    
    h2_end = content.find('</h2>', h2_start) + len('</h2>')
    
    # Insert the direct-answer block right after the first h2
    content = content[:h2_end] + '\n' + answer_block + content[h2_end:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"  ✓ Direct-answer block added for {city['name']}")
    return True

print("=" * 60)
print("ADDING DIRECT-ANSWER BLOCKS — ALL LOCATION PAGES")
print("=" * 60)

files = sorted([f for f in os.listdir(BASE) if f.endswith('.html')])
success = 0
for f in files:
    city_key = f.replace('.html', '')
    filepath = os.path.join(BASE, f)
    print(f"\n→ {f}...")
    if process_file(filepath, city_key):
        success += 1

print(f"\n{'=' * 60}")
print(f"COMPLETE: {success}/{len(files)} pages with direct-answer blocks")
print(f"{'=' * 60}")
