import {test} from 'node:test';import assert from 'node:assert/strict';import {parseSource,normalizeRecord,parseCatalog,needsReview} from '../public/catalog.js';
const base={sourceUrl:'https://youtu.be/M7lc1UVf-VE',title:'Exemplo técnico',author:'Canal de teste',category:'Judô',level:'Todos',permissionConfirmed:true,permissionNote:'Player oficial verificado para teste.',checkedAt:new Date().toISOString()};
test('mantém players oficiais para links individuais reconhecidos',()=>{for(const u of ['https://youtu.be/M7lc1UVf-VE?utm_source=x','https://www.youtube.com/watch?v=M7lc1UVf-VE&list=a','https://youtube.com/shorts/M7lc1UVf-VE'])assert.equal(parseSource(u).embedType,'official');assert.equal(parseSource('https://vimeo.com/12345').externalId,'12345')});
test('aceita qualquer domínio HTTP/HTTPS, playlists e links privados como páginas',()=>{for(const u of ['https://example.com/watch/123?x=1#player','http://example.org/a','https://youtube.com/playlist?list=a','https://example.org:8443/video']){const v=parseSource(u);assert.equal(v.embedType,'link');assert.equal(v.embedUrl,null);assert.equal(v.sourceUrl,u)}assert.equal(parseSource('http://example.org/a').embedUrl,null)});
test('classifica arquivos diretos sem perder parâmetros assinados',()=>{const v=parseSource('https://example.com/lesson.MP4?token=123');assert.equal(v.embedType,'video');assert.equal(v.embedUrl,'https://example.com/lesson.MP4?token=123');assert.equal(parseSource('https://example.com/watch?file=x.mp4').embedType,'link')});
test('não aceita esquemas executáveis nem credenciais e não confunde domínios',()=>{for(const u of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd','https://user:pass@example.com/a'])assert.throws(()=>parseSource(u));const fake=parseSource('https://youtube.com.evil.example/watch?v=M7lc1UVf-VE');assert.equal(fake.embedType,'link');assert.equal(fake.provider,'Outras fontes')});
test('valida registros e reconstrói embed sem confiar em JSON importado',()=>{for(const delta of [{permissionConfirmed:false},{permissionNote:''},{author:''},{category:'Outra'},{checkedAt:'amanhã'},{checkedAt:'2099-01-01'}])assert.throws(()=>normalizeRecord({...base,...delta}));assert.throws(()=>parseCatalog(JSON.stringify([base,base])));assert.throws(()=>parseCatalog('{}'));const v=parseCatalog(JSON.stringify([{...base,embedUrl:'javascript:evil()',embedType:'video'}]))[0];assert.equal(v.embedType,'official');assert.ok(v.embedUrl.startsWith('https://www.youtube-nocookie.com/'))});
test('links de páginas podem ser importados e exigem revisão periódica',()=>{const v=normalizeRecord({...base,sourceUrl:'https://example.org/lesson'});assert.equal(v.id,'Outras fontes:https://example.org/lesson');assert.equal(needsReview({...v,checkedAt:'2020-01-01'}),true);assert.equal(needsReview(v),false)});

test('não coloca uma página inteira dentro do player, inclusive em registros antigos',()=>{const v=normalizeRecord({...base,sourceUrl:'https://example.com/page',embedType:'page',embedUrl:'https://example.com/page'});assert.equal(v.embedUrl,null);assert.equal(v.embedType,'link')});
test('separa fonte de endereço de reprodução sem alterar o identificador do registro',()=>{const sourceUrl='https://example.org/lesson';const original=normalizeRecord({...base,sourceUrl});const v=normalizeRecord({...base,sourceUrl,playbackUrl:'https://cdn.example.org/lesson.mp4?token=1'});assert.equal(v.id,original.id);assert.equal(v.embedType,'video');assert.equal(v.sourceUrl,sourceUrl);assert.equal(v.embedUrl,'https://cdn.example.org/lesson.mp4?token=1');assert.equal(normalizeRecord({...base,sourceUrl,playbackUrl:'https://example.com/page'}).embedType,'link');assert.throws(()=>normalizeRecord({...base,sourceUrl,playbackUrl:'javascript:alert(1)'}))});

test('links diretos do XVideos usam o player do provedor em formatos antigos e atuais',()=>{
 for(const [source,id] of [
  ['https://www.xvideos.com/video1441968/video','1441968'],
  ['https://www.xvideos.com/video.hpttbt0d66/video?utm_source=test','hpttbt0d66'],
  ['https://m.xvideos.com/video.hpttbt0d66/video','hpttbt0d66'],
  ['https://www.xvideos.com/embedframe/hpttbt0d66','hpttbt0d66']
 ]){const parsed=parseSource(source);assert.equal(parsed.embedType,'official');assert.equal(parsed.embedUrl,`https://www.xvideos.com/embedframe/${id}`);assert.equal(parsed.sourceUrl,source);assert.equal(parsed.playbackProvider,'XVideos')}
 for(const source of ['https://xvideos.com.evil.example/video.hpttbt0d66/video','https://www.xvideos.com/?search=test','https://www.xvideos.com/video.bad!/other']){
  assert.equal(parseSource(source).embedType,'link');
 }
});
test('registros antigos do XVideos ganham player sem mudar o ID usado nos favoritos',()=>{
 const sourceUrl='https://www.xvideos.com/video.hpttbt0d66/video';
 const record=normalizeRecord({...base,sourceUrl,embedUrl:null,embedType:'link'});
 assert.equal(record.id,`Outras fontes:${sourceUrl}`);assert.equal(record.embedType,'official');
 assert.equal(record.embedUrl,'https://www.xvideos.com/embedframe/hpttbt0d66');
 const override=normalizeRecord({...base,sourceUrl:'https://catalog.example/watch/42',playbackUrl:sourceUrl});assert.equal(override.embedType,'official');
});
