import {sourceUrl} from './config.mjs';
export async function fetchPage(url,source,settings,{fetcher=fetch,signal}={}){
 let target=sourceUrl(url,source);
 const timeout=AbortSignal.timeout(settings.timeoutMs);
 const combined=signal?AbortSignal.any([signal,timeout]):timeout;
 for(let i=0;i<5;i++){
  const r=await fetcher(target,{redirect:'manual',signal:combined,headers:{'User-Agent':'DojoAtlas/0.1 (local metadata collector)','Accept':'text/html,text/plain;q=0.9'}});
  if(r.status>=300&&r.status<400){const location=r.headers.get('location');await r.body?.cancel();if(!location)throw new Error('Redirecionamento sem destino.');target=sourceUrl(location,source,target);continue}
  if(!r.ok){await r.body?.cancel();const error=new Error(`A origem respondeu HTTP ${r.status}.`);error.blocked=[401,403,429].includes(r.status);throw error}
  if(!/text\/(html|plain)|application\/xhtml\+xml/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw new Error('A origem não retornou HTML.');}
  let size=0;const chunks=[];const reader=r.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>settings.maxResponseBytes)throw new Error('Página maior que o limite configurado.');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
  return {url:target,html:Buffer.concat(chunks).toString('utf8')};
 }
 throw new Error('Limite de redirecionamentos excedido.');
}
// Longest matching rule wins, as in RFC 9309. Only public listing routes are collected.
export function robotsAllows(text,url){
 const groups=[];let agents=[],rules=[],readingRules=false;
 for(const line of text.split(/\r?\n/)){const match=line.split('#')[0].trim().match(/^([^:]+):\s*(.*)$/);if(!match)continue;const key=match[1].toLowerCase(),value=match[2].trim();
  if(key==='user-agent'){if(readingRules){groups.push({agents,rules});agents=[];rules=[];readingRules=false}agents.push(value.toLowerCase())}
  else if(['allow','disallow'].includes(key)&&agents.length){readingRules=true;if(value)rules.push({allow:key==='allow',path:value})}
 }
 groups.push({agents,rules});let selected=groups.filter(g=>g.agents.some(a=>'dojoatlas'.startsWith(a)&&a!=='*'));if(!selected.length)selected=groups.filter(g=>g.agents.includes('*'));
 const u=new URL(url),path=u.pathname+u.search;let best={length:-1,allow:true};
 for(const rule of selected.flatMap(g=>g.rules)){const escaped=rule.path.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\$$/,'$');if(new RegExp('^'+escaped).test(path)){const length=rule.path.replace(/[*$]/g,'').length;if(length>best.length||(length===best.length&&rule.allow))best={length,allow:rule.allow}}}
 return best.allow;
}
