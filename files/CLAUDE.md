# Frame Restoration Utah — SEO Implementation Brief
# Claude Code Master Instructions

> Upload this file to your project root. Claude Code will read it automatically.
> Run tasks in order. Each section is a self-contained sprint.

---

## PROJECT CONTEXT

**Site**: Frame Restoration Utah — roofing, storm damage, restoration, solar, general contracting
**URL**: https://frame-restoration-utah.vercel.app (needs custom domain)
**Stack**: Assumed Next.js 14+ on Vercel (App Router). If using Pages Router, adjust accordingly.
**Phone**: 435-302-4422
**Address**: 142 S Main St, Heber City, UT 84032
**Hours**: Mon–Sat 8AM–6PM
**Email**: info@framerestorationutah.com
**Primary goal**: Rank for Utah roofing + storm damage keywords, drive free inspection leads

---

## SPRINT 1 — METADATA & SEO FOUNDATION
### Goal: Fix all title tags, meta descriptions, and add canonical/OG tags sitewide

**Task 1.1 — Update homepage metadata**

Find the homepage metadata (likely in `app/page.tsx`, `app/layout.tsx`, or `pages/index.tsx`) and replace/add:

```typescript
export const metadata = {
  title: 'Utah Roofing Contractor | Storm Damage & Free Inspections | Frame Restoration',
  description: 'Frame Restoration Utah offers free roof inspections across the Wasatch Front. Storm damage, hail repair, full replacements & insurance claims. Licensed & insured. Call 435-302-4422.',
  keywords: 'roofing contractor Utah, storm damage roof repair, hail damage roof Utah, free roof inspection Salt Lake City, roof replacement Wasatch Front',
  openGraph: {
    title: 'Frame Restoration Utah | Roofing & Storm Damage Experts',
    description: 'Free roof inspections. Storm damage specialists. Insurance claim experts. Serving 40+ Utah communities. Call 435-302-4422.',
    url: 'https://framerestorationutah.com',
    siteName: 'Frame Restoration Utah',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Frame Restoration Utah | Free Roof Inspections',
    description: 'Storm damage, hail repair & full roof replacements across the Wasatch Front. Call 435-302-4422.',
  },
  alternates: {
    canonical: 'https://framerestorationutah.com',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}
```

**Task 1.2 — Add metadata to all service pages**

For each page in `/pages/` or `/app/pages/`, add unique metadata:

- **Residential Roofing**: `title: 'Residential Roofing Utah | Shingle, Metal & Tile Roofs | Frame Restoration'`, description includes: shingles, metal, tile, flat roofs, freeze-thaw, Wasatch snowload
- **Commercial Roofing**: `title: 'Commercial Roofing Utah | TPO, EPDM & Flat Roof Systems | Frame Restoration'`, description includes: HOAs, multifamily, industrial, flat roofing
- **Storm Damage**: `title: 'Storm & Hail Damage Roof Repair Utah | Insurance Claim Experts | Frame Restoration'`, description includes: hail, wind, snow, insurance adjuster, Wasatch Front
- **Water Fire Flood**: `title: 'Water, Fire & Flood Restoration Utah | 24/7 Emergency | Frame Restoration'`, description includes: water intrusion, fire damage, flooding, emergency, pre-loss condition
- **Solar**: `title: 'Solar Installation Utah | Roof-Integrated Solar | Frame Restoration'`, description includes: 300 sunny days, Salt Lake Valley, energy bills, roof protection
- **General Contracting**: `title: 'General Contractor Utah | Kitchen, Bath & Home Additions | Frame Restoration'`, description includes: remodels, renovations, additions, licensed, Heber City

**Task 1.3 — Add robots.txt**

Create `/public/robots.txt`:
```
User-agent: *
Allow: /

Sitemap: https://framerestorationutah.com/sitemap.xml
```

**Task 1.4 — Generate dynamic sitemap**

Create `/app/sitemap.ts` (Next.js 14) or `/pages/sitemap.xml.ts`:

```typescript
import { MetadataRoute } from 'next'

const cities = [
  'salt-lake-city', 'west-jordan', 'sandy', 'draper', 'south-jordan',
  'riverton', 'herriman', 'bluffdale', 'murray', 'millcreek',
  'cottonwood-heights', 'holladay', 'midvale', 'taylorsville', 'kearns',
  'magna', 'west-valley-city', 'south-salt-lake', 'bountiful', 'north-salt-lake',
  'west-bountiful', 'woods-cross', 'centerville', 'farmington', 'kaysville',
  'layton', 'clearfield', 'syracuse', 'clinton', 'lehi', 'alpine', 'highland',
  'american-fork', 'pleasant-grove', 'lindon', 'orem', 'provo', 'springville',
  'payson', 'santaquin', 'heber-city', 'midway', 'park-city'
]

const services = [
  'residential-roofing', 'commercial-roofing', 'storm-damage-restoration',
  'water-fire-flood-restoration', 'solar-installation', 'general-contracting'
]

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://framerestorationutah.com'
  const now = new Date()

  const locationPages = cities.map(city => ({
    url: `${baseUrl}/locations/${city}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  const servicePages = services.map(service => ({
    url: `${baseUrl}/pages/${service}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.9,
  }))

  return [
    { url: baseUrl, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    ...servicePages,
    ...locationPages,
  ]
}
```

---

## SPRINT 2 — SCHEMA MARKUP
### Goal: Add structured data to homepage and all key page types

**Task 2.1 — Create schema component**

Create `/components/SchemaMarkup.tsx`:

```typescript
export function LocalBusinessSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "RoofingContractor",
    "name": "Frame Restoration Utah",
    "alternateName": "Frame Restoration",
    "url": "https://framerestorationutah.com",
    "logo": "https://framerestorationutah.com/logo.png",
    "image": "https://framerestorationutah.com/og-image.jpg",
    "description": "Frame Restoration Utah provides roofing, storm damage repair, insurance claim assistance, water and fire restoration, solar installation, and general contracting across the Wasatch Front.",
    "telephone": "+14353024422",
    "email": "info@framerestorationutah.com",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "142 S Main St",
      "addressLocality": "Heber City",
      "addressRegion": "UT",
      "postalCode": "84032",
      "addressCountry": "US"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 40.5075,
      "longitude": -111.4133
    },
    "openingHoursSpecification": [
      {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
        "opens": "08:00",
        "closes": "18:00"
      }
    ],
    "areaServed": [
      "Salt Lake City, UT", "West Jordan, UT", "Sandy, UT", "Draper, UT",
      "South Jordan, UT", "Riverton, UT", "Herriman, UT", "Murray, UT",
      "Cottonwood Heights, UT", "Bountiful, UT", "Layton, UT", "Provo, UT",
      "Orem, UT", "Lehi, UT", "Heber City, UT", "Park City, UT"
    ],
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "5.0",
      "reviewCount": "500",
      "bestRating": "5",
      "worstRating": "1"
    },
    "review": [
      {
        "@type": "Review",
        "author": { "@type": "Person", "name": "Mike T." },
        "reviewRating": { "@type": "Rating", "ratingValue": "5" },
        "reviewBody": "After the hailstorm last spring, Frame Restoration walked me through every step of the insurance claim. Got way more from my adjuster than expected. Roof looks incredible.",
        "datePublished": "2025-06-01"
      },
      {
        "@type": "Review",
        "author": { "@type": "Person", "name": "Jennifer R." },
        "reviewRating": { "@type": "Rating", "ratingValue": "5" },
        "reviewBody": "Called at 7pm on a Sunday after wind damage. They had someone at my house within two hours for emergency tarping. Professional all the way.",
        "datePublished": "2025-08-15"
      },
      {
        "@type": "Review",
        "author": { "@type": "Person", "name": "Brad K." },
        "reviewRating": { "@type": "Rating", "ratingValue": "5" },
        "reviewBody": "Used them for a full re-roof on our Heber Valley home. Fair price, clean crew, done in two days.",
        "datePublished": "2025-10-01"
      }
    ],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "Roofing & Restoration Services",
      "itemListElement": [
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Residential Roofing", "url": "https://framerestorationutah.com/pages/residential-roofing" }},
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Commercial Roofing", "url": "https://framerestorationutah.com/pages/commercial-roofing" }},
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Storm Damage Restoration", "url": "https://framerestorationutah.com/pages/storm-damage-restoration" }},
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Water, Fire & Flood Restoration", "url": "https://framerestorationutah.com/pages/water-fire-flood-restoration" }},
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Solar Installation", "url": "https://framerestorationutah.com/pages/solar-installation" }},
        { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "General Contracting", "url": "https://framerestorationutah.com/pages/general-contracting" }}
      ]
    },
    "sameAs": [
      "https://www.bbb.org/us/ut/heber-city/profile/roofing-contractors/frame-restoration",
      "https://www.framerestorations.com/utah-home"
    ]
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function FAQSchema({ faqs }: { faqs: { question: string; answer: string }[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function ServiceSchema({ name, description, url, areaServed }: {
  name: string; description: string; url: string; areaServed: string[]
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": name,
    "description": description,
    "url": url,
    "provider": {
      "@type": "RoofingContractor",
      "name": "Frame Restoration Utah",
      "telephone": "+14353024422"
    },
    "areaServed": areaServed.map(city => ({
      "@type": "City",
      "name": city,
      "addressRegion": "UT"
    }))
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

**Task 2.2 — Add LocalBusinessSchema to homepage**

In `app/page.tsx` or wherever the homepage renders, import and add `<LocalBusinessSchema />` inside the `<head>` or at the top of the page component. Also add `<FAQSchema>` with the existing FAQ content.

Pass these FAQs to FAQSchema:
```typescript
const homeFAQs = [
  { question: "Does Frame Restoration work with insurance?", answer: "Yes. We specialize in insurance claim navigation. We document all storm and hail damage, work directly with your adjuster, and help ensure you receive the full payout you're entitled to. We've helped hundreds of Utah homeowners get claims approved." },
  { question: "Do you offer free inspections in Salt Lake City?", answer: "Yes — 100% free, no-obligation roof inspections across the entire Salt Lake Valley and Wasatch Front. From Bountiful and Layton in the north to Provo and Payson in the south. Call 435-302-4422 or schedule online." },
  { question: "What areas does Frame Restoration Utah serve?", answer: "We serve 40+ communities across the Wasatch Front including Salt Lake City, West Jordan, Sandy, Draper, Murray, Cottonwood Heights, Bountiful, Layton, Lehi, Orem, Provo, and more. Our home base is Heber City, UT." },
  { question: "What warranty do you offer on roofing work?", answer: "We back every job with a 5-year workmanship warranty plus lifetime material warranties from our manufacturer partners. If any issue with our work arises, we return and fix it at no charge." },
  { question: "Is Frame Restoration Utah licensed and insured?", answer: "Yes. Fully licensed and insured in Utah. Part of the Frame Restoration network which holds an A+ BBB rating and NRCA membership earned since 2014 in the Dallas-Fort Worth market." },
  { question: "Do you handle emergency storm damage in Utah?", answer: "Yes. We provide 24/7 emergency response for storm, hail, wind, and snow damage across the Wasatch Front. Call 435-302-4422 any time for urgent roof tarping, leak mitigation, and damage assessment." }
]
```

---

## SPRINT 3 — LOCATION PAGES
### Goal: Build 10 high-priority city pages with unique SEO content

**Task 3.1 — Create dynamic location page template**

Create `/app/locations/[city]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { LocalBusinessSchema } from '@/components/SchemaMarkup'
import { cityData } from '@/lib/cityData'

export async function generateStaticParams() {
  return Object.keys(cityData).map(city => ({ city }))
}

export async function generateMetadata({ params }: { params: { city: string } }) {
  const city = cityData[params.city]
  if (!city) return {}
  return {
    title: `Roofing Contractor in ${city.name}, UT | Free Inspections | Frame Restoration`,
    description: `Frame Restoration provides free roof inspections, storm damage repair & insurance claim help in ${city.name}, Utah. Licensed & insured. Call 435-302-4422 today.`,
    alternates: { canonical: `https://framerestorationutah.com/locations/${params.city}` }
  }
}

export default function LocationPage({ params }: { params: { city: string } }) {
  const city = cityData[params.city]
  if (!city) notFound()

  return (
    <>
      <LocalBusinessSchema />
      <main>
        <section className="hero">
          <h1>Roofing & Storm Damage Repair in {city.name}, Utah</h1>
          <p>{city.intro}</p>
          <a href="tel:+14353024422">Call 435-302-4422 — Free Inspection</a>
        </section>

        <section className="services">
          <h2>Roofing Services in {city.name}</h2>
          <p>Frame Restoration Utah serves {city.name} homeowners and businesses with a full range of roofing and restoration services:</p>
          <ul>
            <li><a href="/pages/residential-roofing">Residential Roofing</a> — new roofs, replacements, repairs</li>
            <li><a href="/pages/storm-damage-restoration">Storm & Hail Damage Repair</a> — insurance claim specialists</li>
            <li><a href="/pages/commercial-roofing">Commercial Roofing</a> — TPO, EPDM, flat roofing systems</li>
            <li><a href="/pages/water-fire-flood-restoration">Water, Fire & Flood Restoration</a> — 24/7 emergency</li>
            <li><a href="/pages/solar-installation">Solar Installation</a> — roof-integrated solar systems</li>
            <li><a href="/pages/general-contracting">General Contracting</a> — remodels, additions, renovations</li>
          </ul>
        </section>

        <section className="why-us">
          <h2>Why {city.name} Homeowners Choose Frame Restoration</h2>
          <p>{city.whyUs}</p>
          <ul>
            <li>Free, no-obligation roof inspections in {city.name}</li>
            <li>Insurance claim experts — we work directly with Utah adjusters</li>
            <li>5-year workmanship warranty on all roofing work</li>
            <li>24/7 emergency storm response in {city.county}</li>
            <li>A+ BBB rating | NRCA member | Fully licensed & insured in Utah</li>
          </ul>
        </section>

        <section className="nearby">
          <h2>Also Serving Nearby Communities</h2>
          <p>In addition to {city.name}, we serve: {city.nearby.join(', ')}.</p>
        </section>

        <section className="faq">
          <h2>Roofing FAQs for {city.name} Residents</h2>
          <div>
            <h3>Do you offer free roof inspections in {city.name}?</h3>
            <p>Yes — 100% free and no obligation. We serve all of {city.county} including {city.name}. Call 435-302-4422 or schedule online and we'll come to you.</p>
          </div>
          <div>
            <h3>How quickly can you respond to storm damage in {city.name}?</h3>
            <p>We offer 24/7 emergency response across the Wasatch Front including {city.name}. Call 435-302-4422 for same-day tarping and damage assessment after hail, wind, or snow storms.</p>
          </div>
          <div>
            <h3>Does Frame Restoration handle insurance claims for {city.name} homeowners?</h3>
            <p>Yes. We specialize in insurance claim navigation throughout {city.county}. We document all damage, work directly with your adjuster, and help you get the full payout you're entitled to.</p>
          </div>
        </section>

        <section className="cta">
          <h2>Get Your Free Roof Inspection in {city.name} Today</h2>
          <p>No pressure. No obligation. Just honest answers from Utah's roofing experts.</p>
          <a href="tel:+14353024422">Call 435-302-4422</a>
          <a href="https://calendar.app.google/tdbfvEqUtPHoAHvY8">Schedule Online</a>
        </section>
      </main>
    </>
  )
}
```

**Task 3.2 — Create city data file**

Create `/lib/cityData.ts` with this exact content:

```typescript
export interface CityData {
  name: string
  county: string
  intro: string
  whyUs: string
  nearby: string[]
}

export const cityData: Record<string, CityData> = {
  'salt-lake-city': {
    name: 'Salt Lake City',
    county: 'Salt Lake County',
    intro: 'Frame Restoration Utah serves Salt Lake City homeowners and businesses from the Avenues to Sugar House, Capitol Hill to the West Side. Whether you\'ve taken hail damage on a spring storm or need a full roof replacement before winter, our licensed Utah crew is ready with free inspections and no-pressure quotes.',
    whyUs: 'Salt Lake City sees some of the most unpredictable weather on the Wasatch Front — from heavy spring hailstorms to brutal winter snowloads. Frame Restoration has helped hundreds of SLC homeowners navigate storm damage claims and get new roofs installed before the next season hits.',
    nearby: ['West Valley City', 'South Salt Lake', 'Murray', 'Millcreek', 'Holladay']
  },
  'west-jordan': {
    name: 'West Jordan',
    county: 'Salt Lake County',
    intro: 'Frame Restoration Utah proudly serves West Jordan — one of the fastest-growing communities in the Salt Lake Valley. From new construction roofing to emergency hail damage repair, our team is stationed close by and ready to respond fast.',
    whyUs: 'West Jordan\'s rapid growth means many homes with roofs approaching their replacement window. Our team helps West Jordan homeowners assess their roof\'s condition honestly and plan replacements that protect their investment for decades.',
    nearby: ['South Jordan', 'Riverton', 'Herriman', 'Taylorsville', 'Kearns']
  },
  'sandy': {
    name: 'Sandy',
    county: 'Salt Lake County',
    intro: 'Frame Restoration Utah serves Sandy and the south valley with full-service roofing, storm damage repair, and insurance claim navigation. From Alta Canyon to the Jordan River corridor, we cover all of Sandy with free inspections and honest assessments.',
    whyUs: 'Sandy sits at the foot of the Wasatch Mountains and takes the brunt of intense hailstorms that move down the canyons each summer. Our storm damage specialists know exactly how to document Sandy-area hail damage and negotiate maximum insurance payouts for homeowners.',
    nearby: ['Draper', 'South Jordan', 'Murray', 'Midvale', 'Cottonwood Heights']
  },
  'draper': {
    name: 'Draper',
    county: 'Salt Lake County',
    intro: 'Frame Restoration Utah serves Draper from the foothills to the Valley floor. Draper homeowners trust us for everything from free storm damage inspections to premium metal roof installations that handle Utah\'s mountain weather beautifully.',
    whyUs: 'Draper\'s elevation and proximity to the Wasatch Mountains means more exposure to heavy snow, wind, and summer hailstorms than lower valley communities. We build roofs that are engineered for Draper\'s specific weather demands.',
    nearby: ['Sandy', 'South Jordan', 'Riverton', 'Bluffdale', 'Herriman']
  },
  'provo': {
    name: 'Provo',
    county: 'Utah County',
    intro: 'Frame Restoration Utah serves Provo and Utah County with the same A+ BBB standards that built our reputation across the Wasatch Front. From BYU campus neighborhoods to East Bay, our licensed crew handles roofing, storm damage, and full restorations.',
    whyUs: 'Provo and Utah County homeowners benefit from our deep experience with insurance claims — one of the most valuable services we offer in areas hit by recurring summer hailstorms moving up from Utah Lake.',
    nearby: ['Orem', 'Springville', 'Lindon', 'Pleasant Grove', 'Payson']
  },
  'orem': {
    name: 'Orem',
    county: 'Utah County',
    intro: 'Frame Restoration Utah brings free roof inspections and expert storm damage services to Orem homeowners. Whether you\'re near Center Street or the mouth of Provo Canyon, our team is ready to assess your roof and handle your insurance claim from start to finish.',
    whyUs: 'Orem homeowners frequently deal with hail damage that gets underestimated by insurance adjusters. Our documentation process and claim expertise help Orem residents recover the full value of their damaged roofs — not just what a quick adjuster assessment finds.',
    nearby: ['Provo', 'Lindon', 'American Fork', 'Pleasant Grove', 'Vineyard']
  },
  'heber-city': {
    name: 'Heber City',
    county: 'Wasatch County',
    intro: 'Frame Restoration Utah is headquartered in Heber City, making us the most responsive roofing contractor in Wasatch County and the Heber Valley. From Main Street to the bench neighborhoods above town, we\'re your local roofing neighbors — not a company driving in from the valley.',
    whyUs: 'As Heber City locals, we understand the unique roofing challenges of the Heber Valley — from extreme temperature swings to heavy Wasatch Back snowloads. We\'ve built our business here and we\'re invested in protecting every home in our community.',
    nearby: ['Midway', 'Daniel', 'Charleston', 'Park City', 'Deer Creek area']
  },
  'lehi': {
    name: 'Lehi',
    county: 'Utah County',
    intro: 'Frame Restoration Utah serves Lehi\'s booming communities — from Silicon Slopes to the old town core. Whether you\'re in a new Thanksgiving Point-area subdivision or a legacy home near Lehi Main Street, our team provides free inspections and honest roofing assessments.',
    whyUs: 'Lehi\'s rapid growth means thousands of homes with builder-grade roofing reaching end-of-life simultaneously. We help Lehi homeowners understand when to repair vs. replace, and we do it without the high-pressure tactics common in the area.',
    nearby: ['American Fork', 'Highland', 'Alpine', 'Saratoga Springs', 'Vineyard']
  },
  'murray': {
    name: 'Murray',
    county: 'Salt Lake County',
    intro: 'Frame Restoration Utah serves Murray from Fashion Place to the Jordan River. Murray\'s central location makes it a hub for our crew, meaning fast response times for everything from free inspections to emergency tarping after storm damage.',
    whyUs: 'Murray\'s central Salt Lake County location means our team can typically reach you faster than competitors based further out. For Murray homeowners dealing with active leaks or storm damage, speed matters — and we deliver.',
    nearby: ['Midvale', 'Millcreek', 'South Salt Lake', 'Taylorsville', 'Cottonwood Heights']
  },
  'park-city': {
    name: 'Park City',
    county: 'Summit County',
    intro: 'Frame Restoration Utah serves Park City homeowners and mountain properties with premium roofing and restoration services. From Old Town historic homes to Deer Valley estates, we understand the unique demands of high-altitude, high-value properties in Summit County.',
    whyUs: 'Park City\'s mountain location means heavier snowloads, more freeze-thaw cycles, and higher stakes when something goes wrong. Our team installs roofs engineered for mountain conditions, and we carry the insurance and licensing to protect both you and your property.',
    nearby: ['Heber City', 'Midway', 'Kimball Junction', 'Jeremy Ranch', 'Snyderville']
  }
}
```

---

## SPRINT 4 — SERVICE PAGES
### Goal: Build full SEO-optimized content for all 6 service pages

**Task 4.1 — Storm Damage page (highest priority — best keyword opportunity)**

Find or create `/app/pages/storm-damage-restoration/page.tsx`. It must include:

**H1**: "Storm & Hail Damage Roof Repair in Utah | Insurance Claim Specialists"

**Body content** (write in JSX, minimum 600 words):

Section 1 — "Utah Hail & Storm Damage Roofing Specialists"
Frame Restoration Utah specializes in hail, wind, and snow damage roofing across the Wasatch Front. When a storm hits your home in Salt Lake City, Sandy, West Jordan, or anywhere in our 40+ city service area, we respond fast — with free inspections, thorough damage documentation, and direct coordination with your insurance adjuster.

Section 2 — "How the Storm Damage & Insurance Claim Process Works"
Include numbered steps:
1. Free inspection — we assess all damage at no cost or obligation
2. Documentation — detailed photo and written report of all storm-related damage
3. Insurance coordination — we work directly with your adjuster, not against you
4. Approval — we help ensure you get the full payout you're entitled to
5. Installation — licensed crew installs your new roof with 5-year warranty
6. Final walkthrough — we inspect everything before we leave

Section 3 — "Types of Utah Storm Damage We Repair"
- Hail damage (the most common in Utah — granule loss, bruising, cracking)
- Wind damage (lifted shingles, missing sections, flashing failures)
- Snow and ice damage (ice dams, collapse risk, freeze-thaw cracking)
- Tree and debris impact damage

Section 4 — "Why Utah Homeowners Choose Frame Restoration for Insurance Claims"
- We've helped 500+ Utah homeowners navigate claims
- We know what adjusters look for — and what they miss
- We don't get paid until your claim is approved
- No out-of-pocket surprises

**H2 tags to include** (each targeting a keyword):
- "Hail Damage Roof Repair Utah"
- "How to File a Roof Insurance Claim in Utah"
- "Emergency Storm Tarping — 24/7 Utah"
- "Storm Damage FAQs"

Add `<ServiceSchema>` with:
- name: "Storm Damage Roof Repair"
- areaServed: Top 10 Utah cities

**Task 4.2 — Residential Roofing page**

H1: "Residential Roofing Utah | New Roofs, Replacements & Repairs"

Key sections:
- Roofing systems we install: Asphalt shingles, metal roofing, tile, flat/TPO
- Why Utah roofs are different (freeze-thaw, snowload, UV exposure at altitude)
- Our installation process (inspection → quote → materials → install → warranty)
- Manufacturer partnerships and certifications
- 5-year workmanship warranty details

H2 targets: "Utah Roof Replacement Cost", "Best Roofing Materials for Utah Climate", "Residential Roofing Warranty Utah"

**Task 4.3 — Remaining 4 service pages**

Apply same structure to:
- Commercial Roofing (focus: TPO, EPDM, flat roofs, HOAs, multifamily)
- Water Fire Flood Restoration (focus: 24/7 emergency, water extraction, fire cleanup, insurance)
- Solar Installation (focus: Utah's 300 sunny days, roof-integrated systems, energy savings, net metering)
- General Contracting (focus: kitchen/bath remodels, additions, one licensed contractor for everything)

Each page must have: unique H1, 500+ words, 3+ H2s targeting keywords, internal links to related service pages and top 3 location pages, ServiceSchema component.

---

## SPRINT 5 — BLOG POSTS
### Goal: Create 4 SEO blog posts targeting high-intent Utah roofing queries

**Task 5.1 — Create blog post structure**

Create `/app/blog/[slug]/page.tsx` with dynamic routing and metadata generation. Each post needs: title, meta description, canonical URL, author (Frame Restoration Utah), date, and structured Article schema.

**Task 5.2 — Write Post 1: Utah Hailstorm Guide**

File: `/app/blog/what-to-do-after-utah-hailstorm/page.tsx`
Title tag: "What to Do After a Hailstorm in Utah (Step-by-Step Guide) | Frame Restoration"
Meta description: "Utah hailstorm hit your home? Here's exactly what to do in the first 48 hours to protect your roof, document damage, and maximize your insurance claim."

Post structure (1,000+ words):
1. Intro — Utah hailstorms are common and damaging (mention Wasatch Front hail season: May–September)
2. Step 1: Stay safe — wait for storm to pass, watch for debris
3. Step 2: Do a visual assessment from the ground (what to look for: dented gutters, missing shingles, granules on ground)
4. Step 3: Document EVERYTHING before touching anything (photos with timestamps)
5. Step 4: Call your insurance company to report potential damage
6. Step 5: Schedule a free professional inspection BEFORE the adjuster comes
7. Step 6: Don't sign anything from storm chasers or out-of-state contractors
8. Why getting a contractor inspection first matters (Frame Restoration CTA)
9. FAQ: Does Utah homeowner's insurance cover hail? / How long do I have to file? / What if my roof is old?
10. CTA: Free inspection, 435-302-4422

**Task 5.3 — Write Post 2: Utah Roof Replacement Cost**

File: `/app/blog/utah-roof-replacement-cost/page.tsx`
Title: "How Much Does a Roof Replacement Cost in Utah? (2025 Guide)"
Meta: "Utah roof replacement costs range from $8,000–$25,000+ depending on size, material, and location. Here's what Wasatch Front homeowners actually pay in 2025."

Sections: Cost ranges by material (asphalt, metal, tile), factors that affect cost (sq footage, pitch, removal, permits), what's included in a Frame Restoration quote, when insurance covers it, CTA

**Task 5.4 — Write Post 3: Insurance Claim Guide**

File: `/app/blog/utah-roof-insurance-claim-guide/page.tsx`
Title: "How to File a Roof Insurance Claim in Utah (2025 Step-by-Step)"
Meta: "Filing a roof insurance claim in Utah doesn't have to be confusing. Here's exactly how the process works — and how Frame Restoration helps you get the most from your claim."

Sections: Does Utah home insurance cover roof damage?, Types of damage typically covered, The claim process step by step, Common mistakes that reduce your payout, How a roofing contractor helps vs. doing it alone, CTA

**Task 5.5 — Write Post 4: Utah Roofing Materials Guide**

File: `/app/blog/best-roofing-materials-utah-climate/page.tsx`
Title: "Best Roofing Materials for Utah's Climate (Wasatch Front Guide)"
Meta: "Utah's freeze-thaw cycles, heavy snowloads, and intense UV exposure are hard on roofs. Here's which roofing materials hold up best on the Wasatch Front."

Sections: Utah's unique climate challenges (altitude, UV, snowload, temperature swings), Asphalt shingles (pros/cons for Utah), Metal roofing (why it's growing fast in Utah), Tile roofing (beauty vs. snowload concerns), How to choose, CTA

---

## SPRINT 6 — MOBILE & CONVERSION IMPROVEMENTS
### Goal: Add sticky mobile CTA bar and improve conversion elements

**Task 6.1 — Sticky mobile call bar**

Create `/components/MobileCallBar.tsx`:

```typescript
'use client'
import { useState, useEffect } from 'react'

export function MobileCallBar() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#1a3a5c] text-white p-4 flex items-center justify-between shadow-lg border-t-2 border-yellow-400">
      <div>
        <p className="text-xs font-semibold text-yellow-400">FREE ROOF INSPECTION</p>
        <p className="text-xs text-gray-300">No pressure • No obligation</p>
      </div>
      <a
        href="tel:+14353024422"
        className="bg-yellow-400 text-[#1a3a5c] font-bold px-5 py-3 rounded-lg text-sm"
        onClick={() => { /* track conversion */ }}
      >
        Call Now
      </a>
    </div>
  )
}
```

Import and add `<MobileCallBar />` to your root layout (`app/layout.tsx`).

**Task 6.2 — Google Analytics 4 setup**

Add to `/app/layout.tsx` inside `<head>`:

```typescript
// Replace G-XXXXXXXXXX with your actual GA4 measurement ID
// Get it from: analytics.google.com > Admin > Data Streams > Web Stream
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX" />
<script
  dangerouslySetInnerHTML={{
    __html: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-XXXXXXXXXX');
      // Track phone clicks
      document.addEventListener('click', function(e) {
        if (e.target.href && e.target.href.startsWith('tel:')) {
          gtag('event', 'phone_call', { 'event_category': 'conversion', 'event_label': 'click_to_call' });
        }
      });
    `
  }}
/>
```

**Task 6.3 — Form thank-you redirect**

After form submission on the contact/inspection form, redirect to `/thank-you`. Create `/app/thank-you/page.tsx`:

```typescript
export const metadata = {
  title: 'Thank You | Frame Restoration Utah',
  robots: { index: false } // Don't index thank-you page
}

export default function ThankYou() {
  return (
    <main className="min-h-screen flex items-center justify-center text-center p-8">
      <div>
        <h1 className="text-3xl font-bold mb-4">You're All Set!</h1>
        <p className="text-lg mb-2">We received your inspection request.</p>
        <p className="mb-6">A Frame Restoration specialist will call you within 15 minutes during business hours.</p>
        <p className="font-semibold">Need to reach us right now?</p>
        <a href="tel:+14353024422" className="text-2xl font-bold text-blue-700">435-302-4422</a>
      </div>
    </main>
  )
}
```

---

## SPRINT 7 — GOOGLE SEARCH CONSOLE & INDEXING
### Goal: Get the site indexed ASAP

**Task 7.1 — Verify Google Search Console**

1. Go to https://search.google.com/search-console/
2. Add property → URL prefix → enter `https://framerestorationutah.com` (or current Vercel URL)
3. Download the HTML verification file → place in `/public/` folder
4. Deploy → verify

**Task 7.2 — Submit sitemap**

After deploying sitemap.ts changes:
1. In Search Console → Sitemaps → add `https://framerestorationutah.com/sitemap.xml`
2. Request indexing on homepage: URL Inspection → Enter homepage URL → Request Indexing

**Task 7.3 — Domain setup (CRITICAL)**

The site must move from `frame-restoration-utah.vercel.app` to a real domain to rank competitively.

Recommended domain: `framerestorationutah.com` (check availability)
Alternatives: `framerestorationut.com`, `framerestorationutah.net`

Steps:
1. Purchase domain (Namecheap, Cloudflare Registrar, or Google Domains)
2. In Vercel dashboard → Project Settings → Domains → Add domain
3. Update DNS records as Vercel instructs
4. Update ALL metadata canonical URLs from `vercel.app` to new domain
5. Resubmit sitemap in Search Console with new domain

---

## SPRINT 8 — FINAL CHECKS

Run through this checklist before calling the project done:

```
TECHNICAL
[ ] All pages return 200 status
[ ] No console errors
[ ] Mobile responsive (test at 375px width)
[ ] Page speed >70 on mobile (test: pagespeed.web.dev)
[ ] HTTPS active on custom domain

SEO
[ ] Homepage title = "Utah Roofing Contractor | Storm Damage & Free Inspections | Frame Restoration"
[ ] Every page has unique title + meta description
[ ] LocalBusiness schema on homepage (validate: schema.org/SchemaValidator)
[ ] FAQPage schema on homepage FAQ section
[ ] Sitemap accessible at /sitemap.xml
[ ] robots.txt accessible at /robots.txt
[ ] Google Search Console verified + sitemap submitted

CONTENT
[ ] 10 location pages live with unique copy
[ ] 6 service pages live with 500+ words each
[ ] 4 blog posts live
[ ] All internal links working (location pages ↔ service pages)

CONVERSION
[ ] Phone number clickable in header on mobile
[ ] Sticky mobile call bar visible on phones
[ ] Form redirects to /thank-you after submission
[ ] GA4 tracking installed

LOCAL SEO (Do manually — not in code)
[ ] Google Business Profile fully complete
[ ] 20+ photos uploaded to GBP
[ ] Business listed on Yelp, BBB, Angi, HomeAdvisor
[ ] NAP consistent across all listings
```

---

## NOTES FOR CLAUDE CODE

- Ask Ryan before deleting any existing component or page
- If you hit a TypeScript error, fix it — don't disable type checking
- After each sprint, output a summary of what was changed and what to test
- If the stack turns out to be Pages Router (not App Router), adjust all file paths accordingly — ask Ryan to run `ls app/ pages/` if unclear
- Commit message format: `feat(seo): [what was done]`
- All content is for Frame Restoration Utah — do not hallucinate additional services or certifications not listed above
