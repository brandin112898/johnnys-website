(() => {
  const $ = id => document.getElementById(id);
  let data, pending=false;
  const money = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
  function el(tag,text,className) { const node=document.createElement(tag); if(text) node.textContent=text; if(className) node.className=className; return node; }
  function render() {
    $('items').replaceChildren(); $('categories').replaceChildren();
    const query=$('search').value.trim().toLowerCase();
    let count=0;
    for(const menu of data.menus) for(const category of menu.categories) {
      const items=category.items.filter(i=>(i.name+' '+i.description).toLowerCase().includes(query));
      if(!items.length) continue;
      const section=el('section',null,'group'); section.id='category-'+encodeURIComponent(menu.id+'-'+category.id);
      const link=el('a',category.name); link.href='#'+section.id; $('categories').append(link);
      section.append(el('h2',category.name));
      if(category.description) section.append(el('p',category.description));
      const grid=el('div',null,'grid');
      for(const item of items) {
        const card=el('article',null,'item'); card.append(el('h3',item.name));
        if(item.description) card.append(el('p',item.description));
        card.append(el('span',item.price===null?'Price at checkout':money.format(item.price/100),'price'));
        card.append(el('small',item.available?'Options, ordering times, and final total at checkout.':'Currently unavailable in SpotOn.'));
        grid.append(card); count++;
      }
      section.append(grid); $('items').append(section);
    }
    if(!count) $('items').append(el('p',query?'No matches. Try another search.':'Check online ordering for the current menu.','empty'));
  }
  async function refresh() {
    if(pending || document.hidden) return;
    pending=true;
    try {
      const response=await fetch('/api/menu',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error('Menu unavailable');
      const next=await response.json();
      if(!Array.isArray(next.menus)||!next.menus.length) throw new Error('Empty menu');
      data=next; render(); $('catalog').hidden=false; $('fallback').hidden=true;
      $('status').textContent='Updated from SpotOn at '+new Date(data.fetchedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+'. Refreshes while this page is open.';
    } catch {
      // Remove yesterday's/previously fetched prices on every refresh failure.
      data=null; $('items').replaceChildren(); $('categories').replaceChildren(); $('catalog').hidden=true; $('fallback').hidden=false;
      $('status').textContent='View the current menu through Johnny’s online ordering.';
    } finally { pending=false; }
  }
  $('search').addEventListener('input',()=>data&&render()); $('retry').addEventListener('click',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) refresh();});
  refresh(); setInterval(refresh,30000);
})();
