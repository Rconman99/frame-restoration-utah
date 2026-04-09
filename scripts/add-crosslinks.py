#!/usr/bin/env python3
"""Add internal cross-links between 6 priority cities and service pages."""
import re

CITIES = {
    "west-jordan": "West Jordan",
    "sandy": "Sandy",
    "draper": "Draper",
    "murray": "Murray",
    "south-jordan": "South Jordan",
    "cottonwood-heights": "Cottonwood Heights",
}

SERVICE_PAGES = [
    ("/pages/roof-replacement", "Roof Replacement"),
    ("/pages/storm-damage", "Storm Damage Repair"),
    ("/pages/insurance-claims", "Insurance Claims"),
    ("/pages/emergency-tarping", "Emergency Tarping"),
    ("/pages/commercial-roofing", "Commercial Roofing"),
    ("/pages/roof-repair", "Roof Repair"),
]

CROSSLINK_TEMPLATE = '''
<section class="crosslink-section" style="padding:2rem 0;background:#fff;">
  <div style="max-width:800px;margin:0 auto;padding:0 1.5rem;">
    <h2 style="font-size:1.4rem;font-weight:800;color:#0B4060;margin-bottom:1rem;">Frame Roofing Utah Across the Salt Lake Valley</h2>
    <p style="color:#334155;margin-bottom:1rem;">We deliver the same uncompromising quality across every community we serve. Explore roofing services in nearby cities:</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:1.5rem;">
{city_links}
    </div>
    <h3 style="font-size:1.1rem;font-weight:700;color:#0B4060;margin:1.5rem 0 0.75rem;">Our Roofing Services</h3>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
{service_links}
    </div>
  </div>
</section>
'''

CHIP_STYLE = 'display:inline-block;padding:8px 16px;background:#f1f5f9;border-radius:6px;text-decoration:none;color:#0B4060;font-weight:600;font-size:14px;border:1px solid #e2e8f0;transition:all 0.2s;'

for slug, name in CITIES.items():
    filepath = f"/Users/agenticmac/projects/frame-restoration-utah/locations/{slug}.html"
    
    # Build city links (exclude current city)
    city_links = []
    for s, n in CITIES.items():
        if s != slug:
            city_links.append(f'      <a href="/locations/{s}" style="{CHIP_STYLE}">{n} Roofing</a>')
    
    # Build service links
    service_links = []
    for url, label in SERVICE_PAGES:
        service_links.append(f'      <a href="{url}" style="{CHIP_STYLE}">{label}</a>')
    
    block = CROSSLINK_TEMPLATE.format(
        city_links="\n".join(city_links),
        service_links="\n".join(service_links),
    )
    
    with open(filepath, "r") as f:
        html = f.read()
    
    # Insert before the page-cta section
    if "crosslink-section" in html:
        print(f"SKIP {slug} — already has crosslinks")
        continue
    
    marker = '<section class="page-cta">'
    if marker in html:
        html = html.replace(marker, block + "\n" + marker, 1)
        with open(filepath, "w") as f:
            f.write(html)
        print(f"OK {slug} — crosslink section added")
    else:
        print(f"WARN {slug} — no page-cta marker found")
