import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {resolve} from 'node:path';
import {CatalogDatabase} from './database.mjs';
import {Collector} from './collector.mjs';
import {loadConfig,projectRoot,sourceUrl} from './config.mjs';
import {normalizeRecord,parseSource} from '../public/catalog.js';
import {videoIdentity} from './adapters.mjs';
import {LocalPlayback} from './playback.mjs';
import {LocalThumbnails} from './thumbnails.mjs';

async function jsonBody(req,limit=2*1024*1024){
 if(!String(req.headers['content-type']).includes('application/json')){const e=new Error('Envie JSON.');e.status=415;throw e}
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit){const e=new Error('Corpo da requisição muito grande.');e.status=413;throw e}chunks.push(chunk)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new Error('JSON inválido.')}
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
export function createLocalServer({database,collector,configPath,worker,playback=new LocalPlayback(),thumbnails}={}){
 const config=loadConfig(configPath),db=database||new CatalogDatabase(resolve(projectRoot,'.data/catalog.sqlite'));db.syncSources(config.sources);collector=collector||new Collector(db,{configPath});
 thumbnails=thumbnails||new LocalThumbnails(db,config.sources);
 function importRecords(records){
  if(!Array.isArray(records)||records.length>10000)throw new Error('Importe até 10.000 registros por vez.');
  let added=0;db.transaction(()=>{for(const raw of records){
   if(raw.origin==='collected'){
    const source=config.sources.find(s=>s.id===raw.sourceId);if(!source)throw new Error('O backup contém uma fonte que não está configurada.');const url=sourceUrl(raw.sourceUrl,source),externalId=videoIdentity(url,source.adapter);if(!externalId)throw new Error('Vídeo inválido no backup.');
    const video={externalId,sourceUrl:url,title:String(raw.title||'').trim().slice(0,500),author:String(raw.author||source.name).slice(0,100),duration:String(raw.duration||'').slice(0,40),thumbnail:null};
    try{const u=new URL(raw.thumbnail);if(u.protocol==='https:')video.thumbnail=u.href}catch{}
    if(!video.title)throw new Error('Título ausente no backup.');added+=db.upsertVideo(source.id,video);
    for(const cat of Array.isArray(raw.categories)?raw.categories:[]){const name=String(cat.name||'').trim();if(!name||name.length>100)continue;const key=db.addCategory(source.id,{name,url:source.url+'/'});db.db.prepare('INSERT OR IGNORE INTO video_categories(video_id,category_key) VALUES(?,?)').run(`${source.id}:${externalId}`,key)}
   }else{
    const allowed=[String(raw.category||'')].filter(c=>c&&c.length<=100);const record=normalizeRecord(raw,allowed);
    const key=db.addCategory('manual',{name:record.category,url:record.sourceUrl});
    db.db.prepare("DELETE FROM video_categories WHERE video_id IN (SELECT id FROM videos WHERE id=? AND source_id='manual')").run(record.id);
    added+=db.upsertVideo('manual',{id:record.id,externalId:record.id,sourceUrl:record.sourceUrl,title:record.title,author:record.author,manualData:record},key);
   }
  }});return added;
 }
 const server=createServer(async(req,res)=>{
  const host=String(req.headers.host||'');if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)){json(res,403,{error:'Este servidor aceita apenas acesso local.'});return}
  const origin='http://'+host,url=new URL(req.url,origin);
  if(req.headers.origin&&req.headers.origin!==origin){json(res,403,{error:'Origem não permitida.'});return}
  try{
   if(url.pathname==='/api/thumbnail'&&['GET','HEAD'].includes(req.method)){
    const id=url.searchParams.get('id');if(!id||id.length>8192){json(res,400,{error:'Identificador de miniatura inválido.'});return}
    const response=await thumbnails.fetch(id);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));return;
   }
   const mediaPath=url.pathname.match(/^\/api\/playback\/([A-Za-z0-9_-]{32})$/);
   if(mediaPath){
    const abort=new AbortController();res.once('close',()=>{if(!res.writableFinished)abort.abort()});
    const response=await playback.fetch(mediaPath[1],{method:req.method,range:req.headers.range,signal:abort.signal});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();return;
   }
   if(url.pathname==='/api/resolve'&&req.method==='POST'){
    const body=await jsonBody(req,10000);
    if(parseSource(body.url).playbackProvider==='xHamster'){
     const abort=new AbortController();res.once('close',()=>{if(!res.writableFinished)abort.abort()});
     json(res,200,await playback.resolve(body.url,{signal:abort.signal}));return;
    }
    const response=await worker.fetch(new Request(origin+req.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(url.pathname==='/api/catalog/facets'&&req.method==='GET'){const {categories,sources}=db.facets();json(res,200,{categories,sources:sources.map(({id,name,count})=>({id,name,count})),totals:{videos:sources.reduce((sum,source)=>sum+source.count,0),categories:categories.length}});return}
   if(url.pathname==='/api/catalog/status'&&req.method==='GET'){json(res,200,{...db.status(),collector:{running:collector.running||db.isCollecting(),nextRun:collector.nextRun},settings:loadConfig(configPath).collection});return}
   if(url.pathname==='/api/catalog/query'&&req.method==='POST'){json(res,200,db.query(await jsonBody(req,100000)));return}
   if(url.pathname==='/api/catalog/export'&&req.method==='GET'){res.setHeader('Content-Disposition','attachment; filename="dojo-atlas-catalogo.json"');json(res,200,{version:2,exportedAt:new Date().toISOString(),videos:db.export()});return}
   if(url.pathname==='/api/catalog/import'&&req.method==='POST'){const body=await jsonBody(req);const added=importRecords(Array.isArray(body)?body:body.videos);json(res,200,{added});return}
   if(url.pathname==='/api/catalog/manual'&&req.method==='POST'){const {record,editingId}=await jsonBody(req);const added=importRecords([record]);if(editingId&&editingId!==normalizeRecord(record,[record.category]).id)db.db.prepare("DELETE FROM videos WHERE id=? AND source_id='manual'").run(editingId);json(res,200,{added});return}
   if(url.pathname==='/api/catalog/manual'&&req.method==='DELETE'){const result=db.db.prepare("DELETE FROM videos WHERE id=? AND source_id='manual'").run(url.searchParams.get('id')||'');json(res,result.changes?200:404,{removed:Number(result.changes)});return}
   if(url.pathname==='/api/collector/run'&&req.method==='POST'){await jsonBody(req,1000);if(!collector.running){collector.run().catch(error=>console.error('Coleta:',error.message))}json(res,202,{running:collector.running});return}
   if(url.pathname==='/api/collector/pause'&&req.method==='POST'){await jsonBody(req,1000);collector.stop();json(res,200,{paused:true});return}
   if(url.pathname==='/api/collector/resume'&&req.method==='POST'){await jsonBody(req,1000);if(!collector.timer&&!collector.running)collector.schedule();json(res,202,{running:collector.running});return}
   if(url.pathname.startsWith('/api/catalog/')||url.pathname.startsWith('/api/collector/')){json(res,404,{error:'Rota não encontrada.'});return}
   const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
   const response=await worker.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){if(res.headersSent){res.destroy(error);return}if(!res.destroyed)json(res,error.status||400,{error:error.message})}
 });
 return {server,db,collector,importRecords,playback,thumbnails};
}
