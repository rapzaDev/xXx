import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openPlayback} from '../public/player.js';

// Small DOM double to exercise player lifecycle without a browser or external media.
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.childNodes=[];this.attributes=new Map();this.hidden=false;this.parentNode=null}
 setAttribute(key,value){this.attributes.set(key,value)}
 removeAttribute(key){this.attributes.delete(key);if(key==='src')delete this.src}
 pause(){this.paused=true}
 load(){}
 play(){this.paused=false;return Promise.resolve()}
 canPlayType(){return 'probably'}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.childNodes.push(node)}}
 replaceChildren(...nodes){for(const node of [...this.childNodes])node.remove();this.append(...nodes)}
 after(node){node.parentNode=this.parentNode;this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this)+1,0,node)}
 remove(){if(this.parentNode){this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),1);this.parentNode=null}}
}
function setup(t,fetcher){
 const originalDocument=globalThis.document,originalFetch=globalThis.fetch;
 globalThis.document={baseURI:'http://localhost:4173/',createElement:tag=>new Element(tag)};globalThis.fetch=fetcher;
 t.after(()=>{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;globalThis.fetch=originalFetch});
 const root=new Element('div'),box=new Element('div'),status=new Element('p');root.append(box,status);return {root,box,status};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('monta o iframe identificado, permite alternar e limpa o player ao fechar',async t=>{
 const candidates=[{url:'https://media.example/?id=42&e=token',type:'embed'},{url:'https://catalog.example/embedx/42/?e=token',type:'embed'}];
 const {root,box,status}=setup(t,async()=>Response.json({candidates}));
 const close=openPlayback({sourceUrl:'https://catalog.example/watch/42',title:'Vídeo de teste'},box,status);await settle();
 assert.equal(box.childNodes[0].tagName,'IFRAME');assert.equal(box.childNodes[0].src,candidates[0].url);
 const options=root.childNodes[1],firstFrame=box.childNodes[0];assert.equal(options.hidden,false);assert.equal(options.childNodes.length,2);assert.equal(options.childNodes[0].attributes.get('aria-pressed'),'true');
 await options.childNodes[1].onclick();assert.equal(box.childNodes[0].src,candidates[1].url);assert.equal(firstFrame.parentNode,null);assert.equal(options.childNodes[1].attributes.get('aria-pressed'),'true');
 close();assert.equal(box.childNodes.length,0);assert.equal(options.parentNode,null);assert.equal(status.hidden,true);
});
test('fechar a ficha cancela a consulta e impede que uma resposta atrasada reabra o player',async t=>{
 let finish,signal;
 const {root,box,status}=setup(t,(_,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve})});
 const close=openPlayback({sourceUrl:'https://catalog.example/watch/42'},box,status);close();assert.equal(signal.aborted,true);
 finish(Response.json({candidates:[{url:'https://media.example/?id=42',type:'embed'}]}));await settle();
 assert.equal(box.childNodes.length,0);assert.equal(root.childNodes.length,2);
});

test('link direto do XVideos monta o player sem passar pelo resolvedor que retornava 422',async t=>{
 const {parseSource}=await import('../public/catalog.js');let calls=0;
 const {box,status}=setup(t,async()=>{calls++;throw new Error('Resolvedor indisponível')});
 const close=openPlayback({...parseSource('https://www.xvideos.com/video.hpttbt0d66/video'),title:'Teste técnico'},box,status);
 await settle();assert.equal(calls,0);assert.equal(box.childNodes[0].tagName,'IFRAME');assert.equal(box.childNodes[0].src,'https://www.xvideos.com/embedframe/hpttbt0d66');close();
});

test('xHamster resolve mídia e monta vídeo nativo sem iframe ou navegação externa',async t=>{
 const {parseSource}=await import('../public/catalog.js');let calls=0;
 const path='/api/playback/'+'a'.repeat(32);
 const {box,status}=setup(t,async(url,options)=>{calls++;assert.equal(url,'/api/resolve');assert.equal(JSON.parse(options.body).url,'https://xhamster.com/videos/demo-xhAb123');return Response.json({candidates:[{url:path,type:'video',quality:'480p'}]})});
 const close=openPlayback({...parseSource('https://xhamster.com/videos/demo-xhAb123'),title:'Teste técnico'},box,status);await settle();
 const video=box.childNodes[0];assert.equal(video.tagName,'VIDEO');assert.equal(video.src,'http://localhost:4173'+path);assert.equal(video.controls,true);assert.equal(calls,1);assert.equal(box.childNodes.some(node=>node.tagName==='IFRAME'),false);close();assert.equal(video.paused,true);
});
test('qualquer iframe continua sem permissão para navegar o topo ou abrir janelas',async t=>{
 const {box,status}=setup(t,async()=>Response.json({candidates:[{url:'https://xhamster.com/embed/xhAb123',type:'official'}]}));
 const close=openPlayback({sourceUrl:'https://catalog.example/watch/42',title:'Teste técnico'},box,status);await settle();
 const sandbox=box.childNodes[0].attributes.get('sandbox');assert.equal(sandbox,'allow-scripts allow-same-origin allow-presentation');assert.equal(sandbox.includes('allow-top-navigation'),false);assert.equal(sandbox.includes('allow-popups'),false);close();
});
test('iframes genéricos e domínios parecidos continuam com sandbox',async t=>{
 const {box,status}=setup(t,async()=>Response.json({candidates:[{url:'https://xhamster.com.evil.example/embed/xhAb123',type:'official'}]}));
 const close=openPlayback({sourceUrl:'https://catalog.example/watch/42',title:'Teste técnico'},box,status);await settle();assert.equal(box.childNodes[0].attributes.get('sandbox'),'allow-scripts allow-same-origin allow-presentation');close();
});
