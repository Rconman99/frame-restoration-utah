# Customer Request Batch

Generated: 2026-05-16T22:47:10.247Z

Build: Frame Roofing Utah

Mode: legacy

Batch: `local-customer-request-batch-frame-roofing-utah-legacy-customer-request-pack`

## Summary

- Total rows: 12
- Build blockers: 0
- Launch blockers: 2
- Quality rows: 7
- Growth backlog rows: 3
- Ready to send: 12
- Approval required: 9
- External sends blocked: yes

## Blocking Rows

- P0 Approve or remove public claims: Confirm or remove license, warranty, financing, emergency availability, insurance, certification, review-count, and years-in-business claims.
- P1 Confirm lead destination: Confirm where form leads, call alerts, quote requests, and appointment requests should go.

## Request Rows

| Priority | Status | Blocks | Section | Title | Ask | Response | Due | Approval | Destination | Sync key |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | ready_to_send | quality | NAP | Confirm public business details | Confirm the exact public business name, phone number, email, address/service-area status, and preferred contact path. | confirm_correct | 2026-05-20T22:47:10.247Z | needed | site footer / schema / citations / lead paths | `frame:frame-roofing-utah:customer_requests:confirm-nap` |
| P1 | ready_to_send | quality | Services | Confirm services | Mark each service as Yes, No, Maybe, or Later, and add any service you want included. | matrix | 2026-05-20T22:47:10.247Z | needed | sitemap / service pages / copy brief / schema | `frame:frame-roofing-utah:customer_requests:confirm-services` |
| P1 | ready_to_send | quality | Service Areas | Confirm service areas | Confirm the cities, neighborhoods, and ZIPs you actively serve now, plus any areas you want to grow into later. | matrix | 2026-05-20T22:47:10.247Z | needed | city pages / local schema / GBP plan / growth roadmap | `frame:frame-roofing-utah:customer_requests:confirm-service-areas` |
| P1 | ready_to_send | quality | Photos | Upload real job photos | Upload 5-10 real job photos, truck/signage photos, crew photos, or before/after sets. | file_upload | 2026-05-20T22:47:10.247Z | needed | homepage proof / service pages / case studies / GBP plan | `frame:frame-roofing-utah:customer_requests:upload-job-photos` |
| P1 | ready_to_send | quality | Brand | Owner story | In 2-4 sentences, tell us why homeowners or property owners choose your company. | short_text | 2026-05-20T22:47:10.247Z | needed | about page / homepage trust section / AEO answers | `frame:frame-roofing-utah:customer_requests:owner-about-story` |
| P1 | ready_to_send | quality | Brand | Upload owner or team photo | Upload an owner headshot, team photo, or office/truck photo we are allowed to use publicly. | file_upload | 2026-05-20T22:47:10.247Z | needed | about page / trust section / social proof | `frame:frame-roofing-utah:customer_requests:owner-headshot-team-photo` |
| P0 | ready_to_send | launch_blocker | Claims | Approve or remove public claims | Confirm or remove license, warranty, financing, emergency availability, insurance, certification, review-count, and years-in-business claims. | approval | 2026-05-20T22:47:10.247Z | needed | copy / schema / launch QA / Google profile plan | `frame:frame-roofing-utah:customer_requests:approve-public-claims` |
| P1 | ready_to_send | launch_blocker | Tracking | Confirm lead destination | Confirm where form leads, call alerts, quote requests, and appointment requests should go. | short_text | 2026-05-20T22:47:10.247Z | needed | forms / call tracking / CRM draft / launch QA | `frame:frame-roofing-utah:customer_requests:lead-destination` |
| P2 | ready_to_send | growth_backlog | Access | Share Google access status | Tell us whether you already have Google Business Profile, Search Console, GA4, Tag Manager, Google Ads, or call tracking access. Do not send passwords. | access | 2026-05-20T22:47:10.247Z | not required | GSC / GBP / GA4 / GTM / growth dashboard | `frame:frame-roofing-utah:customer_requests:google-access-map` |
| P2 | ready_to_send | growth_backlog | Access | Share domain, DNS, and hosting access process | Tell us who controls domain/DNS/hosting and the safest way to request access or make launch changes. Do not send passwords. | access | 2026-05-20T22:47:10.247Z | not required | DNS / hosting / launch checklist / redirects | `frame:frame-roofing-utah:customer_requests:domain-dns-hosting-access` |
| P2 | ready_to_send | growth_backlog | Growth | Share existing profile links | Share links to Yelp, BBB, Angi, Nextdoor, Facebook, chamber, supplier, manufacturer, insurance, or association profiles if you already have them. | link | 2026-05-20T22:47:10.247Z | not required | growth backlog / citation map / backlink matrix | `frame:frame-roofing-utah:customer_requests:existing-profile-links` |
| P2 | ready_to_send | quality | Reviews | Share approved review or testimonial sources | Share links to existing review profiles and tell us which testimonials, if any, you approve for public website use. | link | 2026-05-20T22:47:10.247Z | needed | review proof / testimonials / reputation plan | `frame:frame-roofing-utah:customer_requests:review-testimonial-approval` |

## Sheet Rows

| Priority | Status | Blocks | Section | Request | Owner answer | Public use approved | Sync key |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | ready_to_send | quality | NAP | Confirm public business details |  | No | `frame:frame-roofing-utah:customer_requests:confirm-nap` |
| P1 | ready_to_send | quality | Services | Confirm services |  | No | `frame:frame-roofing-utah:customer_requests:confirm-services` |
| P1 | ready_to_send | quality | Service Areas | Confirm service areas |  | No | `frame:frame-roofing-utah:customer_requests:confirm-service-areas` |
| P1 | ready_to_send | quality | Photos | Upload real job photos |  | No | `frame:frame-roofing-utah:customer_requests:upload-job-photos` |
| P1 | ready_to_send | quality | Brand | Owner story |  | No | `frame:frame-roofing-utah:customer_requests:owner-about-story` |
| P1 | ready_to_send | quality | Brand | Upload owner or team photo |  | No | `frame:frame-roofing-utah:customer_requests:owner-headshot-team-photo` |
| P0 | ready_to_send | launch_blocker | Claims | Approve or remove public claims |  | No | `frame:frame-roofing-utah:customer_requests:approve-public-claims` |
| P1 | ready_to_send | launch_blocker | Tracking | Confirm lead destination |  | No | `frame:frame-roofing-utah:customer_requests:lead-destination` |
| P2 | ready_to_send | growth_backlog | Access | Share Google access status |  | Not required | `frame:frame-roofing-utah:customer_requests:google-access-map` |
| P2 | ready_to_send | growth_backlog | Access | Share domain, DNS, and hosting access process |  | Not required | `frame:frame-roofing-utah:customer_requests:domain-dns-hosting-access` |
| P2 | ready_to_send | growth_backlog | Growth | Share existing profile links |  | Not required | `frame:frame-roofing-utah:customer_requests:existing-profile-links` |
| P2 | ready_to_send | quality | Reviews | Share approved review or testimonial sources |  | No | `frame:frame-roofing-utah:customer_requests:review-testimonial-approval` |

## Delivery Drafts

- portal: 12 open row(s), 2 blocker(s), external send blocked
- email: 12 open row(s), 2 blocker(s), external send blocked
- sms: 12 open row(s), 2 blocker(s), external send blocked
- google_sheet: 12 open row(s), 2 blocker(s), external send blocked

## Safety

Rows and delivery drafts only. No email, SMS, Google Sheet, portal, GBP, DNS, tracking, review, outreach, or public website action was performed.
