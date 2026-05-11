# Landon — Frame Roofing Utah Ad Launch Checklist

**What this is:** Everything Landon needs to complete so Frame Roofing Utah can launch ads. This should take about 1 to 2 hours total, spread over a few days. The longest wait is Google's Local Service Ads verification, which can take several business days.

**What this is not:** This is not code, tracking setup, campaign management, or optimization. Ryan handles those items after the account access and verification steps below are complete.

**Success means:** Landon completes the ownership, verification, payment, access, and DNS steps so Ryan can launch and track ads without needing Landon for technical setup.

---

## Critical Path

Start Local Service Ads today. This is the only step that can realistically delay launch because Google's verification process can take several business days. Submitting it today is the difference between potentially launching this week versus pushing into next week.

---

## Stop and Send Ryan a Screenshot If

Stop and send Ryan a screenshot if:

1. Google tries to force you into creating a campaign
2. Google asks for a verification fee or payment you were not expecting
3. Google says the business is not eligible
4. LSA asks for a document you do not recognize
5. Meta says the business, page, or ad account is restricted
6. You are not sure where DNS is managed

When in doubt, screenshot and ask. One pause beats the wrong click.

---

## Tasks in Priority Order

### 1. Google Ads account (~15 min)

- [ ] Log into [ads.google.com](https://ads.google.com) with your company Gmail
- [ ] If no Google Ads account exists yet: click **Start now** → at the bottom, **Switch to Expert Mode**
- [ ] Skip "Create a campaign" → click **Create an account without a campaign**
- [ ] Set Billing country: **United States**, Time zone: **Mountain Time**, Currency: **USD**
- [ ] Add a payment method (business credit card preferred)
- [ ] **Tools → Access and security → Users** → invite `ryanconwell99@gmail.com` as **Admin**
- [ ] At the top-right of the screen, copy the **10-digit Customer ID** (format `XXX-XXX-XXXX`) → send to Ryan

**You are done when:** Ryan has Admin access and the 10-digit Google Ads Customer ID.

### 2. Google Business Profile check (~5 min)

- [ ] Go to [business.google.com/locations](https://business.google.com/locations)
- [ ] Confirm "Frame Restoration Utah LLC" shows **green ✓ Verified**
- [ ] **Do not change the business name, address, hours, categories, or service areas right now.** Rapid edits can increase profile review risk during launch. For now, only confirm that the profile is verified.

**You are done when:** Ryan has confirmation that the profile is verified and no profile settings were changed.

### Have Ready Before Starting Local Service Ads

Before starting LSA, have these items available so you don't get halfway through and stop:

1. Company Gmail login
2. Legal business name
3. Business phone number
4. Business address
5. Website URL
6. Utah DOPL license number
7. General liability insurance certificate
8. Workers compensation certificate or exemption documentation
9. Service area list
10. List of services Frame actually provides

### 3. Local Service Ads (LSA) — **START TODAY** (~30 min + waiting)

This is the long pole. Submit it today, then wait for Google.

- [ ] Go to [ads.google.com/local-services-ads](https://ads.google.com/local-services-ads) → **Get started**
- [ ] Service area: all the Wasatch Front cities you currently serve (mirror what's on the website)
- [ ] Services: select EVERY service you actually do (Roof installation, repair, inspection, storm damage, gutters, emergency tarping, insurance claim help)
- [ ] Fill in business details using the info from the website footer + GBP
- [ ] **Complete whatever Google asks for in their verification flow.** This may include:
  - Business registration
  - Utah DOPL license verification
  - Insurance verification (general liability + workers' comp)
  - Identity verification
  - Background check
  - Document uploads
- [ ] **Follow Google's exact instructions inside the LSA dashboard** — don't go looking for "the right way" elsewhere; whatever the dashboard tells you is the right way for your account
- [ ] Set budget: **$2,500/month** to start (we'll raise it after verification)
- [ ] Lead types: check ALL (Phone, Messages, Booking)

**Once submitted, you're done with this step until Google approves you.** That can take a few days. Don't sit around waiting — proceed to the next steps.

**You are done when:** Ryan has a screenshot showing LSA verification is pending.

### Optional: Meta Business Manager (~20 min)

Complete Step 4 only if we are launching Facebook and Instagram ads in Phase 0. If not, skip and come back later when we decide to add Meta to the mix.

- [ ] Log into [business.facebook.com](https://business.facebook.com) with your personal Facebook account
- [ ] **Business Settings → Business Info** → confirm or create `Frame Roofing Utah`
- [ ] **Business Settings → People** → add `ryanconwell99@gmail.com` as **Admin**
- [ ] **Business Settings → Pages** → confirm Frame's existing Facebook page is connected
- [ ] **Business Settings → Ad Accounts** → Create new ad account named `Frame Roofing Utah - Main` (Mountain time, USD, payment method)
- [ ] **Events Manager → Connect Data Sources → Web → Meta Pixel** → name it `Frame Roofing Utah` → copy the **Pixel ID** (15-digit number) → send to Ryan

**You are done when:** Ryan has Admin access and the Meta Pixel ID.

### 5. Google Tag Manager invite (~1 min)

Ryan will either create the container under the business account or walk you through accepting admin access so the business owns it long term.

- [ ] When Ryan asks, log into [tagmanager.google.com](https://tagmanager.google.com) with your company Gmail
- [ ] Follow Ryan's prompts to accept the invite or confirm the container is owned by the business account. Takes about 30 seconds.

**You are done when:** Ryan confirms the container access is complete.

### 6. DNS for Resend (email infrastructure, ~10 min)

This unblocks an email feature on the website. Ryan will tell you exactly what to add.

- [ ] Ryan will send you 2-3 DNS records (provided by Resend, specific to our domain)
- [ ] Add them wherever DNS is managed for `frameroofingutah.com`. This may be the registrar or Vercel, depending on how the domain is configured. If you're not sure which one, send Ryan a screenshot of where you currently manage the domain.
- [ ] Send Ryan a thumbs-up when added so he can click "Verify" in Resend
- [ ] **Don't try to guess the records.** Ryan will paste them in exact form. SPF/DKIM are easy to get wrong, and Resend gives us per-domain values.

**You are done when:** Ryan confirms the Resend domain is verified.

---

## What to Send Ryan

| When you finish... | Send Ryan... |
|---|---|
| Step 1 (Google Ads) | 10-digit Customer ID (format `XXX-XXX-XXXX`) |
| Step 2 (GBP) | Just a "✓ verified" confirmation |
| Step 3 (LSA submitted) | Screenshot of the LSA dashboard "verification pending" status |
| Step 3 (LSA approved, days later) | Screenshot of "Live" status |
| Step 4 (Meta) | Meta Pixel ID (15-digit number) |
| Step 5 (GTM invite accepted) | Just a "done" |
| Step 6 (DNS added) | Just a "added" so Ryan can verify |

You can drop these in our shared text thread or email — whatever's easiest.

---

## What If Google Asks for Something Unexpected

- **Background check:** if Google requests one, follow their exact instructions. Don't try to guess which vendor or process. They'll tell you.
- **Document upload format:** PDF is safest. Photos of paper documents work for most things; clear lighting + flat surface.
- **Identity verification:** typically a driver's license + selfie via Google's mobile app. Standard.
- **Insurance verification:** Google may accept the current certificate of insurance or request a fresh one. If they request anything specific, send Ryan a screenshot before uploading or requesting changes from the insurance agent.
- **Anything else:** screenshot it and send to Ryan. He can usually look it up.

---

## Things Not to Do

- **DON'T edit your Google Business Profile** during ad launch. Name, address, hours, categories — leave them alone. Rapid edits can increase profile review or suspension risk during launch.
- **DON'T accept the "Smart Campaign" path** when Google Ads tries to push it. We use "Expert Mode" — Ryan needs the granular control for the campaign structure.
- **DON'T add Ryan as an "Email-only access user" to Google Ads.** It must be **Admin**. Anything less and he can't build campaigns.
- **DON'T pay any agency that "offers to do this for you" mid-launch.** This list is everything they would charge $2-5K to do. We've got it.

---

## What This Costs

- **Setup: $0.** All the accounts above are free.
- **Ad spend: per your existing $15K/month budget.** Already approved. Doesn't change.
- **One-time payment method add:** the credit card you put on Google Ads + Meta will get charged daily as ads run — no monthly fee, just a billing source.

If Google or another platform asks for an unexpected verification or background check fee, send Ryan a screenshot before paying. These costs are usually minor, but we should confirm before moving forward.

---

## Realistic Timeline

| Day | What's happening |
|---|---|
| **Day 0 (today)** | You: Step 1 + 3. Ryan: code deploys. |
| **Day 1** | You: Step 2, 5, 6 (and Step 4 if you're doing Meta). Ryan: builds paused campaigns. |
| **Day 2-5** | You: waiting on LSA verification. Ryan: builds conversion tracking. |
| **Day 5-7** | LSA approves (usually). |
| **Day 7** | Ads go live. Ryan monitors lead flow, tracking, and early campaign performance. |
| **Day 14** | First review: what's working, what's not. Ryan adjusts. |
| **Day 30** | Closed-loop revenue tracking active. Ryan begins optimizing toward closed revenue instead of only raw lead volume. |

---

## Questions?

Text Ryan. Your role is to complete the account-holder steps above. Once those are done, Ryan handles the technical setup, tracking, campaign launch, and optimization.
