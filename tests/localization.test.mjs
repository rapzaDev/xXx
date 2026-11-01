import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {CatalogDatabase} from '../local/database.mjs';
import {resolveLanguage,initI18n,setLanguage,t,categoryText,LANGUAGE_KEY} from '../public/i18n.js';
import {messages} from '../public/translations.js';
import {languages} from '../public/i18n.js';
import {searchGroups,matchesCategory} from '../public/search-terms.js';

test('idioma usa preferências BCP 47 do navegador, escolha manual e reserva em inglês',()=>{
 assert.deepEqual(resolveLanguage(['fr-FR','en-US']),{language:'fr',locale:'fr-FR'});
 assert.deepEqual(resolveLanguage(['pt-PT']),{language:'pt',locale:'pt-PT'});
 assert.deepEqual(resolveLanguage(['ja-JP']),{language:'ja',locale:'ja-JP'});
 assert.deepEqual(resolveLanguage(['sv-SE','de-DE']),{language:'de',locale:'de-DE'});
 assert.deepEqual(resolveLanguage(['fr-FR'],'pt'),{language:'pt',locale:'pt'});
 assert.deepEqual(resolveLanguage(['invalid_!','xx-XX']),{language:'en',locale:'en'});
});

test('navegador francês traduz a página, preserva valores de formulários e aceita troca manual sem rede',t=>{
 const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173'}),keys=['document','window','localStorage','fetch'],before=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value]of Object.entries({document:dom.window.document,window:dom.window,localStorage:dom.window.localStorage,fetch:()=>{throw new Error('A tradução não deve consultar serviços externos')}}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 t.after(()=>{dom.window.close();for(const [key,descriptor]of before){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}});
 Object.defineProperty(dom.window.navigator,'languages',{value:['fr-FR','en-US'],configurable:true});initI18n();
 assert.equal(document.documentElement.lang,'fr-FR');assert.equal(document.querySelector('#nav-categories').textContent,'◎ Catégories');assert.equal(document.querySelector('#search').placeholder,'Rechercher un titre ou un créateur');assert.equal(categoryText('Amateur'),'Amateurs');assert.equal(document.querySelector('[name="level"] option:nth-child(2)').value,'Iniciante');assert.equal(localStorage.getItem(LANGUAGE_KEY),null);
 setLanguage('ar');assert.equal(document.documentElement.dir,'rtl');assert.equal(document.querySelector('#language').value,'ar');assert.equal(localStorage.getItem(LANGUAGE_KEY),'ar');assert.equal(document.querySelector('#reset-filters').textContent,'مسح الفلاتر');
 setLanguage('en');assert.equal(document.documentElement.dir,'ltr');assert.equal(document.querySelector('#search').placeholder,'Search by title or creator');
 setLanguage('auto');assert.equal(document.documentElement.lang,'fr-FR');assert.equal(localStorage.getItem(LANGUAGE_KEY),null);assert.equal(document.querySelector('#nav-categories').textContent,'◎ Catégories');
});

test('busca encontra traduções, categorias e frases combinadas sem depender do idioma da interface',()=>{
 const db=new CatalogDatabase(':memory:');db.syncSources([{id:'one',name:'Demo',url:'https://source.example',adapter:'xvideos'}]);
 const amateur=db.addCategory('one',{name:'Amateur',url:'https://source.example/c/Amateur-1'}),french=db.addCategory('one',{name:'French',url:'https://source.example/c/French-2'}),british=db.addCategory('one',{name:'British',url:'https://source.example/c/British-3'});
 const add=(id,title,author)=>db.upsertVideo('one',{externalId:id,sourceUrl:'https://source.example/video.'+id+'/demo',title,author},amateur);
 add('demo1','Título original preservado','UniqueCreator');db.upsertVideo('one',{externalId:'demo1',sourceUrl:'https://source.example/video.demo1/demo',title:'Título original preservado',author:'UniqueCreator'},french);add('demo2','Outro título original','OtherCreator');db.db.prepare('INSERT INTO video_categories(video_id,category_key) VALUES(?,?)').run('one:demo2',british);
 for(const query of ['amateur French','amadores franceses','vídeos amadores franceses','amateurs français','vidéos amateurs français','amateur franzosisch','アマチュア フランス人','业余 法国人','业余法国人','هواة فرنسي','शौकिया फ़्रांसीसी','아마추어 프랑스']){assert.deepEqual(db.query({q:query}).videos.map(v=>v.id),['one:demo1'],query)}
 assert.equal(db.query({q:'UniqueCreator'}).total,1);assert.equal(db.query({q:'amateur OtherCreator'}).videos[0].id,'one:demo2');assert.equal(db.query({q:'original',category:french,provider:'one'}).total,1);assert.equal(db.query({q:'inexistente'}).total,0);assert.equal(db.query({q:'" OR DROP TABLE videos; --'}).total,0);assert.equal(db.query().total,2);
 assert.equal(matchesCategory('Amateur','amadores'),true);assert.equal(matchesCategory('French','franceses'),true);assert.equal(matchesCategory('Amateur','inexistente'),false);assert.equal(searchGroups('NomeSemTradução')[0][0],'nomesemtraducao');db.close();
});


test('pacotes preservam parâmetros e oferecem menus e contadores para todos os idiomas declarados',()=>{
 for(const language of Object.keys(languages)){
  const pack=messages[language];assert.ok(pack,language);
  for(const key of ['Todos os vídeos','Categorias','Mais recentes','Buscar vídeos','Limpar filtros','Página {page} de {pages}','{count} categorias'])assert.ok(pack[key],language+': '+key);
  for(const [source,value] of Object.entries(pack))assert.deepEqual([...(source.match(/\{\w+\}/g)||[])].sort(),[...(value.match(/\{\w+\}/g)||[])].sort(),language+': '+source);
 }
});

test('associações recentes de categorias não deslocam uma busca multilíngue que já está paginada',()=>{
 const db=new CatalogDatabase(':memory:');db.syncSources([{id:'one',name:'Demo',url:'https://source.example',adapter:'xvideos'}]);const key=db.addCategory('one',{name:'Amateur',url:'https://source.example/c/Amateur-1'});
 for(let i=0;i<3;i++)db.upsertVideo('one',{externalId:'demo'+i,sourceUrl:'https://source.example/video.demo'+i+'/demo',title:'Título original',author:'Canal'},i?key:null);
 const first=db.query({q:'amadores',pageSize:1});assert.equal(first.total,2);db.db.prepare('INSERT INTO video_categories(video_id,category_key) VALUES(?,?)').run('one:demo0',key);
 assert.equal(db.query({q:'amateurs'}).total,3);assert.equal(db.query({q:'amadores',snapshot:first.snapshot}).total,2);assert.equal(db.query({q:'amadores',pageSize:1,page:2,snapshot:first.snapshot}).videos[0].id,'one:demo1');db.close();
});
