#!/usr/bin/env python3
"""
Add comparison tables to key service pages for AI extraction optimization.
Tables are structured data that AI Overviews and ChatGPT heavily prefer for citations.
"""
import os

BASE = "/Users/agenticmac/projects/frame-restoration-utah/pages"

TABLE_STYLE = '''<style>
.compare-table { width:100%; border-collapse:collapse; margin:24px 0 32px; font-size:15px; }
.compare-table th { background:#0B4060; color:#fff; padding:12px 16px; text-align:left; font-family:'Archivo Black',sans-serif; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; }
.compare-table td { padding:12px 16px; border-bottom:1px solid #e2e8f0; color:#374151; line-height:1.5; }
.compare-table tr:nth-child(even) td { background:#f8f9fa; }
.compare-table tr:hover td { background:#f0f7ff; }
.compare-table .highlight { background:#fef3c7 !important; font-weight:600; }
</style>'''

TABLES = {
    "roof-replacement.html": {
        "marker": '<h2>Materials We Install</h2>',
        "html": f'''
    <h2>Roofing Material Comparison for Utah Homes</h2>
    <div style="overflow-x:auto;">
    <table class="compare-table">
      <thead>
        <tr>
          <th>Material</th>
          <th>Cost per Sq Ft</th>
          <th>Lifespan</th>
          <th>Hail Rating</th>
          <th>Best For</th>
          <th>Insurance Discount</th>
        </tr>
      </thead>
      <tbody>
        <tr class="highlight">
          <td><strong>Class 4 Architectural Shingles</strong></td>
          <td>$4.50–$6.50</td>
          <td>30–40 years</td>
          <td>Class 4 (UL 2218)</td>
          <td>Most Utah homes — best value</td>
          <td>10–28% premium reduction</td>
        </tr>
        <tr>
          <td>Standard Architectural Shingles</td>
          <td>$3.50–$5.00</td>
          <td>25–35 years</td>
          <td>Class 1–2</td>
          <td>Budget-conscious homeowners</td>
          <td>None</td>
        </tr>
        <tr>
          <td>Standing Seam Metal</td>
          <td>$8.00–$14.00</td>
          <td>50–70 years</td>
          <td>Dent-resistant</td>
          <td>Mountain homes above 5,500 ft</td>
          <td>Varies by insurer</td>
        </tr>
        <tr>
          <td>Stone-Coated Steel</td>
          <td>$7.00–$12.00</td>
          <td>40–60 years</td>
          <td>Class 4</td>
          <td>Tile look without the weight</td>
          <td>10–20%</td>
        </tr>
        <tr>
          <td>Synthetic Shake</td>
          <td>$6.00–$10.00</td>
          <td>40–50 years</td>
          <td>Class 4</td>
          <td>HOA communities, fire zones</td>
          <td>Varies</td>
        </tr>
        <tr>
          <td>Concrete Tile</td>
          <td>$10.00–$18.00</td>
          <td>50+ years</td>
          <td>Variable</td>
          <td>New construction, low elevations</td>
          <td>None typically</td>
        </tr>
      </tbody>
    </table>
    </div>
    <p style="font-size:13px;color:#6b7280;margin-top:-16px;"><em>Costs are 2026 estimates for Utah installations including labor and materials. Actual costs vary by home size, roof pitch, and accessibility. Insurance may cover 100% of storm-damage replacements.</em></p>
'''
    },
    "roof-repair.html": {
        "marker": '<section class="page-cta">',
        "insert_before": True,
        "html": f'''
  <div class="content-section">
    <h2>Roof Repair vs. Replacement: When Each Makes Sense</h2>
    <div style="overflow-x:auto;">
    <table class="compare-table">
      <thead>
        <tr>
          <th>Factor</th>
          <th>Repair</th>
          <th>Full Replacement</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Roof Age</strong></td>
          <td>Under 15 years — repair is usually cost-effective</td>
          <td>Over 20 years — replacement provides better long-term value</td>
        </tr>
        <tr>
          <td><strong>Damage Extent</strong></td>
          <td>Isolated to one area (under 30% of roof)</td>
          <td>Widespread across multiple slopes or planes</td>
        </tr>
        <tr>
          <td><strong>Cost</strong></td>
          <td>$300–$3,000 for most residential repairs</td>
          <td>$8,000–$25,000+ depending on home size and materials</td>
        </tr>
        <tr>
          <td><strong>Insurance Coverage</strong></td>
          <td>Usually not covered (maintenance issue)</td>
          <td>Often fully covered after storm damage</td>
        </tr>
        <tr>
          <td><strong>Timeline</strong></td>
          <td>Same day to 1 day</td>
          <td>1–5 days depending on complexity</td>
        </tr>
        <tr>
          <td><strong>Best When</strong></td>
          <td>Single leak, missing shingles, minor flashing issue</td>
          <td>Multiple failures, storm damage, selling your home</td>
        </tr>
      </tbody>
    </table>
    </div>
    <p style="font-size:13px;color:#6b7280;"><em>Not sure which you need? Frame Roofing Utah provides free inspections with an honest recommendation — we'll never push a replacement when a repair will do the job.</em></p>
  </div>
</section>
<section>
'''
    },
    "storm-damage.html": {
        "marker": '<section class="page-cta">',
        "insert_before": True,
        "html": f'''
  <div class="content-section">
    <h2>Utah Storm Damage: Types and What Insurance Covers</h2>
    <div style="overflow-x:auto;">
    <table class="compare-table">
      <thead>
        <tr>
          <th>Damage Type</th>
          <th>Common Signs</th>
          <th>Insurance Coverage</th>
          <th>Urgency</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Hail Damage</strong></td>
          <td>Dents on vents/gutters, granule loss, bruised shingles</td>
          <td>Typically covered in full — file within 72 hours</td>
          <td>Inspect within 48 hours of storm</td>
        </tr>
        <tr>
          <td><strong>Wind Damage</strong></td>
          <td>Lifted/missing shingles, exposed underlayment, debris impact</td>
          <td>Covered — document with photos immediately</td>
          <td>High — exposed areas leak fast</td>
        </tr>
        <tr>
          <td><strong>Ice Dam Damage</strong></td>
          <td>Interior water stains, icicle buildup on eaves, peeling paint</td>
          <td>Varies — sudden damage usually covered, gradual may not be</td>
          <td>Address before next freeze cycle</td>
        </tr>
        <tr>
          <td><strong>Heavy Snow Load</strong></td>
          <td>Sagging deck, cracked rafters, interior ceiling distortion</td>
          <td>Structural damage typically covered</td>
          <td>Emergency — risk of collapse</td>
        </tr>
        <tr>
          <td><strong>Fallen Tree/Debris</strong></td>
          <td>Visible impact damage, punctured membrane, broken decking</td>
          <td>Covered under dwelling coverage</td>
          <td>Emergency — tarp immediately</td>
        </tr>
      </tbody>
    </table>
    </div>
    <p style="font-size:13px;color:#6b7280;"><em>Frame Roofing Utah provides free storm damage inspections and handles the full insurance claim process at no extra cost. DOPL Licensed #14256097-5501. Call 435-302-4422.</em></p>
  </div>
</section>
<section>
'''
    },
    "insurance-claims.html": {
        "marker": '<section class="page-cta">',
        "insert_before": True,
        "html": f'''
  <div class="content-section">
    <h2>Utah Roof Insurance Claim Timeline</h2>
    <div style="overflow-x:auto;">
    <table class="compare-table">
      <thead>
        <tr>
          <th>Step</th>
          <th>What Happens</th>
          <th>Timeline</th>
          <th>What Frame Restoration Does</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>1. Storm Event</strong></td>
          <td>Hail, wind, or debris damages your roof</td>
          <td>Day 0</td>
          <td>Call us for a free inspection — 435-302-4422</td>
        </tr>
        <tr>
          <td><strong>2. Professional Inspection</strong></td>
          <td>We document all damage with detailed photos and measurements</td>
          <td>Within 24–48 hours</td>
          <td>Free — comprehensive roof, gutter, and siding assessment</td>
        </tr>
        <tr>
          <td><strong>3. File Your Claim</strong></td>
          <td>Contact your insurance company to open a claim</td>
          <td>Within 72 hours of storm</td>
          <td>We provide documentation and guidance for filing</td>
        </tr>
        <tr>
          <td><strong>4. Adjuster Visit</strong></td>
          <td>Insurance adjuster inspects the roof</td>
          <td>1–2 weeks after filing</td>
          <td>We meet your adjuster on the roof to ensure nothing is missed</td>
        </tr>
        <tr>
          <td><strong>5. Estimate & Supplements</strong></td>
          <td>Insurance issues initial estimate; we submit supplements if needed</td>
          <td>1–3 weeks</td>
          <td>We review the estimate line-by-line and fight for full coverage</td>
        </tr>
        <tr>
          <td><strong>6. Roof Replacement</strong></td>
          <td>Full tear-off and premium installation</td>
          <td>1–5 days</td>
          <td>Professional installation with 10-year workmanship warranty</td>
        </tr>
        <tr>
          <td><strong>7. Final Inspection</strong></td>
          <td>City permit closeout and final walkthrough</td>
          <td>Same day</td>
          <td>We handle permit closeout and ensure your complete satisfaction</td>
        </tr>
      </tbody>
    </table>
    </div>
    <p style="font-size:13px;color:#6b7280;"><em>Most Utah homeowners pay only their deductible for storm-damage roof replacements. Frame Roofing Utah handles the entire process at no additional cost.</em></p>
  </div>
</section>
<section>
'''
    }
}

print("=" * 60)
print("ADDING COMPARISON TABLES — SERVICE PAGES")
print("=" * 60)

success = 0
for filename, config in TABLES.items():
    filepath = os.path.join(BASE, filename)
    if not os.path.exists(filepath):
        print(f"\n→ {filename}... SKIP (not found)")
        continue
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'compare-table' in content:
        print(f"\n→ {filename}... SKIP (table already exists)")
        success += 1
        continue
    
    # Add table style if not present
    if TABLE_STYLE not in content and '.compare-table' not in content:
        # Insert style before </head>
        content = content.replace('</head>', TABLE_STYLE + '\n</head>')
    
    marker = config['marker']
    idx = content.find(marker)
    if idx == -1:
        print(f"\n→ {filename}... ✗ Marker not found: {marker[:40]}")
        continue
    
    if config.get('insert_before'):
        content = content[:idx] + config['html'] + content[idx:]
    else:
        # Insert after marker line
        end_of_line = content.find('\n', idx)
        content = content[:end_of_line+1] + config['html'] + content[end_of_line+1:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"\n→ {filename}... ✓ Comparison table added")
    success += 1

print(f"\n{'=' * 60}")
print(f"COMPLETE: {success}/{len(TABLES)} service pages with comparison tables")
print(f"{'=' * 60}")
