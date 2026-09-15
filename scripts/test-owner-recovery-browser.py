"""Rendered recovery regression check. API calls are intercepted; no email or live writes.
Run against source or an immutable preview with --base-url and --receipt-dir.
"""
import argparse, hashlib, json, os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--base-url',default='http://127.0.0.1:4174')
parser.add_argument('--receipt-dir',required=True)
args=parser.parse_args()
root=Path(args.receipt_dir);root.mkdir(parents=True,exist_ok=True)
receipt={'observed_at':datetime.now(timezone.utc).isoformat(),'base_url':args.base_url,'marker':'utah-owner-recovery-20260908a','mode':'rendered browser with intercepted API; no live email or reset','checks':[],'screenshots':[],'verdict':'fail'}
viewports=[(320,568),(360,800),(393,852),(430,932),(740,360)]

def check(ok,label):
    receipt['checks'].append({'check':label,'pass':bool(ok)})
    assert ok,label

try:
  with sync_playwright() as p:
    browser=p.chromium.launch()
    for route_path in ['/leads.html','/seo-report.html','/dashboard/index.html']:
     for width,height in viewports:
       context=browser.new_context(viewport={'width':width,'height':height},service_workers='block')
       calls=[];scenario={'request':202,'complete':200};errors=[];pending=[]
       def route_request(route):
         req=route.request;u=urlparse(req.url)
         if 'supabase.co' in (u.hostname or ''):
           action=parse_qs(u.query).get('action',[''])[0]
           body=json.loads(req.post_data or '{}');calls.append((action,body))
           if action=='request_password_reset': status=scenario['request'];data={'message':'generic accepted'}
           elif action in ('login','session','list'):
             pending.append(route);return
           elif action=='reset_password': status=scenario['complete'];data={'success':True,'name':'Example Owner'} if status==200 else {'error':'invalid_or_expired_link'}
           else: raise AssertionError('Unexpected live API action blocked: '+action)
           return route.fulfill(status=status,json=data,headers={'access-control-allow-origin':'*'})
         if req.method!='GET' or u.hostname not in (urlparse(args.base_url).hostname,'cdnjs.cloudflare.com'):
           return route.abort()
         if u.scheme+'://'+u.netloc == args.base_url.rstrip('/'):
           headers={**req.headers,'x-vercel-skip-toolbar':'1'}
           bypass=os.environ.get('SURFACE_GATE_PROTECTION_BYPASS_SECRET')
           if bypass: headers['x-vercel-protection-bypass']=bypass
           return route.continue_(headers=headers)
         return route.continue_()
       context.route('**/*',route_request)
       page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
       page.goto(args.base_url+route_path,wait_until='networkidle')
       check(receipt['marker'] in page.content(),f'{width}: freshness')
       page.locator('#forgotPasswordButton').click()
       check(page.locator('#requestResetSection').is_visible(),f'{width}: forgot button opens request')
       page.locator('#recoveryName').fill('Example Owner')
       page.locator('#recoveryEmail').fill('owner@example.test')
       page.locator('#requestResetButton').click()
       page.wait_for_function("() => document.getElementById('requestResetStatus').textContent.includes('If the name')")
       check(calls[-1]==('request_password_reset',{'name':'Example Owner','email':'owner@example.test'}),f'{width}: request sends identity only')
       check(page.locator('#requestResetSection').evaluate('(el)=>el.scrollWidth<=el.clientWidth'),f'{width}: request no horizontal overflow')
       page.locator('#recoveryName').fill('');page.locator('#recoveryEmail').fill('')
       shot=root/f'request-{route_path.replace("/","-")}-{width}.png';page.screenshot(path=str(shot));receipt['screenshots'].append({'file':shot.name,'sha256':hashlib.sha256(shot.read_bytes()).hexdigest()})
       token='a'*43
       page.goto(args.base_url+route_path+'#reset='+token,wait_until='networkidle')
       page.wait_for_function("() => !location.hash.startsWith('#reset=')")
       check('#reset=' not in page.url,f'{width}: secret stripped from URL')
       check(page.locator('#completeResetSection').is_visible(),f'{width}: reset link opens password form')
       check(page.evaluate("token => sessionStorage.getItem('frame.dashboard.session') === null && [sessionStorage, localStorage].every(store => Object.keys(store).every(key => !store.getItem(key).includes(token)))",token),f'{width}: reset clears login session and token stays out of browser storage')
       page.locator('#newPassword').fill('a new test password ');page.locator('#confirmPassword').fill('does not match')
       before=len(calls);page.locator('#completeResetButton').click()
       check(len(calls)==before and 'don’t match' in page.locator('#completeResetStatus').inner_text(),f'{width}: mismatch prevents submit')
       page.locator('#confirmPassword').fill('a new test password ');page.locator('#completeResetButton').click()
       page.locator('#signInSection').wait_for(state='visible')
       check(calls[-1]==('reset_password',{'token':token,'password':'a new test password '}),f'{width}: exact password submitted')
       check('Password updated' in page.locator('#loginErr').inner_text(),f'{width}: completion returns to sign in')
       check(not page.locator('#reportWrap').is_visible(),f'{width}: no auto login')
       check(not page.evaluate('window.FrameOwnerRecovery.active()'),f'{width}: completion leaves recovery mode')
       check(page.locator('#pinInput').get_attribute('inputmode')!='numeric',f'{width}: alphabetic password keyboard allowed')
       scenario['complete']=400
       page.goto(args.base_url+route_path+'#reset='+token,wait_until='networkidle')
       page.locator('#newPassword').fill('a new test password');page.locator('#confirmPassword').fill('a new test password');page.locator('#completeResetButton').click()
       page.wait_for_function("() => document.getElementById('completeResetForm').hidden")
       check('invalid or expired' in page.locator('#completeResetStatus').inner_text(),f'{width}: expired link recovery')
       page.goto(args.base_url+route_path+'#reset=malformed',wait_until='networkidle')
       check(page.locator('#completeResetForm').is_hidden(),f'{width}: malformed token cannot submit')
       if width == 393:
         for race in ('login','session'):
           if race == 'session':
             page.evaluate("sessionStorage.setItem('frame.dashboard.session','synthetic-session')")
           page.goto(args.base_url+route_path,wait_until='domcontentloaded')
           if race == 'login':
             page.locator('#pinInput').fill(' synthetic password ')
             page.locator('#loginForm button[type=submit]').click()
           page.wait_for_timeout(100)
           check(len(pending)==1,f'{route_path}: {race} response delayed')
           if race == 'login':
             check(calls[-1][1]['pin']==' synthetic password ',f'{route_path}: login preserves spaces')
           page.evaluate("location.hash='reset='+ 'a'.repeat(43)")
           page.locator('#completeResetSection').wait_for(state='visible')
           pending.pop().fulfill(status=200,json={'token':'synthetic-session','user':{'name':'Example Owner','role':'admin'},'leads':[]},headers={'access-control-allow-origin':'*'})
           page.wait_for_timeout(150)
           check(page.locator('#completeResetSection').is_visible() and not page.locator('#reportWrap').is_visible() and page.evaluate("sessionStorage.getItem('frame.dashboard.session')===null"),f'{route_path}: late {race} response cannot reopen account')
         if route_path == '/leads.html':
           page.locator('#newPassword').focus();page.keyboard.press('Shift+Tab')
           check(page.evaluate("document.activeElement.closest('#completeResetSection') !== null"),f'{route_path}: focus stays in visible reset controls')
       check(not errors,f'{width}: no page errors')
       context.close()
    browser.close()
  receipt['verdict']='pass'
finally:
  (root/'owner-recovery-browser.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'verdict':receipt['verdict'],'checks':len(receipt['checks']),'viewports':len(viewports),'routes':3,'receipt':str(root/'owner-recovery-browser.receipt.json')}))
