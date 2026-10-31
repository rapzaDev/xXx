import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openPlayback} from '../public/player.js';

// Small DOM double to exercise player lifecycle without a browser or external media.
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.childNodes=[];this.attributes=new Map();this.hidden=false;this.parentNode=null}
 setAttribute(key,value){this.attributes.set(key,value)}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.childNodes.push(node)}}
 replaceChildren(...nodes){for(const node of [...this.childNodes])node.remove();this.append(...nodes)}
 after(node){node.parentNode=this.parentNode;this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this)+1,0,node)}
 remove(){if(this.parentNode){this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this),1);this.parentNode=null}}
}
function setup(t,fetcher){
 const originalDocument=globalThis.document,originalFetch=globalThis.fetch;
 globalThis.document={createElement:tag=>new Element(tag)};globalThis.fetch=fetcher;
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
