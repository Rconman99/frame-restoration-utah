#!/usr/bin/env python3
"""
Add Article schema to all location pages for GEO/AI citation optimization.
Injects after the FAQPage JSON-LD script block.
Includes digitalSourceType: "human" per March 2026 update best practices.
"""
import json, re, os
from datetime import datetime

BASE = "/Users/agenticmac/projects/frame-restoration-utah/locations"

def extract_city_name(filepath):
    """Extract city name from the <title> tag."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    m = re.search(r'<title>Premium Reroofing (.+?) UT', content)
    if m:
        return m.group(1)
    m = re.search(r'<meta name="geo.placename" content="(.+?),', content)
    if m:
        return m.group(1)
    return None

def extract_meta_desc(content):
    """Extract meta description."""
    m = re.search(r'<meta name="description" content="(.+?)"', content)
    return m.group(1) if m else ""

def extract_canonical(content):
    """Extract canonical URL."""
    m = re.search(r'<link rel="canonical" href="(.+?)"', content)
    return m.group(1) if m else ""

def extract_og_image(content):
    """Extract OG image URL."""
    m = re.search(r'<meta property="og:image" content="(.+?)"', content)
    return m.group(1) if m else "https://www.frameroofingutah.com/images/og-image.webp"

def build_article_schema(city_name, description, url, image_url):
    """Build Article JSON-LD schema."""
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": f"Premium Reroofing in {city_name}, Utah — Expert Roof Replacement Services",
        "description": description,
        "url": url,
        "image": image_url,
        "author": {
            "@type": "Person",
            "name": "Landon Yokers",
            "jobTitle": "Owner & Licensed Contractor",
            "url": "https://www.frameroofingutah.com/pages/about",
            "worksFor": {
                "@type": "Organization",
                "name": "Frame Roofing Utah",
                "url": "https://www.frameroofingutah.com"
            }
        },
        "publisher": {
            "@type": "Organization",
            "name": "Frame Roofing Utah",
            "url": "https://www.frameroofingutah.com",
            "logo": {
                "@type": "ImageObject",
                "url": "https://www.frameroofingutah.com/images/logo-darkblue.webp"
            }
        },
        "datePublished": "2025-01-15",
        "dateModified": datetime.now().strftime("%Y-%m-%d"),
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": url
        },
        "about": {
            "@type": "Service",
            "name": f"Roof Replacement in {city_name}",
            "provider": {
                "@type": "RoofingContractor",
                "name": "Frame Roofing Utah"
            },
            "areaServed": {
                "@type": "City",
                "name": city_name,
                "containedInPlace": {
                    "@type": "State",
                    "name": "Utah"
                }
            }
        },
        "digitalSourceType": "https://cv.iptc.org/newscodes/digitalsourcetype/humanWritten"
    }

def process_file(filepath):
    """Add Article schema to a location page."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if Article schema already exists
    if '"@type": "Article"' in content or '"@type":"Article"' in content:
        print(f"  SKIP: Article schema already exists")
        return True
    
    city_name = extract_city_name(filepath)
    if not city_name:
        print(f"  ✗ Could not extract city name")
        return False
    
    description = extract_meta_desc(content)
    url = extract_canonical(content)
    image_url = extract_og_image(content)
    
    article_schema = build_article_schema(city_name, description, url, image_url)
    article_json = json.dumps(article_schema, indent=2, ensure_ascii=False)
    
    # Find the FAQPage script closing tag to insert after it
    faq_idx = content.find('"FAQPage"')
    if faq_idx == -1:
        print(f"  ✗ No FAQPage found to anchor insertion")
        return False
    
    faq_script_end = content.find('</script>', faq_idx)
    if faq_script_end == -1:
        print(f"  ✗ No script end after FAQPage")
        return False
    faq_script_end += len('</script>')
    
    # Insert Article schema after FAQPage script
    article_block = f'\n<script type="application/ld+json">\n{article_json}\n</script>'
    content = content[:faq_script_end] + article_block + content[faq_script_end:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"  ✓ Article schema added for {city_name}")
    return True

print("=" * 60)
print("ADDING ARTICLE SCHEMA — ALL LOCATION PAGES")
print("=" * 60)

files = sorted([f for f in os.listdir(BASE) if f.endswith('.html')])
success = 0
for f in files:
    filepath = os.path.join(BASE, f)
    print(f"\n→ {f}...")
    if process_file(filepath):
        success += 1

print(f"\n{'=' * 60}")
print(f"COMPLETE: {success}/{len(files)} pages with Article schema")
print(f"{'=' * 60}")
