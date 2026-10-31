import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {loadConfig} from './config.mjs';
import {fetchPage,robotsAllows} from './network.mjs';
import {parseListing} from './adapters.mjs';
export class Collector {
 constructor(database,{configPath,fetcher=fetch}={}){this.database=database;this.configPath=configPath;this.fetcher=fetcher;this.running=false;this.controller=null;this.nextRun=null;this.timer=null;this.paused=false}
 async run(){
  if(this.running)return {running:true};
  const config=loadConfig(this.configPath),db=this.database,owner=randomUUID();db.syncSources(config.sources);if(!db.acquire(owner))return {running:true};
  this.running=true;this.controller=new AbortController();const signal=this.controller.signal;
  const result={pages:0,added:0,errors:0,sources:[]};
  const runId=Number(db.db.prepare("INSERT INTO collection_runs(started_at,status) VALUES(?,'running')").run(new Date().toISOString()).lastInsertRowid);
  try{
   for(const source of config.sources.filter(s=>s.enabled!==false)){
    if(signal.aborted)break;db.prepareSource(source,config.collection.intervalHours);let sourcePages=0,sourceAdded=0,sourceErrors=0;
    db.setSourceStatus(source.id,'collecting','Consultando páginas públicas.');
    let robots='';try{robots=(await fetchPage(source.url+'/robots.txt',source,config.collection,{fetcher:this.fetcher,signal})).html}catch(error){
     // A missing robots.txt does not forbid indexing; unavailable access must not
     // be treated as permission to continue while a source is blocking requests.
     if(!error.message.includes('HTTP 404')){db.setSourceStatus(source.id,'blocked','Não foi possível verificar robots.txt: '+error.message);result.errors++;continue}
    }
    for(let i=0;i<config.collection.pagesPerSourcePerRun;i++){
     if(signal.aborted||db.usage(source.id)>=config.collection.pagesPerSourcePerDay)break;
     const job=db.nextJob(source.id,{preferRefresh:i%5===0});if(!job)break;db.heartbeat(owner);
     try{
      if(!robotsAllows(robots,job.url)){const error=new Error('A coleta desta página está desabilitada pelo robots.txt da fonte.');error.blocked=true;throw error}
      if(sourcePages)await delay(config.collection.requestDelayMs,undefined,{signal});
      db.countRequest(source.id);const page=await fetchPage(job.url,source,config.collection,{fetcher:this.fetcher,signal});sourcePages++;result.pages++;
      const parsed=parseListing(page.html,page.url,source);
      if(parsed.blocked){const error=new Error('A origem apresentou uma verificação de acesso.');error.blocked=true;throw error}
      if(!parsed.categories.length&&!parsed.videos.length&&job.kind!=='category')throw new Error('A estrutura recebida não contém categorias nem vídeos reconhecidos.');
      if(job.kind==='category'&&!parsed.videos.length)throw new Error('A categoria não retornou vídeos reconhecidos; o progresso foi preservado para revisão.');
      const saved=db.savePage(source,job,parsed);sourceAdded+=saved.added;result.added+=saved.added;
     }catch(error){if(signal.aborted)break;db.finishJob(job.id,error);sourceErrors++;result.errors++;db.setSourceStatus(source.id,error.blocked?'blocked':'error',error.message);if(error.blocked)break}
     db.db.prepare('UPDATE collection_runs SET pages=?,added=?,errors=? WHERE id=?').run(result.pages,result.added,result.errors,runId);
    }
    if(!sourceErrors){const pendingError=db.db.prepare("SELECT state,error FROM jobs WHERE source_id=? AND state IN ('blocked','error') ORDER BY updated_at DESC LIMIT 1").get(source.id);if(pendingError)db.setSourceStatus(source.id,pendingError.state==='blocked'?'blocked':'error',pendingError.error);else db.setSourceStatus(source.id,'ready',db.usage(source.id)>=config.collection.pagesPerSourcePerDay?'Limite diário atingido; o progresso foi salvo.':`${sourcePages} páginas processadas nesta execução.`)}
    result.sources.push({id:source.id,pages:sourcePages,added:sourceAdded,errors:sourceErrors});
   }
   return result;
  }finally{
   db.db.prepare('UPDATE collection_runs SET finished_at=?,status=?,pages=?,added=?,errors=?,message=? WHERE id=?').run(new Date().toISOString(),signal.aborted?'interrupted':result.errors?'partial':'completed',result.pages,result.added,result.errors,signal.aborted?'Coleta interrompida; progresso salvo.':'',runId);
   db.release(owner);this.running=false;this.controller=null;
  }
 }
 schedule({immediate=true}={}){
  this.paused=false;
  const next=()=>{if(this.paused)return;const hours=loadConfig(this.configPath).collection.intervalHours;this.nextRun=new Date(Date.now()+hours*3600000).toISOString();this.timer=setTimeout(()=>{this.timer=null;this.nextRun=null;this.run().catch(e=>console.error('Coleta:',e.message)).finally(next)},hours*3600000);this.timer.unref?.()};
  if(immediate)this.run().catch(e=>console.error('Coleta:',e.message)).finally(next);else next();
 }
 stop(){this.paused=true;clearTimeout(this.timer);this.timer=null;this.nextRun=null;this.controller?.abort()}
}
