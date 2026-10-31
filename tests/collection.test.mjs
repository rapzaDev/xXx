import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CatalogDatabase} from '../local/database.mjs';
import {Collector} from '../local/collector.mjs';
import {loadConfig} from '../local/config.mjs';
import {parseListing,categoryKey} from '../local/adapters.mjs';
import {robotsAllows,fetchPage} from '../local/network.mjs';
import {createLocalServer} from '../local/server.mjs';
const source={id:'one',name:'Fonte A',url:'https://source.example',adapter:'xvideos',enabled:true};
const video=(id='abcd1')=>({externalId:id,sourceUrl:`https://source.example/video.${id}/demo`,title:'Exercício de demonstração',author:'Canal de teste',thumbnail:'https://images.example/demo.jpg',duration:'03:20'});
const card=id=>`<div class="thumb-block"><p class="title"><a href="/video.${id}/demo" title="Demonstração ${id}">Demonstração</a></p><img data-src="https://images.example/${id}.jpg"><span class="duration">03:20</span></div>`;
function environment(t,settings={}){const dir=mkdtempSync(join(tmpdir(),'dojo-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const configPath=join(dir,'sources.json');writeFileSync(configPath,JSON.stringify({collection:{intervalHours:6,pagesPerSourcePerRun:2,pagesPerSourcePerDay:100,requestDelayMs:1,timeoutMs:1000,maxResponseBytes:100000,...settings},sources:[source]}));return {dir,configPath,dbPath:join(dir,'catalog.sqlite')}}
const html=body=>new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8'}});
test('adaptadores extraem títulos, miniaturas e próxima página dos três formatos',()=>{
 const first=parseListing('<a href="/c/Training-1">Training</a>'+card('abcd1')+'<div class="pagination"><a class="next-page" href="/c/Training-1/1">Next</a></div>','https://source.example/c/Training-1',source);
 assert.equal(first.categories[0].name,'Training');assert.equal(first.videos[0].title,'Demonstração abcd1');assert.equal(first.videos[0].thumbnail,'https://images.example/abcd1.jpg');assert.equal(first.next,'https://source.example/c/Training-1/1');
 const second=parseListing('<a href="/categories/training">Training</a><div class="video-thumb"><a class="video-thumb-info__name" href="/videos/training-xhAb12" title="Demonstração">Demo</a><img src="https://images.example/2.jpg"><div data-role="video-duration">01:05</div></div><a rel="next" href="/categories/training/2">Next</a>','https://source.example/categories/training',{...source,adapter:'xhamster'});
 assert.equal(second.videos[0].externalId,'xhAb12');assert.equal(second.videos[0].duration,'01:05');assert.equal(second.next,'https://source.example/categories/training/2');
 const third=parseListing('<a href="/video?c=1">Training</a><li class="videoBox"><span class="title"><a href="/view_video.php?viewkey=phDemo123" title="Demonstração">Demo</a></span><img data-image="https://images.example/3.jpg"><var class="duration">05:10</var></li><div class="pagination"><a href="/video?c=1&page=2">2</a><a href="/video?c=2&page=3">3</a></div>','https://source.example/video?c=1',{...source,adapter:'pornhub'});
 assert.equal(third.videos[0].externalId,'phDemo123');assert.equal(third.next,'https://source.example/video?c=1&page=2');
});
test('paginação ignora outros domínios e categorias; extração não executa scripts',()=>{
 const result=parseListing('<script>throw new Error("not executed")</script><a href="https://other.example/c/Bad-1">Bad</a><div class="pagination"><a rel="next" href="https://other.example/c/Training-1/2">Next</a><a href="/c/Other-2/3">3</a></div>','https://source.example/c/Training-1',source);
 assert.deepEqual(result.categories,[]);assert.equal(result.next,null);
 assert.equal(categoryKey(' Training  '),categoryKey('training'));assert.notEqual(categoryKey('Training'),categoryKey('Treino'));
});
test('SQLite preserva dados após reinício, une categorias e vincula vídeo a várias delas',t=>{
 const {dbPath}=environment(t);let db=new CatalogDatabase(dbPath);db.syncSources([source,{...source,id:'two',name:'Fonte B'}]);
 const key=db.addCategory('one',{name:'Training',url:source.url+'/c/Training-1'}),same=db.addCategory('two',{name:'training',url:source.url+'/c/Training-1'}),other=db.addCategory('one',{name:'Treino',url:source.url+'/c/Treino-2'});assert.equal(key,same);
 db.upsertVideo('one',video(),key);db.upsertVideo('one',video(),other);db.upsertVideo('two',video('abcd2'),same);
 assert.equal(db.query().total,2);assert.equal(db.query({q:'exercicio demonstracao',category:key}).total,2);assert.equal(db.query({q:'inexistente',category:key}).total,0);assert.equal(db.query({category:other}).total,1);assert.equal(db.query({provider:'two'}).total,1);assert.equal(db.query({ids:['one:abcd1']}).total,1);
 db.close();db=new CatalogDatabase(dbPath);assert.equal(db.query().total,2);assert.equal(db.query({category:other}).videos[0].categories.length,2);
 db.syncSources([{...source,enabled:false},{...source,id:'two',name:'Fonte B'}]);assert.equal(db.query().total,1);assert.equal(db.facets().categories.length,1);db.close();
});
test('fila retoma a próxima página e a repetição não duplica vídeos',async t=>{
 const {dbPath,configPath}=environment(t);let db=new CatalogDatabase(dbPath);const requested=[];
 const fetcher=async url=>{requested.push(url);if(url.endsWith('/robots.txt'))return html('User-agent: *\nAllow: /');if(url===source.url+'/')return html('<a href="/c/Training-1">Training</a>');if(url.endsWith('/1'))return html(card('abcd2'));return html(card('abcd1')+'<div class="pagination"><a href="/c/Training-1/1" class="next-page">Next</a></div>')};
 const first=await new Collector(db,{configPath,fetcher}).run();assert.equal(first.added,1);assert.equal(db.query().total,1);db.close();
 db=new CatalogDatabase(dbPath);const second=await new Collector(db,{configPath,fetcher}).run();assert.equal(second.added,1);assert.equal(db.query().total,2);assert.ok(requested.includes(source.url+'/c/Training-1/1'));
 await new Collector(db,{configPath,fetcher}).run();assert.equal(db.query().total,2);db.close();
});
test('limite diário pausa o avanço sem perder a fila nem limitar o total do catálogo',async t=>{
 const {dbPath,configPath}=environment(t,{pagesPerSourcePerDay:1});const db=new CatalogDatabase(dbPath);
 const fetcher=async url=>url.endsWith('robots.txt')?html('User-agent: *\nAllow: /'):html('<a href="/c/Training-1">Training</a>'+card('abcd1'));
 const collector=new Collector(db,{configPath,fetcher});await collector.run();assert.equal(db.usage(source.id),1);assert.equal(db.status().totals.pending,1);assert.equal((await collector.run()).pages,0);db.close();
});
test('robots e redirecionamentos restringem o coletor ao escopo configurado',async()=>{
 assert.equal(robotsAllows('User-agent: *\nDisallow: /private/\nAllow: /private/public$',source.url+'/private/a'),false);assert.equal(robotsAllows('User-agent: *\nDisallow: /private/\nAllow: /private/public$',source.url+'/private/public'),true);
 const config={timeoutMs:1000,maxResponseBytes:20};let calls=0;
 await assert.rejects(fetchPage(source.url+'/',source,config,{fetcher:async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/'}})}}),/domínio/);assert.equal(calls,1);
 await assert.rejects(fetchPage(source.url+'/',source,config,{fetcher:async()=>html('x'.repeat(21))}),/limite/);
});
test('falha de acesso é visível e não transforma erro em categoria concluída',async t=>{
 const {dbPath,configPath}=environment(t);const db=new CatalogDatabase(dbPath);const fetcher=async url=>url.endsWith('robots.txt')?html('User-agent: *\nAllow: /'):new Response(null,{status:403});
 const result=await new Collector(db,{configPath,fetcher}).run();assert.equal(result.errors,1);assert.equal(db.status().sources.find(s=>s.id==='one').status,'blocked');assert.equal(db.status().totals.videos,0);db.close();
});
test('trava SQLite impede duas coletas simultâneas mesmo em processos separados',t=>{
 const {dbPath}=environment(t);const a=new CatalogDatabase(dbPath),b=new CatalogDatabase(dbPath);assert.equal(a.acquire('a'),true);assert.equal(b.acquire('b'),false);a.release('a');assert.equal(b.acquire('b'),true);b.release('b');a.close();b.close();
});
test('pausar coleta impede que o agendamento seja recriado ao terminar',async t=>{
 const {dbPath,configPath}=environment(t);const db=new CatalogDatabase(dbPath);const collector=new Collector(db,{configPath,fetcher:async()=>html('User-agent: *\nDisallow: /')});collector.schedule();collector.stop();while(collector.running)await new Promise(resolve=>setTimeout(resolve,1));await new Promise(resolve=>setImmediate(resolve));assert.equal(collector.timer,null);assert.equal(collector.nextRun,null);db.close();
});
test('API pesquisa no banco, exporta registros e recusa alterações de outra origem',async t=>{
 const {dbPath,configPath}=environment(t);const db=new CatalogDatabase(dbPath);db.syncSources([source]);const key=db.addCategory(source.id,{name:'Training',url:source.url+'/c/Training-1'});db.upsertVideo(source.id,video(),key);
 const {server,collector}=createLocalServer({database:db,configPath,worker:{fetch:()=>new Response('ok')}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{collector.stop();await new Promise(resolve=>server.close(resolve));db.close()});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const result=await fetch(origin+'/api/catalog/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:'exercicio',category:key})});assert.equal(result.status,200);assert.equal((await result.json()).total,1);
 const exported=await (await fetch(origin+'/api/catalog/export')).json();assert.equal(exported.videos.length,1);
 const forbidden=await fetch(origin+'/api/collector/run',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://outside.example'},body:'{}'});assert.equal(forbidden.status,403);
 const invalid=await fetch(origin+'/api/catalog/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([{sourceUrl:'javascript:alert(1)'}])});assert.equal(invalid.status,400);assert.equal(db.query().total,1);
});

test('novidades não impedem que a fila avance para páginas antigas',t=>{
 const {dbPath}=environment(t);const db=new CatalogDatabase(dbPath);db.syncSources([source]);const key=db.addCategory(source.id,{name:'Training',url:source.url+'/c/Training-1'});
 db.enqueue(source.id,source.url+'/c/Training-1','category',key,0);const first=db.nextJob(source.id);db.finishJob(first.id);db.db.prepare("UPDATE jobs SET updated_at='2020-01-01' WHERE id=?").run(first.id);
 db.enqueue(source.id,source.url+'/c/Training-1/50','category',key,50);db.prepareSource(source,6);
 // Discovery jobs are finished here so this assertion isolates the two queues.
 db.db.prepare("UPDATE jobs SET state='done' WHERE kind!='category'").run();
 assert.equal(db.nextJob(source.id,{preferRefresh:true}).position,0);assert.equal(db.nextJob(source.id).position,50);db.close();
});

test('novos vídeos entram depois dos existentes e a ordem persiste sem salvar outra lista',t=>{
 const {dbPath}=environment(t);let db=new CatalogDatabase(dbPath);db.syncSources([source]);
 db.upsertVideo('one',video('zzzz1'));db.upsertVideo('one',video('aaaa1'));
 const original=db.query({pageSize:2}).videos.map(v=>v.id);assert.deepEqual(original,['one:zzzz1','one:aaaa1']);
 db.upsertVideo('one',video('00001'));assert.deepEqual(db.query({pageSize:2}).videos.map(v=>v.id),original);assert.deepEqual(db.query({page:2,pageSize:2}).videos.map(v=>v.id),['one:00001']);
 const count=db.query({countOnly:true,pageSize:2});assert.equal(count.total,3);assert.equal(count.pages,2);assert.equal('videos' in count,false);
 db.close();db=new CatalogDatabase(dbPath);assert.deepEqual(db.query({pageSize:2}).videos.map(v=>v.id),original);db.close();
});
test('vídeo antigo associado a uma categoria posteriormente entra no fim daquele filtro',t=>{
 const {dbPath}=environment(t);const db=new CatalogDatabase(dbPath);db.syncSources([source]);
 db.upsertVideo('one',video('old01'));const key=db.addCategory('one',{name:'Training',url:source.url+'/c/Training-1'});
 db.upsertVideo('one',video('new01'),key);db.upsertVideo('one',video('new02'),key);
 const original=db.query({category:key,q:'exercicio',provider:'one',pageSize:2}).videos.map(v=>v.id);db.upsertVideo('one',video('old01'),key);
 assert.deepEqual(db.query({category:key,q:'exercicio',provider:'one',pageSize:2}).videos.map(v=>v.id),original);assert.equal(db.query({category:key,q:'exercicio',provider:'one',page:2,pageSize:2}).videos[0].id,'one:old01');db.close();
});
