import {load} from 'cheerio';
import {fetchPage} from './network.mjs';

const IMAGE_TYPES=/^image\/(jpeg|png|webp|avif|gif)(?:;|$)/i;
const IMAGE_HOSTS={xvideos:['xvideos-cdn.com','xnxx-cdn.com','xvideos.com'],xhamster:['xhcdn.com','ahcdn.com','xhamster.com'],pornhub:['phncdn.com','pornhub.com']};
export function thumbnailUrl(value,source,base=source.url){
 const url=new URL(value,base),hosts=IMAGE_HOSTS[source.adapter]||[];
 if(url.protocol!=='https:'||url.port||url.username||url.password||!hosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw new Error('Miniatura fora dos domínios da fonte.');
 if(/(?:^|\/)(?:[^/]*blank|placeholder|transparent|spacer)(?:[./_-]|$)/i.test(url.pathname))throw new Error('A origem retornou uma imagem de preenchimento.');
 return url.href;
}
export function extractThumbnails(html,pageUrl,source){
 const $=load(html),found=new Set();const add=value=>{try{if(typeof value==='string')found.add(thumbnailUrl(value,source,pageUrl))}catch{}};
 for(const selector of ['meta[property="og:image:secure_url"]','meta[property="og:image"]','meta[property="og:image:url"]','meta[name="twitter:image"]'])$(selector).each((_,node)=>add($(node).attr('content')));
 $('link[rel="image_src"]').each((_,node)=>add($(node).attr('href')));$('video[poster]').each((_,node)=>add($(node).attr('poster')));
 for(const script of $('script[type="application/ld+json"]').toArray()){
  try{const stack=[JSON.parse($(script).text())];let visited=0;while(stack.length&&visited++<2000){const item=stack.pop();if(!item||typeof item!=='object')continue;if([item['@type']].flat().some(type=>String(type).endsWith('VideoObject'))){for(const thumb of [item.thumbnailUrl].flat())add(typeof thumb==='string'?thumb:thumb?.url)}for(const value of Object.values(item))if(value&&typeof value==='object')stack.push(value)}}catch{}
 }
 const match=$('#initials-script').text().match(/^\s*(?:window\.)?initials\s*=\s*({[\s\S]*})\s*;?\s*$/);
 if(match){try{const data=JSON.parse(match[1]);for(const value of [data.videoModel?.thumbURL,data.videoModel?.thumbUrl,data.xplayerSettings?.videoInfo?.thumbUrl,data.videoModel?.icon])add(value)}catch{}}
 return [...found];
}
class Semaphore {
 constructor(limit){this.available=limit;this.waiting=[]}
 async run(fn){if(!this.available)await new Promise(resolve=>this.waiting.push(resolve));else this.available--;try{return await fn()}finally{const next=this.waiting.shift();if(next)next();else this.available++}}
}
export class LocalThumbnails {
 constructor(database,sources,{fetcher=fetch,now=()=>Date.now()}={}){this.database=database;this.sources=sources;this.fetcher=fetcher;this.now=now;this.inflight=new Map();this.lastRepair=new Map();this.slots=new Semaphore(4)}
 async image(value,source,referer){
  let url=thumbnailUrl(value,source);
  const timeout=AbortSignal.timeout(10000);
  for(let redirects=0;redirects<4;redirects++){
   const response=await this.fetcher(url,{redirect:'manual',signal:timeout,headers:{Referer:referer,Origin:new URL(source.url).origin,Accept:'image/avif,image/webp,image/jpeg,image/png,image/gif;q=0.9','Accept-Encoding':'identity'}});
   if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new Error('Redirecionamento de miniatura inválido.');url=thumbnailUrl(location,source,url);continue}
   const type=response.headers.get('content-type')||'';
   if(!response.ok||!IMAGE_TYPES.test(type)){await response.body?.cancel();throw new Error('A origem não forneceu a imagem.');}
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3*1024*1024)throw new Error('Miniatura acima do limite.');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
   if(!size)throw new Error('Miniatura vazia.');return {body:Buffer.concat(chunks),type:type.split(';')[0]};
  }
  throw new Error('Limite de redirecionamentos de miniatura excedido.');
 }
 async retrieve(id){
  const row=this.database.db.prepare('SELECT v.* FROM videos v JOIN sources s ON s.id=v.source_id WHERE v.id=? AND s.enabled=1').get(id);
  if(!row){const error=new Error('Vídeo não encontrado.');error.status=404;throw error}
  const source=this.sources.find(source=>source.id===row.source_id&&source.enabled!==false);
  if(!source)throw new Error('Fonte de miniatura não configurada.');
  if(row.thumbnail){try{return await this.image(row.thumbnail,source,row.source_url)}catch{}}
  const previous=this.lastRepair.get(id);if(previous!==undefined&&this.now()-previous<60000)throw new Error('A miniatura da origem está temporariamente indisponível.');
  while(this.lastRepair.size>=500)this.lastRepair.delete(this.lastRepair.keys().next().value);this.lastRepair.set(id,this.now());
  const pages=[row.source_url];
  if(source.adapter==='xvideos'&&/^[a-z0-9]+$/i.test(row.external_id))pages.unshift(new URL(`/video${/^\d+$/.test(row.external_id)?'':'.'}${row.external_id}/video`,source.url).href);
  for(const url of new Set(pages)){
   let page;try{page=await fetchPage(url,source,{timeoutMs:15000,maxResponseBytes:5000000},{fetcher:this.fetcher})}catch{continue}
   for(const candidate of extractThumbnails(page.html,page.url,source)){try{const image=await this.image(candidate,source,page.url);this.database.db.prepare('UPDATE videos SET thumbnail=?,source_url=? WHERE id=?').run(candidate,page.url,id);return image}catch{}}
  }
  throw new Error('A origem não disponibilizou uma miniatura válida.');
 }
 async fetch(id){
  let promise=this.inflight.get(id);
  if(!promise){promise=this.slots.run(()=>this.retrieve(id));this.inflight.set(id,promise);promise.finally(()=>this.inflight.delete(id)).catch(()=>{})}
  try{const image=await promise;return new Response(image.body,{headers:{'Content-Type':image.type,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}})}catch(error){return new Response(error.message,{status:error.status||502,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}})}
 }
}
