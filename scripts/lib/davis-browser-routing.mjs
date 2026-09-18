export function createReadOnlyRouteHandler(base, secret) {
 const origin=new URL(base).origin;
 return async route=>{
  const request=route.request();
  const url=new URL(request.url());
  if(!['GET','HEAD'].includes(request.method())||/posthog|google-analytics/.test(url.hostname))return route.abort();
  const headers={...request.headers()};
  for(const key of Object.keys(headers))if(['x-vercel-protection-bypass','x-vercel-skip-toolbar'].includes(key.toLowerCase()))delete headers[key];
  if(url.origin===origin&&secret){
   headers['x-vercel-protection-bypass']=secret;
   headers['x-vercel-skip-toolbar']='1';
   // Never forward a bypass credential through an HTTP redirect. Fulfill the
   // redirect itself so the browser's next request is checked independently.
   const response=await route.fetch({headers,maxRedirects:0});
   return route.fulfill({response});
  }
  return route.continue({headers});
 };
}
