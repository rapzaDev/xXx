import {load} from 'cheerio';
import {sourceUrl} from './config.mjs';
export const categoryKey=name=>String(name).normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
export function categoryName(value){return clean(value).replace(/\s*\([\d.,\s]+\)\s*$/,'').replace(/\s+(?:\d{1,3}(?:[,.]\d{3})+|\d{4,})(?:\s+videos)?$/i,'').replace(/\s+(?:Porn Videos|Videos|Category)$/i,'').trim()}

function titleOf($,a){return clean(a.attr('title')||a.attr('aria-label')||a.clone().find('.duration,small,.count').remove().end().text()||a.find('img').attr('alt'))}
function httpsImage(value,base){try{if(!value)return null;const u=new URL(value,base);return u.protocol==='https:'&&!u.username&&!u.password&&!/(?:blank|placeholder|transparent|spacer)[._-]/i.test(u.pathname)?u.href:null}catch{return null}}
export function videoIdentity(url,adapter){
 const u=new URL(url);
 if(adapter==='xvideos')return u.pathname.match(/^\/video\.([a-z0-9]{4,64})(?:\/|$)/i)?.[1]||u.pathname.match(/^\/video(\d+)(?:\/|$)/)?.[1];
 if(adapter==='pornhub'&&u.pathname==='/view_video.php')return u.searchParams.get('viewkey')?.match(/^[a-z0-9_-]{4,100}$/i)?.[0];
 if(adapter==='xhamster'&&u.pathname.startsWith('/videos/'))return u.pathname.replace(/\/$/,'').match(/-([a-zA-Z0-9]+)$/)?.[1];
 return null;
}
export function parseListing(html,url,source){
 const $=load(html),categories=new Map(),videos=new Map();
 $('a[href]').each((_,element)=>{
  const a=$(element);let u;try{u=new URL(sourceUrl(a.attr('href'),source,url))}catch{return}
  const isCategory=source.adapter==='xvideos'?/^\/c\/[^/]+-\d+\/?$/.test(u.pathname):source.adapter==='xhamster'?/^\/categories\/[^/]+\/?$/.test(u.pathname):/^\/categories\/[^/]+\/?$/.test(u.pathname)||(u.pathname==='/video'&&/^\d+$/.test(u.searchParams.get('c')||''));
  if(!isCategory)return;
  let name=categoryName(titleOf($,a));
  if(!name||name.length>100)return;
  // Remove decorative site suffixes while preserving the original category name.
  name=name.replace(/\s+(?:Porn Videos|Videos|Category)$/i,'').trim();
  if(!name)return;
  const key=categoryKey(name);if(!categories.has(key))categories.set(key,{name,url:u.href});
 });
 const selectors={xvideos:'.thumb-block',xhamster:'.video-thumb',pornhub:'.videoBox'};
 $(selectors[source.adapter]).each((_,element)=>{
  const card=$(element);let a=card.find(source.adapter==='xhamster'?'.video-thumb-info__name':'.title a').first();
  if(!a.length)a=card.find('a[href]').filter((_,e)=>{try{return Boolean(videoIdentity(new URL($(e).attr('href'),url),source.adapter))}catch{return false}}).first();
  let href;try{href=sourceUrl(a.attr('href'),source,url)}catch{return}
  const externalId=videoIdentity(href,source.adapter),title=titleOf($,a);if(!externalId||!title||title.length>500)return;
  let image=card.find('.thumb img,.phimage img,.thumb-image-container img,[data-role="thumb-preview-img"]').first();if(!image.length)image=card.find('img').first();
  const srcset=image.attr('data-srcset')||image.attr('srcset')||'';
  const alternatives=[...srcset.matchAll(/(\S+)\s+\d+(?:\.\d+)?[wx](?:\s*,|\s*$)/g)].map(match=>match[1]);
  const thumbnail=[image.attr('data-src'),image.attr('data-image'),image.attr('data-original'),image.attr('data-lazy-src'),...alternatives,image.attr('src')].map(value=>httpsImage(value,url)).find(Boolean)||null;
  const duration=clean(card.find('.duration,[data-role="video-duration"],.thumb-image-container__duration').first().text()).slice(0,40);
  const author=clean(card.find('.name,.video-thumb-uploader a,.usernameWrap a').first().text())||source.name;
  const u=new URL(href);for(const key of [...u.searchParams.keys()])if(source.adapter!=='pornhub'||key!=='viewkey')u.searchParams.delete(key);
  // Listing links may contain temporary tracking paths that later return 404.
  // The provider's stable video route resolves to the current canonical page.
  if(source.adapter==='xvideos')u.pathname=`/video${/^\d+$/.test(externalId)?'':'.'}${externalId}/video`;
  videos.set(externalId,{externalId,title,sourceUrl:u.href,thumbnail,duration,author:author.slice(0,100)});
 });
 const current=new URL(url),options=[];
 const scope=u=>{
  if(source.adapter==='pornhub')return u.pathname===current.pathname&&u.searchParams.get('c')===current.searchParams.get('c');
  return u.pathname.replace(/\/\d+\/?$/,'').replace(/\/$/,'')===current.pathname.replace(/\/\d+\/?$/,'').replace(/\/$/,'');
 };
 const pageOf=u=>Number(u.searchParams.get('page')??u.searchParams.get('p')??u.pathname.match(/\/(\d+)\/?$/)?.[1]??0);
 $('a[rel="next"],link[rel="next"],[class*="pagination"] a,[class*="paging"] a,[class*="pager"] a').each((_,element)=>{
  const a=$(element);let u;try{u=new URL(sourceUrl(a.attr('href'),source,url))}catch{return}
  if(u.href===current.href||!scope(u))return;
  const label=[a.attr('rel'),a.attr('class'),a.attr('aria-label'),a.text()].join(' ');
  const next=/\bnext\b|próxim|seguinte|[»›]/i.test(label),number=pageOf(u);
  if(next||number>pageOf(current))options.push({url:u.href,rank:next?-1:number});
 });
 options.sort((a,b)=>a.rank-b.rank);
 return {categories:[...categories.values()],videos:[...videos.values()],next:options[0]?.url||null,blocked:!videos.size&&!categories.size&&/captcha|access denied|verify you are human|just a moment|age verification/i.test($('title,h1').text())};
}
