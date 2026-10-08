// SpotOn Central Menu API only. Never writes restaurant/menu settings or orders.
const API = 'https://api.spoton.com';
const ORDER_URL = 'https://order.spoton.com/BL-5D92-8C70-BB34';
export class MenuError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function createMenuService(fetcher = fetch) {
  let tokenCache;
  async function json(url, options) {
    const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw new MenuError(response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE');
    return response.json();
  }
  async function token(env) {
    if (tokenCache?.client === env.SPOTON_CLIENT_ID && tokenCache.expires > Date.now()) return tokenCache.value;
    const data = await json(`${API}/oauth2/v1/token`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${env.SPOTON_CLIENT_ID}:${env.SPOTON_CLIENT_SECRET}`), 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type:'client_credentials', scope:'menu:all:read' }).toString()
    });
    if (typeof data.access_token !== 'string' || !data.access_token) throw new MenuError('INVALID_RESPONSE');
    tokenCache = { client:env.SPOTON_CLIENT_ID, value:data.access_token, expires:Date.now()+Math.max(0, Math.min(Number(data.expires_in)||60,86400)-60)*1000 };
    return tokenCache.value;
  }
  async function pages(path, key, accessToken) {
    const rows = [];
    for (let page=1; page<=500; page++) {
      const data = await json(`${API}${path}?page=${page}&per_page=20`, { headers:{ Authorization:`Bearer ${accessToken}` } });
      if (!Array.isArray(data[key])) throw new MenuError('INVALID_RESPONSE');
      rows.push(...data[key]);
      const total = Number(data.pagination?.total_pages);
      if (!Number.isInteger(total) || total < 0 || total > 500) throw new MenuError('INVALID_RESPONSE');
      if (page >= total) return rows;
    }
    throw new MenuError('INVALID_RESPONSE');
  }
  return async env => {
    if (![env.SPOTON_CLIENT_ID, env.SPOTON_CLIENT_SECRET, env.SPOTON_LOCATION_ID, env.SPOTON_MENU_IDS].every(v=>typeof v==='string' && v.trim())) throw new MenuError('NOT_CONNECTED');
    // Explicit menu allowlist prevents accidentally publishing an internal POS menu.
    const allowed = new Set(env.SPOTON_MENU_IDS.split(',').map(s=>s.trim()).filter(Boolean));
    const accessToken = await token(env);
    try {
      const path = `/menu/v1/locations/${encodeURIComponent(env.SPOTON_LOCATION_ID)}/menus`;
      const menus = (await pages(path,'menus',accessToken)).filter(menu=>allowed.has(menu.id) && menu.active !== false);
      if (!menus.length) throw new MenuError('NO_MENU');
      const output = [];
      for (const menu of menus) {
        const items = await pages(`${path}/${encodeURIComponent(menu.id)}/items`,'items',accessToken);
        output.push(normalizeMenu(menu,items));
      }
      return { source:'SpotOn', fetchedAt:new Date().toISOString(), orderUrl:ORDER_URL, menus:output };
    } catch(error) { tokenCache = undefined; throw error; }
  };
}
const schedule = value => value && typeof value==='object' ? value : null;
export function normalizeMenu(menu, items) {
  const categories = (menu.categories || []).filter(c=>c.active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(category=>({
    id:category.id, name:category.name, description:category.description||'',
    items:items.filter(i=>i.active!==false).flatMap(item=>(item.category_references||[]).filter(ref=>ref.category_id===category.id).map(ref=>({
      id:item.id, name:item.name, description:item.description||'',
      // Only category-context price is current; deprecated item.price is deliberately ignored.
      price:ref.price?.pricing_kind==='PRICING_KIND_FIXED' && Number.isSafeInteger(Number(ref.price.amount)) && Number(ref.price.amount)>=0 ? Number(ref.price.amount) : null,
      available:item.is_available === true,
      imageUrl:typeof item.image_url==='string' && item.image_url.startsWith('https://') ? item.image_url : null,
      schedule:schedule(ref.schedule), scheduleOverrides:ref.schedule_overrides || [],
      sortOrder:ref.sort_order || 0
    }))).sort((a,b)=>a.sortOrder-b.sortOrder)
  }));
  return {id:menu.id,name:menu.name,schedule:schedule(menu.schedule),scheduleOverrides:menu.schedule_overrides||[],categories};
}
const readMenu = createMenuService();
export async function handleMenu(request, env, service = readMenu) {
  const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store, max-age=0', 'X-Content-Type-Options':'nosniff' };
  // Same-origin web requests and native app requests; no public wildcard CORS.
  if (request.method !== 'GET') return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers:{...headers,Allow:'GET'}});
  try { return new Response(JSON.stringify(await service(env)),{headers}); }
  catch(error) {
    const code = error instanceof MenuError ? error.code : 'UPSTREAM_UNAVAILABLE';
    return new Response(JSON.stringify({error:code,orderUrl:ORDER_URL,message:'Check the current menu and availability in Johnny’s online ordering.'}),{status:503,headers:{...headers,'Retry-After':'30'}});
  }
}
