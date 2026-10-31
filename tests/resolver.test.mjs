import {test} from 'node:test';import assert from 'node:assert/strict';
import {extractMedia,resolveMedia,publicUrl} from '../worker/resolver.js';
const base='https://video.example/watch/1';
const html=text=>new Response(text,{headers:{'content-type':'text/html; charset=utf-8'}});
test('extrai vídeo de HTML e preserva assinatura e URLs relativas',()=>{
 const results=extractMedia('<video controls><source src="/media/clip.mp4?token=x&amp;key=y" type="video/mp4"></video>',base);
 assert.deepEqual(results[0],{url:'https://video.example/media/clip.mp4?token=x&key=y',type:'video'});
});
test('extrai JSON-LD, Open Graph, streaming e players oficiais',()=>{
 const doc='<script type="application/ld+json">{"@graph":[{"@type":"VideoObject","contentUrl":"https://cdn.example/stream.m3u8?key=x"}]}</script>';
 assert.equal(extractMedia(doc,base)[0].type,'hls');
 assert.deepEqual(extractMedia('<meta content="https://cdn.example/opaque?key=x" property="og:video"><meta property="og:video:type" content="video/mp4">',base)[0],{url:'https://cdn.example/opaque?key=x',type:'video'});
 assert.equal(extractMedia('<meta name="twitter:player" content="https://www.youtube.com/embed/M7lc1UVf-VE">',base)[0].type,'official');
 assert.equal(extractMedia('<script>var player={"file":"https:\\/\\/cdn.example\\/video.mp4?key=1"}</script>',base)[0].type,'video');
 assert.equal(extractMedia('<iframe src="https://cdn.example/embed/42"></iframe>',base)[0].type,'embed');
});
test('não executa HTML nem confunde página, anúncio ou áudio com o vídeo',()=>{
 for(const doc of ['<meta property="og:video" content="'+base+'">','<video src="javascript:alert(1)"></video>','<iframe src="https://ads.example/ad"></iframe>','<audio><source src="https://cdn.example/audio.mp3"></audio>'])assert.deepEqual(extractMedia(doc,base),[]);
});
test('bloqueia destinos locais, credenciais, portas e esquemas inválidos',()=>{
 for(const u of ['http://127.0.0.1/video','http://2130706433/a','http://[::1]/','http://localhost/a','https://x.internal/a','https://a.example:8443/a','https://user:pass@a.example/a','file:///a','https://a.example./x'])assert.throws(()=>publicUrl(u));
 assert.equal(publicUrl(base).href,base);
});
test('valida redirecionamento antes de buscar destino e reconhece MIME sem extensão',async()=>{
 let calls=0;await assert.rejects(resolveMedia(base,async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}})}));assert.equal(calls,1);
 const result=await resolveMedia(base,async()=>new Response('video bytes',{headers:{'content-type':'video/mp4'}}));assert.equal(result.candidates[0].type,'video');
});
test('resolve a página com metadados, sem depender do navegador nem gravar URL expirada',async()=>{
 const result=await resolveMedia(base,async()=>html('<video src="https://cdn.example/clip.mp4?token=now"></video>'));
 assert.equal(result.candidates[0].url,'https://cdn.example/clip.mp4?token=now');
 await assert.rejects(resolveMedia(base,async()=>html('<h1>Login</h1>')),/não expõe/);
 await assert.rejects(resolveMedia(base,async()=>new Response(null,{status:403})),/não disponibilizou/);
});
test('limita páginas muito grandes e loops de redirecionamento',async()=>{
 await assert.rejects(resolveMedia(base,async()=>html('x'.repeat(2*1024*1024+1))),/limite/);
 let calls=0;await assert.rejects(resolveMedia(base,async()=>{calls++;return new Response(null,{status:302,headers:{location:base}})}),/redirecionou/);assert.equal(calls,5);
});

test('reconhece o player publicado no compartilhamento e a variável de iframe inicialmente vazio',async()=>{
 const {readFile}=await import('node:fs/promises');const fixture=await readFile(new URL('./fixtures/published-iframe.html',import.meta.url),'utf8');
 const expected=[{url:'https://media.example/?id=42&e=share-token',type:'embed'},{url:'https://catalog.example/embedx/42/?e=share-token',type:'embed'}];
 assert.deepEqual(extractMedia(fixture,'https://catalog.example/watch/42'),expected);
 const result=await resolveMedia('https://catalog.example/watch/42',async()=>html(fixture));assert.deepEqual(result.candidates,expected);
});
test('iframe principal é reconhecido pelos atributos mesmo na raiz do domínio',()=>{
 assert.deepEqual(extractMedia('<iframe id="video_embed_player" src="https://media.example/?id=42&amp;e=token" title="Embed video" allowfullscreen></iframe>',base),[{url:'https://media.example/?id=42&e=token',type:'embed'}]);
 assert.deepEqual(extractMedia('<iframe class="video-player" data-src="https://media.example/?id=43" src="about:blank"></iframe>',base),[{url:'https://media.example/?id=43',type:'embed'}]);
});
test('aceita código de incorporação em textarea e preserva parâmetros',()=>{
 assert.deepEqual(extractMedia('<textarea>&lt;iframe src=&quot;/embedx/42/?e=abc&amp;amp;v=1&quot;&gt;&lt;/iframe&gt;</textarea>',base),[{url:'https://video.example/embedx/42/?e=abc&v=1',type:'embed'}]);
});
test('ignora scripts que montam expressões, iframes escondidos e anúncios identificados',()=>{
 for(const snippet of ["<script>var video_embed = 'https://media.example/' + getSecret();</script>",'<iframe id="video-player-ad" src="https://ads.example/embed/1"></iframe>','<iframe title="Video player" src="https://track.example/player/1" width="1" height="1"></iframe>','<input value="&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;">'])assert.deepEqual(extractMedia(snippet,base),[]);
});
test('lê strings escapadas sem executar o código de origem',()=>{
 assert.deepEqual(extractMedia("<script>var video_embed='https:\\/\\/media.example\\x2f?id=42\\u0026e=token';window.attack();</script>",base),[{url:'https://media.example/?id=42&e=token',type:'embed'}]);
});

test('resolve links diretos do XVideos sem solicitar HTML que pode vir vazio do servidor',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw new Error('HTML indisponível')};
 for(const source of ['https://www.xvideos.com/video1441968/video','https://www.xvideos.com/video.hpttbt0d66/video']){
  const result=await resolveMedia(source,fetcher);assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].type,'official');assert.match(result.candidates[0].url,/^https:\/\/www\.xvideos\.com\/embedframe\//);
 }
 assert.equal(calls,0);
});
