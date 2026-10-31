import {openPlayback} from './player.js';
import {categories as manualCategories} from './catalog.js';
const $=selector=>document.querySelector(selector);
const SAVED='dojo-atlas.saved.v1',LEGACY='dojo-atlas.catalog.v1';
let saved=new Set(),videos=[],category='',provider='',onlySaved=false,page=1,pages=0,total=0,current=null,editingId=null,stopPlayback=()=>{},queryController=null,queryNumber=0,facetSignature='',status=null,displayQueryKey='',foregroundPending=false;
try{const stored=JSON.parse(localStorage.getItem(SAVED)||'[]');if(Array.isArray(stored))saved=new Set(stored.slice(0,1000).map(String))}catch{}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node}
function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').hidden=true,5000)}
async function api(path,body,options={}){const response=await fetch(path,{...options,...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});let data;try{data=await response.json()}catch{throw new Error('O servidor local não respondeu. Inicie o projeto com npm start.')}if(!response.ok)throw new Error(data.error||'A operação falhou.');return data}
function persistSaved(){try{localStorage.setItem(SAVED,JSON.stringify([...saved]));$('#saved-count').textContent=saved.size}catch{notify('Não foi possível salvar seus favoritos neste navegador.')}}
function toggleFavorite(video){if(!saved.has(video.id)&&saved.size>=1000){notify('Limite de 1.000 favoritos neste navegador.');return}saved.has(video.id)?saved.delete(video.id):saved.add(video.id);persistSaved();if(onlySaved)loadVideos();else renderVideos()}
function renderVideos(){
 const grid=$('#grid'),existing=new Map([...grid.children].map(card=>[card.dataset.videoId,card]));
 const visible=new Set(videos.map(video=>video.id));
 for(const card of [...grid.children])if(!visible.has(card.dataset.videoId))card.remove();
 for(const [index,video] of videos.entries()){
  let card=existing.get(video.id);
  if(!card){
   card=el('article','video-card');card.dataset.videoId=video.id;
   const cover=el('button','card-cover');cover.type='button';cover.append(el('span','play','▷'));cover.onclick=()=>watch(card.videoRecord);
   const top=el('div','card-top'),heart=el('button');heart.type='button';heart.onclick=()=>toggleFavorite(card.videoRecord);top.append(el('h3'),heart);
   card.append(cover,top,el('p'));
  }
  card.videoRecord=video;
  const cover=card.querySelector('.card-cover');cover.setAttribute('aria-label',`Assistir: ${video.title}`);
  const image=cover.querySelector('img');
  const thumbnail=video.thumbnailUrl||video.thumbnail;
  if(thumbnail&&card.failedThumbnail!==thumbnail){if(!image){const next=el('img','card-image');next.src=thumbnail;next.alt='';next.loading='lazy';next.referrerPolicy='no-referrer';next.onerror=()=>{card.failedThumbnail=next.getAttribute('src');next.remove()};cover.prepend(next)}else if(image.getAttribute('src')!==thumbnail)image.src=thumbnail}else image?.remove();
  let duration=cover.querySelector('.card-duration');if(video.duration){if(!duration){duration=el('span','card-duration');cover.append(duration)}duration.textContent=video.duration}else duration?.remove();
  const heart=card.querySelector('.card-top button');heart.textContent=saved.has(video.id)?'♥':'♡';heart.setAttribute('aria-label',`${saved.has(video.id)?'Remover dos':'Adicionar aos'} favoritos: ${video.title}`);heart.setAttribute('aria-pressed',String(saved.has(video.id)));
  card.querySelector('h3').textContent=video.title;card.querySelector('p').textContent=`${video.author} · ${video.provider}`;
  if(grid.children[index]!==card)grid.insertBefore(card,grid.children[index]||null);
 }
 $('#saved-count').textContent=saved.size;
 $('#result-count').textContent=`${total.toLocaleString('pt-BR')} ${total===1?'vídeo encontrado':'vídeos encontrados'}${onlySaved?' nos favoritos':''}`;
 $('.section-title h1').replaceChildren(document.createTextNode(onlySaved?'Favoritos':category?status?.categories.find(c=>c.key===category)?.name||'Categoria':'Todos os vídeos'),el('span','','.'));
 $('#empty').hidden=videos.length>0;$('#empty h2').textContent=total?'Esta página não tem resultados.':status?.totals.videos?'Nenhum vídeo com esses filtros.':'Seu catálogo está sendo preparado.';
 $('#empty p').textContent=status?.totals.videos?'Altere a busca ou escolha outra categoria.':'Acompanhe a coleta acima. Os resultados aparecem conforme as fontes são consultadas.';
 $('#empty-add').textContent='Adicionar link manualmente';$('#page-info').textContent=pages?`Página ${page} de ${pages}`:'Sem resultados';$('#previous-page').disabled=page<=1;$('#next-page').disabled=page>=pages;$('#pagination').hidden=pages<2;
 $('#all-tab').setAttribute('aria-pressed',String(!onlySaved));$('#saved-tab').setAttribute('aria-pressed',String(onlySaved));$('#sidebar-all').classList.toggle('active',!category&&!onlySaved);$('#sidebar-saved').classList.toggle('active',onlySaved);
 document.querySelectorAll('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===category&&!onlySaved)));
 document.querySelectorAll('[data-provider]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.provider===provider)));
}
async function loadVideos({background=false}={}){
 const request={q:$('#search').value,category,provider,sort:$('#sort').value,page,pageSize:40,ids:onlySaved?[...saved]:null};
 const queryKey=JSON.stringify(request);
 if(background&&(foregroundPending||queryKey!==displayQueryKey))return;
 if(!background)foregroundPending=true;
 const number=++queryNumber;queryController?.abort();queryController=new AbortController();
 if(!background)$('#grid').setAttribute('aria-busy','true');
 try{const data=await api('/api/catalog/query',{...request,countOnly:background&&videos.length>=40},{signal:queryController.signal});if(number!==queryNumber)return;displayQueryKey=queryKey;if(data.videos){if(background){const known=new Set(videos.map(v=>v.id));videos=[...videos,...data.videos.filter(v=>!known.has(v.id))].slice(0,40)}else videos=data.videos}total=data.total;pages=data.pages;if(page>Math.max(1,pages)&&!background){page=Math.max(1,pages);return loadVideos()}renderVideos()}catch(error){if(error.name!=='AbortError'){notify(error.message);$('#empty').hidden=false;$('#empty h2').textContent='Não foi possível consultar o catálogo.';$('#empty p').textContent=error.message}}finally{if(number===queryNumber){foregroundPending=false;$('#grid').removeAttribute('aria-busy')}}
}
function chooseCategory(key){category=key;onlySaved=false;page=1;$('#category').value=key;loadVideos()}
function renderFacets(){
 const signature=JSON.stringify([status.categories,status.sources.map(s=>[s.id,s.name,s.count])]);if(signature===facetSignature)return;facetSignature=signature;
 const select=$('#category');select.replaceChildren(el('option','','Todas as categorias'));select.firstChild.value='';
 for(const item of status.categories){const option=el('option','',`${item.name} (${item.count})`);option.value=item.key;select.append(option)}select.value=category;
 const sidebar=$('#sidebar-categories');sidebar.replaceChildren();
 const categorySearch=$('#category-search').value.toLocaleLowerCase('pt-BR');
 for(const item of status.categories.filter(c=>c.name.toLocaleLowerCase('pt-BR').includes(categorySearch))){const button=el('button','side-link');button.dataset.category=item.key;button.append(el('span','',item.name),el('small','',item.count));button.onclick=()=>chooseCategory(item.key);sidebar.append(button)}
 $('#chips').replaceChildren(...[{key:'',name:'Todas'},...status.categories.filter(c=>c.count>0).slice(0,9)].map(item=>{const button=el('button','chip',item.name);button.dataset.category=item.key;button.onclick=()=>chooseCategory(item.key);button.setAttribute('aria-pressed',String(item.key===category));return button}));
 $('#provider').replaceChildren(el('option','','Todas as fontes'));$('#provider').firstChild.value='';$('#sidebar-providers').replaceChildren();
 for(const source of status.sources){const option=el('option','',source.name);option.value=source.id;$('#provider').append(option);const button=el('button','side-link');button.dataset.provider=source.id;button.append(el('span','',source.name),el('small','',source.count));button.onclick=()=>{provider=provider===source.id?'':source.id;$('#provider').value=provider;page=1;loadVideos()};$('#sidebar-providers').append(button)}$('#provider').value=provider;
 const known=[...new Set([...manualCategories,...status.categories.map(c=>c.name)])];$('#form-category').replaceChildren(...known.map(name=>{const option=el('option','',name);option.value=name;return option}));
}
const sourceStates={pending:'Aguardando',collecting:'Coletando',ready:'Atualizada',error:'Revisão necessária',blocked:'Acesso indisponível'};
function renderStatus(){
 $('#collection-summary').textContent=`${status.totals.videos.toLocaleString('pt-BR')} vídeos · ${status.totals.categories} categorias · ${status.totals.pending} páginas na fila`;
 const running=status.collector.running;$('#collect-now').disabled=running;$('#collect-now').textContent=running?'Coletando…':'Coletar agora';
 $('#collection-state').textContent=running?'Coleta em andamento. Você já pode explorar os resultados.':status.collector.nextRun?`Próxima coleta: ${new Date(status.collector.nextRun).toLocaleString('pt-BR')}`:'Coleta periódica pausada. Os dados permanecem no banco.';
 $('#toggle-collection').textContent=running||status.collector.nextRun?'Pausar coleta':'Ativar coleta periódica';
 $('#source-status').replaceChildren(...status.sources.filter(s=>s.id!=='manual').map(source=>{const row=el('div','source-status-row');const title=el('div');title.append(el('strong','',source.name),el('span','muted',`${source.count} vídeos · ${sourceStates[source.status]||source.status}`));row.append(title,el('p','muted',source.message||'Aguardando a primeira consulta.'));return row}));
}
async function refresh({videos:refreshVideos=true,background=false}={}){try{status=await api('/api/catalog/status');renderStatus();renderFacets();if(refreshVideos)await loadVideos({background})}catch(error){notify(error.message);$('#collection-state').textContent=error.message}}
function add(){editingId=null;$('#video-form').reset();$('#form-error').textContent='';$('#editor').showModal()}
function watch(video){
 current=video;$('#watch-title').textContent=video.title;$('#watch-author').textContent=`${video.author} · ${video.provider}`;$('#watch-description').textContent=video.description||video.categories?.map(c=>c.name).join(' · ')||'';
 $('#review-note').textContent=video.origin==='collected'?`Metadados consultados em ${new Date(video.checkedAt).toLocaleString('pt-BR')}. O vídeo permanece no site de origem.`:`Revisão: ${new Date(video.checkedAt).toLocaleDateString('pt-BR')}. ${video.permissionNote||''}`;
 $('#original').href=video.sourceUrl;$('#remove').hidden=video.origin!=='manual';$('#configure-playback').hidden=video.origin!=='manual';stopPlayback();$('#watch').showModal();stopPlayback=openPlayback(video,$('#player'),$('#embed-status'));
}
function resetFilters(){category='';provider='';onlySaved=false;page=1;$('#search').value='';$('#category').value='';$('#provider').value='';loadVideos()}
for(const id of ['#add','#empty-add'])$(id).onclick=add;
for(const id of ['#nav-saved','#saved-tab','#sidebar-saved'])$(id).onclick=()=>{onlySaved=true;page=1;loadVideos()};
$('#all-tab').onclick=()=>{onlySaved=false;page=1;loadVideos()};$('#sidebar-all').onclick=resetFilters;$('#reset-filters').onclick=resetFilters;
$('#category').onchange=event=>chooseCategory(event.target.value);$('#provider').onchange=event=>{provider=event.target.value;page=1;loadVideos()};$('#sort').onchange=()=>{page=1;loadVideos()};
let searchTimer;$('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;loadVideos()},250)};
$('#category-search').oninput=()=>{facetSignature='';renderFacets()};
$('#previous-page').onclick=()=>{page--;loadVideos();$('#catalogo').scrollIntoView()};$('#next-page').onclick=()=>{page++;loadVideos();$('#catalogo').scrollIntoView()};
$('#density').onclick=()=>{const on=$('#grid').classList.toggle('compact');$('#density').setAttribute('aria-pressed',String(on))};
$('#collect-now').onclick=async()=>{try{await api('/api/collector/run',{});await refresh()}catch(error){notify(error.message)}};
$('#toggle-collection').onclick=async()=>{try{await api(status?.collector.running||status?.collector.nextRun?'/api/collector/pause':'/api/collector/resume',{});await refresh()}catch(error){notify(error.message)}};
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>button.closest('dialog').close();$('#watch').addEventListener('close',()=>{stopPlayback();current=null});
$('#video-form').onsubmit=async event=>{event.preventDefault();try{const record=Object.fromEntries(new FormData(event.target));record.permissionConfirmed=record.permissionConfirmed==='on';record.checkedAt=new Date().toISOString();await api('/api/catalog/manual',{record,editingId});$('#editor').close();editingId=null;await refresh();notify('Registro salvo no banco local.')}catch(error){$('#form-error').textContent=error.message}};
$('#configure-playback').onclick=()=>{if(!current)return;const video=current;$('#watch').close();editingId=video.id;const form=$('#video-form');form.reset();for(const key of ['sourceUrl','playbackUrl','title','author','category','level','description','permissionNote'])form.elements.namedItem(key).value=video[key]||'';form.elements.namedItem('permissionConfirmed').checked=video.permissionConfirmed===true;$('#form-error').textContent='';$('#editor').showModal()};
$('#remove').onclick=async()=>{if(!current||!confirm('Remover este cadastro manual do banco local?'))return;try{await api('/api/catalog/manual?id='+encodeURIComponent(current.id),undefined,{method:'DELETE'});saved.delete(current.id);persistSaved();$('#watch').close();await refresh()}catch(error){notify(error.message)}};
$('#export').onclick=()=>{const a=el('a');a.href='/api/catalog/export';a.download='dojo-atlas-catalogo.json';a.click()};
$('#import').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>2*1024*1024)throw new Error('Importe um JSON com até 2 MB.');const data=JSON.parse(await file.text());const result=await api('/api/catalog/import',data);notify(`${result.added} registros adicionados ao banco.`);await refresh()}catch(error){notify(error.message)}finally{event.target.value=''}};
document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!document.querySelector('dialog[open]')){event.preventDefault();$('#search').focus()}});
async function migrate(){try{const raw=localStorage.getItem(LEGACY);if(!raw)return;const records=JSON.parse(raw);if(!Array.isArray(records)||!records.length)return;await api('/api/catalog/import',records);localStorage.removeItem(LEGACY);notify('Seus cadastros antigos foram transferidos para o banco local.')}catch{notify('Os cadastros antigos foram preservados no navegador. Use a exportação anterior para migrá-los.')}}
await migrate();await refresh();
let polling=false;setInterval(async()=>{if(document.hidden||polling||document.querySelector('#editor[open]'))return;polling=true;try{await refresh({videos:status?.collector.running||false,background:true})}finally{polling=false}},4000);
