import {resolveMedia} from './resolver.js';
const assets=__SITE_ASSETS__;
export default {async fetch(request){
 const url=new URL(request.url);
 if(url.pathname==='/api/resolve'){
  if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return new Response('Forbidden',{status:403});
  if(!request.headers.get('content-type')?.includes('application/json'))return new Response('JSON required',{status:415});
  try{const text=await request.text();if(text.length>10000)return Response.json({error:'Link muito longo.'},{status:413});const {url:source}=JSON.parse(text);if(typeof source!=='string')throw new Error('Informe o link do vídeo.');return Response.json(await resolveMedia(source),{headers:{'Cache-Control':'no-store'}})}catch(error){return Response.json({error:error.name==='TimeoutError'?'A origem demorou para responder. Tente novamente ou abra na fonte.':error.message},{status:422,headers:{'Cache-Control':'no-store'}})}
 }
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const asset=assets[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Not found',{status:404});
 return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
}};
