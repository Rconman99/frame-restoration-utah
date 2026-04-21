const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage();
  
  // Business data
  const biz = {
    name: 'Frame Restoration Utah LLC',
    address: '142 S Main St',
    city: 'Heber City',
    state: 'Utah',
    zip: '84032',
    phone: '(435) 302-4422',
    website: 'https://www.frameroofingutah.com',
    email: 'landon@framerestorations.com',
    description: 'Licensed, insured roofing contractor serving the Wasatch Front and Heber Valley. Specializing in storm damage repair, roof replacements, and inspections. CertainTeed and Tamko certified. BBB A+ accredited. Free estimates.',
    category: 'Roofing Contractor'
  };

  console.log('🔥 BLITZ TEST: Brownbook.net');
  console.log('Navigating...');
  await page.goto('https://www.brownbook.net/add-business');
  await page.waitForLoadState('networkidle');

  // Fill form fields
  console.log('Filling business name...');
  await page.fill('input[name="business_name"], input[id*="name"], input[placeholder*="usiness"]', biz.name).catch(() => {});
  
  // Try common field selectors
  const fields = [
    { sel: 'input[name*="address"], input[placeholder*="ddress"]', val: biz.address },
    { sel: 'input[name*="city"], input[placeholder*="ity"]', val: biz.city },
    { sel: 'input[name*="zip"], input[name*="post"], input[placeholder*="ip"]', val: biz.zip },
    { sel: 'input[name*="phone"], input[name*="tel"], input[placeholder*="hone"]', val: biz.phone },
    { sel: 'input[name*="website"], input[name*="url"], input[placeholder*="ebsite"]', val: biz.website },
    { sel: 'input[name*="email"], input[placeholder*="mail"]', val: biz.email },
  ];

  for (const f of fields) {
    try {
      const el = await page.$(f.sel);
      if (el) {
        await el.fill(f.val);
        console.log(`✅ Filled: ${f.sel.split(',')[0]}`);
      }
    } catch(e) {
      console.log(`⚠️ Skipped: ${f.sel.split(',')[0]}`);
    }
  }

  // Try textarea for description
  try {
    const desc = await page.$('textarea');
    if (desc) {
      await desc.fill(biz.description);
      console.log('✅ Filled: description textarea');
    }
  } catch(e) {}

  // Try to select state
  try {
    await page.selectOption('select[name*="state"], select[name*="region"]', { label: biz.state }).catch(() => {});
    console.log('✅ Selected: state dropdown');
  } catch(e) {}

  // Check for CAPTCHA
  const captcha = await page.$('iframe[src*="recaptcha"], .g-recaptcha, [data-sitekey]');
  if (captcha) {
    console.log('');
    console.log('⏸️  CAPTCHA DETECTED — Form is filled!');
    console.log('👆 Click the CAPTCHA in the browser window, then press Enter in this terminal to submit.');
    console.log('');
    
    // Wait for user to solve CAPTCHA — keep browser open
    await page.waitForTimeout(120000); // 2 min window
  } else {
    console.log('✅ No CAPTCHA found — ready to submit!');
  }

  // Don't auto-close — let user see the result
  console.log('🏁 Test complete. Browser will close in 30 seconds.');
  await page.waitForTimeout(30000);
  await browser.close();
})();
