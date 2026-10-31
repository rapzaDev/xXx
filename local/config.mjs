import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export function loadConfig(path=new URL('../config/sources.json',import.meta.url)){
 const config=JSON.parse(readFileSync(path,'utf8'));
 if(!Array.isArray(config.sources)||!config.sources.length)throw new Error('Configure pelo menos uma fonte em config/sources.json.');
 const seen=new Set();
 for(const s of config.sources){
  const u=new URL(s.url);
  if(!/^[a-z0-9-]{1,40}$/.test(s.id)||seen.has(s.id)||u.protocol!=='https:'||u.port||u.username||u.password||!['xvideos','xhamster','pornhub'].includes(s.adapter))throw new Error('Configuração de fonte inválida.');
  seen.add(s.id);s.url=u.origin;s.name=String(s.name||s.id).slice(0,80);
 }
 const defaults={intervalHours:6,pagesPerSourcePerRun:5,pagesPerSourcePerDay:100,requestDelayMs:1200,timeoutMs:20000,maxResponseBytes:5000000};
 config.collection={...defaults,...config.collection};
 for(const [key,value] of Object.entries(config.collection))if(!Number.isFinite(value)||value<=0)throw new Error(`Limite inválido: ${key}`);
 return config;
}
export function sourceUrl(value,source,base=source.url){
 const u=new URL(value,base),host=new URL(source.url).hostname.replace(/^www\./,'');
 if(u.protocol!=='https:'||u.port||u.username||u.password||![host,`www.${host}`].includes(u.hostname))throw new Error('O endereço saiu do domínio configurado da fonte.');
 u.hash='';return u.href;
}
