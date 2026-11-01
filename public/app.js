import {openPlayback} from './player.js';
import {categories as manualCategories} from './catalog.js';
import {initI18n,t,number,date,getLanguage,categoryText,translateStatic,errorMessage} from './i18n.js';
import {matchesCategory} from './search-terms.js';
initI18n();
const $=selector=>document.querySelector(selector);
const SAVED='dojo-atlas.saved.v1',LEGACY='dojo-atlas.catalog.v1';
let saved=new Set(),videos=[],category='',provider='',onlySaved=false,page=1,pages=0,total=0,current=null,editingId=null,stopPlayback=()=>{},queryController=null,queryNumber=0,facetSignature='',status=null,displayQueryKey='',foregroundPending=false,view='videos',pageSnapshot=null;
try{const stored=JSON.parse(localStorage.getItem(SAVED)||'[]');if(Array.isArray(stored))saved=new Set(stored.slice(0,1000).map(String))}catch{}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node}
function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').hidden=true,5000)}
async function api(path,body,options={}){const response=await fetch(path,{...options,...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});let data;try{data=await response.json()}catch{throw new Error(t('O servidor local não respondeu. Inicie o projeto com npm start.'))}if(!response.ok)throw new Error(errorMessage(data.error));return data}
function persistSaved(){try{localStorage.setItem(SAVED,JSON.stringify([...saved]));$('#saved-count').textContent=number(saved.size)}catch{notify(t('Não foi possível salvar seus favoritos neste navegador.'))}}
function toggleFavorite(video){if(!saved.has(video.id)&&saved.size>=1000){notify(t('Limite de 1.000 favoritos neste navegador.'));return}saved.has(video.id)?saved.delete(video.id):saved.add(video.id);persistSaved();if(onlySaved)loadVideos();else renderVideos()}
function renderVideos(){
 const grid=$('#grid'),existing=new Map([...grid.children].map(card=>[card.dataset.videoId,card]));
 const visible=new Set(videos.map(video=>video.id));
 for(const card of [...grid.children])if(!visible.has(card.dataset.videoId))card.remove();
 for(const [index,video] of videos.entries()){
  let card=existing.get(video.id);
  if(!card){
   card=el('article','video-card');card.dataset.videoId=video.id;
   const cover=el('button','card-cover');cover.type='button';cover.append(el('span','play','▷'));cover.onclick=()=>watch(card.videoRecord);
   const top=el('div','card-top'),heart=el('button');heart.type='button';heart.onclick=()=>toggleFavorite(card.videoRecord);const title=el('h3');title.dataset.original='';top.append(title,heart);
   card.append(cover,top,el('p'));
  }
  card.videoRecord=video;
  const cover=card.querySelector('.card-cover');cover.setAttribute('aria-label',t('Assistir: {title}',{title:video.title}));
  const image=cover.querySelector('img');
  const thumbnail=video.thumbnailUrl||video.thumbnail;
  if(thumbnail&&card.failedThumbnail!==thumbnail){if(!image){const next=el('img','card-image');next.src=thumbnail;next.alt='';next.loading='lazy';next.referrerPolicy='no-referrer';next.onerror=()=>{card.failedThumbnail=next.getAttribute('src');next.remove()};cover.prepend(next)}else if(image.getAttribute('src')!==thumbnail)image.src=thumbnail}else image?.remove();
  let duration=cover.querySelector('.card-duration');if(video.duration){if(!duration){duration=el('span','card-duration');cover.append(duration)}duration.textContent=video.duration}else duration?.remove();
  const heart=card.querySelector('.card-top button');heart.textContent=saved.has(video.id)?'♥':'♡';heart.setAttribute('aria-label',t(saved.has(video.id)?'Remover dos favoritos: {title}':'Adicionar aos favoritos: {title}',{title:video.title}));heart.setAttribute('aria-pressed',String(saved.has(video.id)));
  card.querySelector('h3').textContent=video.title;card.querySelector('p').textContent=`${video.author} · ${t(video.provider)}`;
  if(grid.children[index]!==card)grid.insertBefore(card,grid.children[index]||null);
 }
 $('#saved-count').textContent=number(saved.size);
 $('#result-count').textContent=t(total===1?'{count} vídeo encontrado':'{count} vídeos encontrados',{count:number(total)})+(onlySaved?t(' nos favoritos'):'');
 $('#catalogo .section-title h1').replaceChildren(document.createTextNode(onlySaved?t('Favoritos'):category?categoryText(status?.categories.find(c=>c.key===category)?.name||t('Categoria')):t('Todos os vídeos')),el('span','','.'));
 $('#empty').hidden=videos.length>0;$('#empty h2').textContent=t(total?'Esta página não tem resultados.':status?.totals.videos?'Nenhum vídeo com esses filtros.':'Nenhum vídeo disponível.');
 $('#empty p').textContent=t(status?.totals.videos?'Altere a busca ou escolha outra categoria.':'Explore as categorias ou volte mais tarde.');
 $('#empty-add').textContent=t('Adicionar link manualmente');$('#page-info').textContent=pages?t('Página {page} de {pages}',{page:number(page),pages:number(pages)}):t('Sem resultados');$('#previous-page').disabled=page<=1;$('#next-page').disabled=page>=pages;$('#pagination').hidden=pages<2;
 $('#all-tab').setAttribute('aria-pressed',String(!onlySaved));$('#saved-tab').setAttribute('aria-pressed',String(onlySaved));$('#sidebar-all').classList.toggle('active',!category&&!onlySaved);$('#sidebar-saved').classList.toggle('active',onlySaved);
 document.querySelectorAll('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===category&&!onlySaved)));
 document.querySelectorAll('[data-provider]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.provider===provider)));
}
async function loadVideos({background=false,preservePage=false}={}){
 const request={q:$('#search').value,category,provider,sort:$('#sort').value,page,pageSize:40,ids:onlySaved?[...saved]:null,snapshot:background||preservePage?pageSnapshot:null};
 const queryKey=JSON.stringify(request);
 if(background&&(foregroundPending||queryKey!==displayQueryKey))return;
 if(!background)foregroundPending=true;
 const number=++queryNumber;queryController?.abort();queryController=new AbortController();
 if(!background)$('#grid').setAttribute('aria-busy','true');
 try{const data=await api('/api/catalog/query',{...request,countOnly:background},{signal:queryController.signal});if(number!==queryNumber)return;pageSnapshot=data.snapshot;request.snapshot=pageSnapshot;displayQueryKey=JSON.stringify(request);if(data.videos)videos=data.videos;total=data.total;pages=data.pages;if(page>Math.max(1,pages)&&!background){page=Math.max(1,pages);return loadVideos()}renderVideos()}catch(error){if(error.name!=='AbortError'){notify(t(error.message));$('#empty').hidden=false;$('#empty h2').textContent=t('Não foi possível consultar o catálogo.');$('#empty p').textContent=error.message}}finally{if(number===queryNumber){foregroundPending=false;$('#grid').removeAttribute('aria-busy')}}
}
function showView(next){view=next;$('#catalogo').hidden=next!=='videos';$('#categorias').hidden=next!=='categories';for(const [id,active] of [['#nav-videos',next==='videos'],['#nav-categories',next==='categories']]){const link=$(id);link.classList.toggle('nav-active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')}if(next==='categories')renderDirectory()}
function showVideos(){showView('videos');if(window.location.hash==='#categorias')window.history.replaceState(null,'','#catalogo')}
function chooseCategory(key){clearTimeout(searchTimer);clearSelection();category=key;$('#search').value='';$('#category').value=key;showVideos();loadVideos()}
const normalizeSearch=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
function renderDirectory(){
 const compare=new Intl.Collator(getLanguage()).compare,query=normalizeSearch($('#directory-search').value),items=(status?.categories||[]).filter(item=>matchesCategory(item.name,query)).sort((a,b)=>compare(categoryText(a.name),categoryText(b.name)));
 $('#category-count').textContent=t(items.length===1?'{count} categoria':'{count} categorias',{count:number(items.length)});
 $('#category-grid').replaceChildren(...items.map(item=>{const button=el('button','category-tile');button.type='button';button.dataset.category=item.key;button.append(el('span','',categoryText(item.name)),el('small','',t(item.count===1?'{count} vídeo':'{count} vídeos',{count:number(item.count)})));button.onclick=()=>chooseCategory(item.key);return button}));$('#category-empty').hidden=items.length>0;
}
function renderFacets(){
 if(!status)return;const signature=JSON.stringify([getLanguage(),status.categories,status.sources.map(s=>[s.id,s.name,s.count])]);if(signature===facetSignature)return;facetSignature=signature;
 const select=$('#category');select.replaceChildren(el('option','',t('Todas as categorias')));select.firstChild.value='';
 for(const item of status.categories){const option=el('option','',`${categoryText(item.name)} (${number(item.count)})`);option.value=item.key;select.append(option)}select.value=category;
 const sidebar=$('#sidebar-categories');sidebar.replaceChildren();
 const categorySearch=$('#category-search').value.toLocaleLowerCase('pt-BR');
 for(const item of status.categories.filter(c=>matchesCategory(c.name,categorySearch))){const button=el('button','side-link');button.dataset.category=item.key;button.append(el('span','',categoryText(item.name)),el('small','',number(item.count)));button.onclick=()=>chooseCategory(item.key);sidebar.append(button)}
 $('#chips').replaceChildren(...[{key:'',name:t('Todos')},...status.categories.filter(c=>c.count>0).slice(0,9)].map(item=>{const button=el('button','chip',categoryText(item.name));button.dataset.category=item.key;button.onclick=()=>chooseCategory(item.key);button.setAttribute('aria-pressed',String(item.key===category));return button}));
 $('#provider').replaceChildren(el('option','',t('Todas as fontes')));$('#provider').firstChild.value='';$('#sidebar-providers').replaceChildren();
 for(const source of status.sources){const option=el('option','',t(source.name));option.value=source.id;$('#provider').append(option);const button=el('button','side-link');button.dataset.provider=source.id;button.append(el('span','',t(source.name)),el('small','',number(source.count)));button.onclick=()=>{provider=provider===source.id?'':source.id;$('#provider').value=provider;page=1;showVideos();loadVideos()};$('#sidebar-providers').append(button)}$('#provider').value=provider;
 renderDirectory();
 const known=[...new Set([...manualCategories,...status.categories.map(c=>c.name)])];$('#form-category').replaceChildren(...known.map(name=>{const option=el('option','',categoryText(name));option.value=name;return option}));
}
async function refresh({videos:refreshVideos=true,background=false}={}){try{status=await api('/api/catalog/facets');renderFacets();if(refreshVideos&&view==='videos')await loadVideos({background})}catch(error){notify(t(error.message))}}
function add(){editingId=null;$('#video-form').reset();$('#form-error').textContent='';$('#editor').showModal()}
function watch(video){
 current=video;$('#watch-title').textContent=video.title;$('#watch-author').textContent=`${video.author} · ${t(video.provider)}`;$('#watch-description').textContent=video.description||video.categories?.map(c=>categoryText(c.name)).join(' · ')||'';
 $('#review-note').textContent=video.origin==='collected'?t('Os vídeos permanecem nas plataformas de origem.'):t('Revisão: {date}. {note}',{date:date(video.checkedAt),note:video.permissionNote||''});
 $('#original').href=video.sourceUrl;$('#remove').hidden=video.origin!=='manual';$('#configure-playback').hidden=video.origin!=='manual';stopPlayback();$('#watch').showModal();stopPlayback=openPlayback(video,$('#player'),$('#embed-status'));
}
function clearSelection(){category='';provider='';onlySaved=false;page=1;pageSnapshot=null;$('#category').value='';$('#provider').value='';$('#sort').value='discovery'}
function resetFilters(){clearTimeout(searchTimer);clearSelection();$('#search').value='';showVideos();loadVideos()}
for(const id of ['#add','#empty-add'])$(id).onclick=add;
for(const id of ['#nav-saved','#saved-tab','#sidebar-saved'])$(id).onclick=()=>{onlySaved=true;page=1;showVideos();loadVideos()};
$('#all-tab').onclick=()=>{onlySaved=false;page=1;showVideos();loadVideos()};$('#sidebar-all').onclick=resetFilters;$('#reset-filters').onclick=resetFilters;
$('#category').onchange=event=>chooseCategory(event.target.value);$('#provider').onchange=event=>{provider=event.target.value;page=1;loadVideos()};$('#sort').onchange=()=>{page=1;loadVideos()};
let searchTimer;$('#search').oninput=()=>{clearTimeout(searchTimer);clearSelection();searchTimer=setTimeout(()=>{showVideos();loadVideos()},250)};
$('#directory-search').oninput=renderDirectory;
$('#nav-videos').onclick=resetFilters;$('#directory-videos').onclick=resetFilters;
window.addEventListener('hashchange',()=>{showView(window.location.hash==='#categorias'?'categories':'videos')});
showView(window.location.hash==='#categorias'?'categories':'videos');
$('#category-search').oninput=()=>{facetSignature='';renderFacets()};
$('#previous-page').onclick=()=>{page--;loadVideos({preservePage:true});$('#catalogo').scrollIntoView()};$('#next-page').onclick=()=>{page++;loadVideos({preservePage:true});$('#catalogo').scrollIntoView()};
$('#density').onclick=()=>{const on=$('#grid').classList.toggle('compact');$('#density').setAttribute('aria-pressed',String(on))};
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>button.closest('dialog').close();$('#watch').addEventListener('close',()=>{stopPlayback();current=null});
$('#video-form').onsubmit=async event=>{event.preventDefault();try{const record=Object.fromEntries(new FormData(event.target));record.permissionConfirmed=record.permissionConfirmed==='on';record.checkedAt=new Date().toISOString();await api('/api/catalog/manual',{record,editingId});$('#editor').close();editingId=null;await refresh();notify(t('Registro salvo no banco local.'))}catch(error){$('#form-error').textContent=error.message}};
$('#configure-playback').onclick=()=>{if(!current)return;const video=current;$('#watch').close();editingId=video.id;const form=$('#video-form');form.reset();for(const key of ['sourceUrl','playbackUrl','title','author','category','level','description','permissionNote'])form.elements.namedItem(key).value=video[key]||'';form.elements.namedItem('permissionConfirmed').checked=video.permissionConfirmed===true;$('#form-error').textContent='';$('#editor').showModal()};
$('#remove').onclick=async()=>{if(!current||!confirm(t('Remover este cadastro manual do banco local?')))return;try{await api('/api/catalog/manual?id='+encodeURIComponent(current.id),undefined,{method:'DELETE'});saved.delete(current.id);persistSaved();$('#watch').close();await refresh()}catch(error){notify(t(error.message))}};
$('#export').onclick=()=>{const a=el('a');a.href='/api/catalog/export';a.download='dojo-atlas-catalogo.json';a.click()};
$('#import').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>2*1024*1024)throw new Error(t('Importe um JSON com até 2 MB.'));const data=JSON.parse(await file.text());const result=await api('/api/catalog/import',data);notify(t('{count} registros adicionados ao banco.',{count:number(result.added)}));await refresh()}catch(error){notify(t(error.message))}finally{event.target.value=''}};
window.addEventListener('site-language-change',()=>{facetSignature='';renderFacets();renderVideos();translateStatic()});
async function migrate(){try{const raw=localStorage.getItem(LEGACY);if(!raw)return;const records=JSON.parse(raw);if(!Array.isArray(records)||!records.length)return;await api('/api/catalog/import',records);localStorage.removeItem(LEGACY);notify(t('Seus cadastros antigos foram transferidos para o banco local.'))}catch{notify(t('Os cadastros antigos foram preservados no navegador. Use a exportação anterior para migrá-los.'))}}
await migrate();await refresh();
let polling=false;setInterval(async()=>{if(document.hidden||polling||document.querySelector('#editor[open]'))return;polling=true;try{await refresh({videos:true,background:true})}finally{polling=false}},4000);
