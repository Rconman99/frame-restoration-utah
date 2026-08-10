window.DASHBOARD_CONFIG = Object.freeze({
  clientName: "Frame Restoration Utah",
  tagline: "SEO & Lead Attribution Tracker",
  client: Object.freeze({
    name: "Frame Restoration Utah",
    domain: "www.framerestorationutah.com",
  }),
  supabaseUrl: "https://hdcflshhomzildwqlmwh.supabase.co",
  campaignKey: "frame-roofing-2026",
  defaultDays: 30,
  ranges: Object.freeze([7, 30, 60, 90]),
  footerLinks: Object.freeze([Object.freeze({
    label: "PostHog Dashboard",
    url: "https://us.posthog.com/project/333074",
  })]),
  builderAttribution: "Built by Ryan Conwell",
  dataSources: Object.freeze({
    stormWatch: Object.freeze({ enabled: true, area: "UT" }),
    reviews: Object.freeze({
      enabled: true,
      feedPath: "/reviews.json",
      competitorTarget: Object.freeze({
        name: "roofingutah.com",
        count: 54,
      }),
    }),
    sitemap: Object.freeze({ enabled: true, url: "/sitemap.xml" }),
    psi: Object.freeze({
      enabled: true,
      origin: "https://www.framerestorationutah.com",
      strategy: "mobile",
      apiKey: "AIzaSyBcqIurJqIrnaf9V1adhN-UuSgvjcQjwgU",
    }),
  }),
});
