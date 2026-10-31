import {randomBytes} from 'node:crypto';
import {load} from 'cheerio';
import {parseSource} from '../public/catalog.js';
import {fetchPage} from './network.mjs';

const SETTINGS={timeoutMs:20000,maxResponseBytes:5000000};
function mediaUrl(value){
 const url=new URL(value);
 const allowed=['xhcdn.com','ahcdn.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
 if(url.protocol!=='https:'||url.port||url.username||url.password||!allowed)throw new Error('Endereço de mídia fora do CDN da fonte.');
 return url;
}
export function extractXHamsterFiles(html){
 const text=load(html)('#initials-script').text();
 const match=text.match(/^\s*(?:window\.)?initials\s*=\s*({[\s\S]*})\s*;?\s*$/);
 if(!match)return [];
 let data;try{data=JSON.parse(match[1])}catch{return []}
 const found=new Map();
 const add=(quality,value)=>{try{if(typeof value!=='string')return;const url=mediaUrl(value);if(!/\.mp4$/i.test(url.pathname))return;if(!found.has(url.href))found.set(url.href,{url:url.href,quality:String(quality).slice(0,20)})}catch{}};
 // These are the public MP4 references emitted by the page. Opaque player
 // tokens, download landing pages and advertising URLs are never executed.
 for(const [quality,url] of Object.entries(data.downloadDropdownComponent?.sources?.mp4||{}))add(quality,url);
 const standard=data.xplayerSettings?.sources?.standard?.h264;
 for(const file of Array.isArray(standard)?standard:[])add(file.quality,file.url);
 const preferred=['480p','720p','360p','240p','1080p','144p'];
 const rank=quality=>{const index=preferred.indexOf(quality);return index<0?preferred.length:index};
 return [...found.values()].sort((a,b)=>rank(a.quality)-rank(b.quality)).slice(0,8);
}
export class LocalPlayback {
 constructor({fetcher=fetch,now=()=>Date.now(),maxSessions=80,ttlMs=4*3600000}={}){this.fetcher=fetcher;this.now=now;this.maxSessions=maxSessions;this.ttlMs=ttlMs;this.sessions=new Map()}
 async resolve(value,{signal}={}){
  const parsed=parseSource(value);if(parsed.playbackProvider!=='xHamster')throw new Error('Fonte de reprodução não suportada por este adaptador.');
  const input=new URL(parsed.sourceUrl);let url=input.href;
  if(!input.pathname.startsWith('/videos/')){const id=new URL(parsed.embedUrl).pathname.split('/').filter(Boolean).at(-1);url=`https://xhamster.com/videos/video-${id}`}
  const page=await fetchPage(url,{url:'https://xhamster.com'},SETTINGS,{fetcher:this.fetcher,signal});
  const files=extractXHamsterFiles(page.html);if(!files.length)throw new Error('A origem não disponibilizou um arquivo de reprodução para este vídeo.');
  for(const [key,session]of this.sessions)if(session.expiresAt<=this.now())this.sessions.delete(key);
  const candidates=[];
  for(const file of files){
   while(this.sessions.size>=this.maxSessions)this.sessions.delete(this.sessions.keys().next().value);
   const key=randomBytes(24).toString('base64url');this.sessions.set(key,{url:file.url,referer:page.url,expiresAt:this.now()+this.ttlMs});
   candidates.push({url:`/api/playback/${key}`,type:'video',quality:file.quality});
  }
  return {candidates};
 }
 async fetch(key,{method='GET',range=null,signal}={}){
  if(!['GET','HEAD'].includes(method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))return new Response('Intervalo de mídia inválido.',{status:416});
  const session=this.sessions.get(key);if(!session||session.expiresAt<=this.now()){this.sessions.delete(key);return new Response('A sessão de reprodução expirou. Reabra o vídeo.',{status:410})}
  session.expiresAt=this.now()+this.ttlMs;
  let target=mediaUrl(session.url);const headers={Origin:'https://xhamster.com',Referer:session.referer,'Accept-Encoding':'identity',Accept:'video/mp4'};
  if(range)headers.Range=range;
  for(let i=0;i<4;i++){
   const connect=new AbortController(),timer=setTimeout(()=>connect.abort(),20000);
   let response;try{response=await this.fetcher(target.href,{method,headers,redirect:'manual',signal:signal?AbortSignal.any([signal,connect.signal]):connect.signal})}finally{clearTimeout(timer)}
   if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)break;target=mediaUrl(new URL(location,target).href);continue}
   const outputHeaders=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   if(response.status===416){for(const key of ['content-range','accept-ranges']){const value=response.headers.get(key);if(value)outputHeaders.set(key,value)}await response.body?.cancel();return new Response(null,{status:416,headers:outputHeaders})}
   if(!response.ok||!/^video\/mp4(?:;|$)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();return new Response('A origem recusou a reprodução deste arquivo.',{status:502,headers:outputHeaders})}
   for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=response.headers.get(key);if(value)outputHeaders.set(key,value)}
   if(method==='HEAD'){await response.body?.cancel();return new Response(null,{status:response.status,headers:outputHeaders})}
   // The upstream stream is forwarded with backpressure, never buffered to a
   // file or retained in the database. Disconnecting the visitor cancels it.
   return new Response(response.body,{status:response.status,headers:outputHeaders});
  }
  return new Response('A origem excedeu o limite de redirecionamentos.',{status:502});
 }
}
