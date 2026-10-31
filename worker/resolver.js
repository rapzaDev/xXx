import {parseSource} from '../public/catalog.js';

// Resolve published media metadata; never execute a page's scripts or proxy video bytes.
export function publicUrl(value, base){
 const u=new URL(value,base), h=u.hostname.toLowerCase();
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.href.length>8192||u.port||!h.includes('.')||h.endsWith('.')||h.includes(':')||/^(localhost|.*\.(localhost|local|internal|test|invalid|home|lan))$/.test(h))throw new Error('Use o endereço público de um vídeo.');
 if(/^\d+(\.\d+){3}$/.test(h))throw new Error('Endereços IP não são aceitos.');
 return u;
}
function decode(value){return String(value).replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,m=>{const k=m.slice(1,-1).toLowerCase();if(k[0]==='#'){const n=k[1]==='x'?parseInt(k.slice(2),16):Number(k.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[k]})}
function attrs(tag){const result={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))result[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return result}
const iframePattern=()=>/<iframe\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
function scriptString(literal){
 if(literal.startsWith('"'))return JSON.parse(literal);
 return literal.slice(1,-1).replace(/\\(u[\da-f]{4}|x[\da-f]{2}|\r?\n|[\s\S])/gi,(_,escape)=>{
  if(/^[ux]/i.test(escape))return String.fromCharCode(parseInt(escape.slice(1),16));
  return ({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','\n':'','\r\n':''})[escape]??escape;
 });
}
export function extractMedia(html,base){
 const choices=[];
 function add(value,type,priority=0){try{if(typeof value!=='string'||!value.trim())return;const u=publicUrl(decode(value),base);if(u.protocol!=='https:')return;const parsed=parseSource(u.href);if(parsed.embedUrl)choices.push({url:parsed.embedUrl,type:parsed.embedType,priority:priority+10});else if(u.href!==base)choices.push({url:u.href,type,priority})}catch{}}
 const meta={};for(const match of html.matchAll(/<meta\b[^>]*>/gi)){const a=attrs(match[0]);meta[(a.property||a.name||a.itemprop||'').toLowerCase()]=a.content}
 add(meta.contenturl,'video',70);add(meta.embedurl,'embed',60);
 for(const match of html.matchAll(/<link\b[^>]*>/gi)){const a=attrs(match[0]);if(a.rel==='video_src')add(a.href,'video',50)}
 add(meta['og:video:secure_url']||meta['og:video:url']||meta['og:video'],/mpegurl/i.test(meta['og:video:type']||'')?'hls':/^video\//i.test(meta['og:video:type']||'')?'video':'embed',30);
 add(meta['twitter:player:stream'],'video',50);add(meta['twitter:player'],'embed',20);
 for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
  try{const stack=[JSON.parse(match[1])];let count=0;while(stack.length&&++count<5000){const v=stack.pop();if(!v||typeof v!=='object')continue;if([v['@type']].flat().some(t=>/^(?:https?:\/\/schema.org\/)?VideoObject$/i.test(t||''))){add(v.contentUrl,'video',70);add(v.embedUrl,'embed',60)}for(const child of Object.values(v))if(child&&typeof child==='object')stack.push(child)}}catch{}
 }
 // Source tags are restricted to video elements, excluding audio and arbitrary embeds.
 for(const match of html.matchAll(/<video\b([^>]*)(?:>([\s\S]*?)<\/video\s*>|\/?>)/gi)){
  const a=attrs(match[1]);add(a.src||a['data-src'],'video',90);
  for(const source of (match[2]||'').matchAll(/<source\b[^>]*>/gi)){const s=attrs(source[0]);add(s.src||s['data-src'],/mpegurl/i.test(s.type||'')?'hls':'video',90)}
 }
 // Sharing widgets often publish the supported iframe as escaped markup.
 // Read only its src; never inject supplied HTML or execute page scripts.
 for(const match of html.matchAll(/<input\b(?:[^<>"']|"[^"]*"|'[^']*')*>|<textarea\b[^>]*>([\s\S]*?)<\/textarea\s*>/gi)){
  const a=attrs(match[0]);const markup=match[1]===undefined?a.value:decode(match[1]);
  if(!markup)continue;
  for(const frame of markup.matchAll(iframePattern())){const f=attrs(frame[0]);add(f.src||f['data-src'],'embed',120)}
 }
 for(const match of html.matchAll(iframePattern())){
  const a=attrs(match[0]),src=a['data-src']||a.src;
  const identity=[a.id,a.class,a.title,a['aria-label']].filter(Boolean).join(' ');
  const advertising=/(?:^|[\s_-])(?:ads?|advertisement|banner|tracking|analytics|toplist)(?:$|[\s_-])/i.test(identity);
  const hidden=/\b(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(a.style||'')||['0','1'].includes(a.width)||['0','1'].includes(a.height);
  const player=/(?:video|player|embed)/i.test(identity);
  if(src&&!advertising&&!hidden&&(player||/(?:\/embed[^/]*(?:\/|\?)|\/player(?:\/|\?)|player\.vimeo\.com\/)/i.test(src)))add(src,'embed',player?130:10);
 }
 // Server HTML may leave the frame blank and assign its URL from an inline
 // string literal later. Decode literals only; expressions are never evaluated.
 for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)){
  for(const m of script[1].matchAll(/\b(?:video_embed|videoEmbed|embed_url|embedUrl|player_url|playerUrl)\s*(?:=|:)\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*(?=[;,}\r\n]|$)/g)){
   try{add(scriptString(m[1]),'embed',125)}catch{}
  }
 }
 // Common player configurations expose URLs as JSON, with escaped slashes or unicode.
 for(const m of html.matchAll(/["'](?:file|video_url|videoUrl|hls|hlsUrl|contentUrl)["']\s*:\s*("(?:\\.|[^"\\])*"|'[^']*')/g)){
  try{const value=m[1][0]==='"'?JSON.parse(m[1]):m[1].slice(1,-1).replace(/\\\//g,'/');if(/\.(mp4|m4v|webm|ogv|mov|m3u8)(?:[?#]|$)/i.test(value))add(value,'video',40)}catch{}
 }
 // A common page must never be mistaken for its own embedded player.
 const seen=new Set();return choices.filter(v=>v.url!==base).sort((a,b)=>b.priority-a.priority).filter(v=>{if(seen.has(v.url))return false;seen.add(v.url);return true}).map(({url,type})=>({url,type:/\.m3u8(?:[?#]|$)/i.test(url)?'hls':type}));
}
async function limitedText(response){
 const reader=response.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let text='',size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw new Error('A página excedeu o limite de leitura.');text+=decoder.decode(value,{stream:true})}return text+decoder.decode()}finally{await reader.cancel().catch(()=>{})}
}
export async function resolveMedia(value,fetcher=fetch){
 let target=publicUrl(value);const direct=parseSource(target.href);if(direct.embedUrl)return {candidates:[{url:direct.embedUrl,type:direct.embedType}]};
 const signal=AbortSignal.timeout(12000);
 for(let redirects=0;redirects<5;redirects++){
  const response=await fetcher(target.href,{redirect:'manual',signal,headers:{Accept:'text/html,application/xhtml+xml,video/*;q=0.9,*/*;q=0.5'}});
  if(response.status>=300&&response.status<400){await response.body?.cancel();const location=response.headers.get('location');if(!location)throw new Error('A origem retornou um redirecionamento inválido.');target=publicUrl(location,target);const parsed=parseSource(target.href);if(parsed.embedUrl)return {candidates:[{url:parsed.embedUrl,type:parsed.embedType}]};continue}
  if(!response.ok){await response.body?.cancel();throw new Error('A origem não disponibilizou o vídeo para reprodução externa. Abra na fonte para assistir.')}
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim();
  if(mime.startsWith('video/')||/^(application\/(?:vnd\.apple\.mpegurl|x-mpegurl))$/i.test(mime)){await response.body?.cancel();if(target.protocol!=='https:')throw new Error('O vídeo precisa estar disponível por HTTPS.');return {candidates:[{url:target.href,type:/mpegurl/i.test(mime)?'hls':'video'}]}}
  if(!/^(text\/html|application\/xhtml\+xml)$/i.test(mime)){await response.body?.cancel();throw new Error('Este link não retornou uma página ou um vídeo compatível.')}
  const candidates=extractMedia(await limitedText(response),target.href);if(!candidates.length)throw new Error('A página não expõe um vídeo ou player incorporável. A origem pode exigir login ou bloquear reprodução externa.');return {candidates:candidates.slice(0,8)};
 }
 throw new Error('A origem redirecionou muitas vezes. Abra o vídeo na fonte.');
}
