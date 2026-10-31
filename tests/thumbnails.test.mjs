import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CatalogDatabase} from '../local/database.mjs';
import {LocalThumbnails,extractThumbnails,thumbnailUrl} from '../local/thumbnails.mjs';
import {createLocalServer} from '../local/server.mjs';
const source={id:'pornhub',name:'Pornhub',url:'https://www.pornhub.com',adapter:'pornhub',enabled:true};
const old='https://pix.phncdn.com/demo/old.jpg?token=old',fresh='https://pix.phncdn.com/demo/fresh.jpg?token=fresh';
const page='https://www.pornhub.com/view_video.php?viewkey=phDemo123';
function setup(){const db=new CatalogDatabase(':memory:');db.syncSources([source]);db.upsertVideo(source.id,{externalId:'phDemo123',sourceUrl:page,title:'Vídeo de demonstração',author:'Canal de teste',thumbnail:old});return db}
function image(){return new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}})}
test('repasse de preview utiliza o contexto da fonte e retorna imagem com cache privado',async()=>{
 const db=setup();let request;const previews=new LocalThumbnails(db,[source],{fetcher:async(url,options)=>{request={url,options};return image()}});
 const r=await previews.fetch('pornhub:phDemo123');assert.equal(r.status,200);assert.equal(request.url,old);assert.equal(request.options.headers.Referer,page);assert.equal(request.options.headers.Origin,source.url);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(r.headers.get('cache-control'),'private, max-age=3600');assert.equal((await r.arrayBuffer()).byteLength,4);db.close();
});
test('URL expirada é renovada na página de origem sem alterar ordem, título ou ID',async()=>{
 const db=setup(),before=db.db.prepare('SELECT rowid,created_at,title FROM videos').get();const seen=[];
 const previews=new LocalThumbnails(db,[source],{fetcher:async url=>{seen.push(url);if(url===old)return new Response('Forbidden',{status:403});if(url===page)return new Response(`<meta property="og:image" content="${fresh}">`,{headers:{'Content-Type':'text/html'}});if(url===fresh)return image();throw new Error('Unexpected URL')}});
 const r=await previews.fetch('pornhub:phDemo123');assert.equal(r.status,200);assert.deepEqual(seen,[old,page,fresh]);assert.equal(db.db.prepare('SELECT thumbnail FROM videos').get().thumbnail,fresh);assert.deepEqual(db.db.prepare('SELECT rowid,created_at,title FROM videos').get(),before);await r.body.cancel();db.close();
});
test('poster ausente é recuperado de dados estruturados e scripts não são executados',()=>{
 const markup='<script type="application/ld+json">{"@type":"VideoObject","thumbnailUrl":["'+fresh+'"]}</script><script>throw new Error("not executed")</script>';
 assert.deepEqual(extractThumbnails(markup,page,source),[fresh]);
 for(const url of ['https://pix.phncdn.com.evil.example/demo.jpg','http://pix.phncdn.com/demo.jpg','https://127.0.0.1/demo.jpg','https://pix.phncdn.com/placeholder.gif'])assert.throws(()=>thumbnailUrl(url,source));
});
test('requisições simultâneas da mesma miniatura compartilham uma consulta',async()=>{
 const db=setup();let calls=0;const previews=new LocalThumbnails(db,[source],{fetcher:async()=>{calls++;await new Promise(resolve=>setImmediate(resolve));return image()}});
 const [a,b]=await Promise.all([previews.fetch('pornhub:phDemo123'),previews.fetch('pornhub:phDemo123')]);assert.equal(calls,1);assert.equal(a.status,200);assert.equal(b.status,200);await Promise.all([a.body.cancel(),b.body.cancel()]);db.close();
});
test('redirecionamento de imagem não pode sair dos CDNs da fonte',async()=>{
 const db=setup();const seen=[];const previews=new LocalThumbnails(db,[source],{fetcher:async url=>{seen.push(url);return url===old?new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}}):new Response('',{headers:{'Content-Type':'text/html'}})}});
 const r=await previews.fetch('pornhub:phDemo123');assert.equal(r.status,502);assert.equal(seen.some(url=>url.includes('127.0.0.1')),false);await r.body.cancel();db.close();
});
test('API de miniaturas entrega a imagem pelo ID e não aceita URLs arbitrárias',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'dojo-images-')),path=join(dir,'sources.json');writeFileSync(path,JSON.stringify({sources:[source]}));const db=setup(),thumbnails=new LocalThumbnails(db,[source],{fetcher:async()=>image()});
 const {server,collector}=createLocalServer({database:db,configPath:path,thumbnails,worker:{fetch:()=>new Response('Not found',{status:404})}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{collector.stop();await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true})});
 const origin=`http://127.0.0.1:${server.address().port}`,response=await fetch(origin+db.query().videos[0].thumbnailUrl);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal((await response.arrayBuffer()).byteLength,4);
 assert.equal((await fetch(origin+'/api/thumbnail?url=https://external.example/1.jpg')).status,400);assert.equal((await fetch(origin+'/api/thumbnail?id=missing')).status,404);
});

test('preview do XVideos recupera a página estável quando o link antigo de listagem expirou',async()=>{
 const source={id:'xvideos',name:'XVideos',url:'https://www.xvideos.com',adapter:'xvideos',enabled:true};const db=new CatalogDatabase(':memory:');db.syncSources([source]);const oldPage=source.url+'/video.demo123/1234/0/tracking',stable=source.url+'/video.demo123/video',oldImage='https://thumb.xvideos-cdn.com/old.jpg',newImage='https://thumb.xvideos-cdn.com/fresh.jpg';db.upsertVideo(source.id,{externalId:'demo123',sourceUrl:oldPage,title:'Demonstração',author:'Canal de teste',thumbnail:oldImage});
 const seen=[];const previews=new LocalThumbnails(db,[source],{fetcher:async url=>{seen.push(url);if(url===oldImage||url===oldPage)return new Response('',{status:404});if(url===stable)return new Response('<meta property="og:image" content="'+newImage+'">',{headers:{'Content-Type':'text/html'}});if(url===newImage)return image();throw new Error('Unexpected URL')}});
 const response=await previews.fetch('xvideos:demo123');assert.equal(response.status,200);assert.deepEqual(seen,[oldImage,stable,newImage]);assert.equal(db.db.prepare('SELECT source_url FROM videos').get().source_url,stable);await response.body.cancel();db.close();
});
