import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractXHamsterFiles,LocalPlayback} from '../local/playback.mjs';
import {CatalogDatabase} from '../local/database.mjs';
import {createLocalServer} from '../local/server.mjs';
const source='https://xhamster.com/videos/demo-xhAb123';
const mp4='https://video5.xhcdn.com/media/demo/480p.h264.mp4?token=example';
const fixture=(data={downloadDropdownComponent:{sources:{mp4:{'480p':mp4}}}})=>'<script id="initials-script">window.initials = '+JSON.stringify(data)+';</script>';
const html=body=>new Response(body,{headers:{'Content-Type':'text/html'}});
test('extrai apenas MP4 publicados, preservando assinaturas e priorizando qualidade econômica',()=>{
 const files=extractXHamsterFiles(fixture({downloadDropdownComponent:{sources:{mp4:{'720p':'https://video5.xhcdn.com/demo/720.mp4','480p':mp4,'240p':'https://wrong.example/240.mp4'},download:{link:'https://xhamster.com/download'}}},xplayerSettings:{sources:{standard:{h264:[{url:'opaque-player-token',quality:'auto'}]}}}}));
 assert.deepEqual(files,[{url:mp4,quality:'480p'},{url:'https://video5.xhcdn.com/demo/720.mp4',quality:'720p'}]);
 assert.deepEqual(extractXHamsterFiles('<script id="initials-script">window.initials={};window.attack();</script>'),[]);
});
test('resolução retorna sessões locais de vídeo, sem iframe ou URL arbitrária de proxy',async()=>{
 const playback=new LocalPlayback({fetcher:async url=>{assert.equal(url,source);return html(fixture())}});
 const result=await playback.resolve(source);assert.equal(result.candidates[0].type,'video');assert.match(result.candidates[0].url,/^\/api\/playback\/[A-Za-z0-9_-]{32}$/);assert.equal(result.candidates[0].quality,'480p');
 await assert.rejects(playback.resolve('https://xhamster.com.evil.example/videos/demo-xhAb123'),/não suportada/);
});
test('repasse preserva Range, tipo e Content-Range e envia o contexto correto à origem',async()=>{
 let received;const playback=new LocalPlayback({fetcher:async(url,options)=>{
  if(url===source)return html(fixture());received={url,options};return new Response(new Uint8Array([0,1,2,3]),{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-3/1000','Content-Length':'4','Accept-Ranges':'bytes'}});
 }});
 const resolved=await playback.resolve(source),key=resolved.candidates[0].url.split('/').at(-1),response=await playback.fetch(key,{range:'bytes=0-3'});
 assert.equal(received.url,mp4);assert.equal(received.options.headers.Referer,source);assert.equal(received.options.headers.Origin,'https://xhamster.com');assert.equal(received.options.headers.Range,'bytes=0-3');
 assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'video/mp4');assert.equal(response.headers.get('content-range'),'bytes 0-3/1000');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.has('location'),false);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[0,1,2,3]);
});
test('sessão expirada, token desconhecido e Range inválido não consultam a origem',async()=>{
 let now=1000,calls=0;const playback=new LocalPlayback({now:()=>now,ttlMs:100,fetcher:async()=>{calls++;return html(fixture())}});const resolved=await playback.resolve(source),key=resolved.candidates[0].url.split('/').at(-1);assert.equal(calls,1);
 assert.equal((await playback.fetch('unknown')).status,410);assert.equal((await playback.fetch(key,{range:'bytes=-'})).status,416);assert.equal((await playback.fetch(key,{range:'bytes=1-2,4-5'})).status,416);now=2000;assert.equal((await playback.fetch(key)).status,410);assert.equal(calls,1);
});
test('redirects de mídia não podem sair do CDN nem navegar o visitante',async()=>{
 let calls=0;const playback=new LocalPlayback({fetcher:async url=>{calls++;return url===source?html(fixture()):new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}})}});const resolved=await playback.resolve(source),key=resolved.candidates[0].url.split('/').at(-1);await assert.rejects(playback.fetch(key),/fora do CDN/);assert.equal(calls,2);
});
test('resposta de bloqueio do CDN não é repassada como vídeo ou redirecionamento',async()=>{
 const playback=new LocalPlayback({fetcher:async url=>url===source?html(fixture()):new Response('Wrong referer',{status:403})});const resolved=await playback.resolve(source),response=await playback.fetch(resolved.candidates[0].url.split('/').at(-1));assert.equal(response.status,502);assert.equal(response.headers.has('location'),false);
});
test('API local resolve e transmite vídeo com 206 sem navegar para a página da fonte',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'dojo-playback-')),path=join(dir,'sources.json');writeFileSync(path,JSON.stringify({sources:[{id:'xhamster',name:'xHamster',url:'https://xhamster.com',adapter:'xhamster'}]}));
 const db=new CatalogDatabase(join(dir,'catalog.sqlite')),playback=new LocalPlayback({fetcher:async url=>url===source?html(fixture()):new Response(new Uint8Array([4,5]),{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-1/1000','Content-Length':'2','Accept-Ranges':'bytes'}})});
 const {server,collector}=createLocalServer({database:db,configPath:path,playback,worker:{fetch:()=>new Response('Not found',{status:404})}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{collector.stop();await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true})});
 const origin=`http://127.0.0.1:${server.address().port}`,resolved=await(await fetch(origin+'/api/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:source})})).json();
 const response=await fetch(origin+resolved.candidates[0].url,{headers:{Range:'bytes=0-1'}});assert.equal(response.status,206);assert.equal(response.redirected,false);assert.equal(response.headers.get('content-type'),'video/mp4');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[4,5]);
});

test('acompanha o redirecionamento de mídia para o CDN alternativo observado da fonte',async()=>{
 const seen=[];const playback=new LocalPlayback({fetcher:async url=>{seen.push(new URL(url).hostname);if(url===source)return html(fixture());if(new URL(url).hostname.endsWith('xhcdn.com'))return new Response(null,{status:302,headers:{Location:'https://ip110963804.ahcdn.com/demo.mp4'}});return new Response(new Uint8Array([1,2]),{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-1/1000'}})}});const result=await playback.resolve(source),response=await playback.fetch(result.candidates[0].url.split('/').at(-1),{range:'bytes=0-1'});assert.equal(response.status,206);assert.deepEqual(seen,['xhamster.com','video5.xhcdn.com','ip110963804.ahcdn.com']);assert.equal(response.headers.has('location'),false);await response.body.cancel();
});
