export const categories=['Jiu-jítsu','Judô','Boxe','Muay Thai','MMA','Karate','Tendências'];
export function parseSource(value){
 let u;try{u=new URL(value)}catch{throw new Error('Informe um endereço completo, começando com http:// ou https://.')}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Use um link HTTP ou HTTPS sem usuário ou senha na URL.');
 if(u.href.length>8192)throw new Error('O link excede o limite de 8.192 caracteres.');
 const host=u.hostname.toLowerCase().replace(/^www\./,'');let id;
 if(['youtube.com','m.youtube.com','youtu.be'].includes(host)&&!u.port){
  id=host==='youtu.be'?u.pathname.slice(1).split('/')[0]:u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/)?.[1];
  if(/^[\w-]{11}$/.test(id||''))return {provider:'YouTube',externalId:id,sourceUrl:`https://www.youtube.com/watch?v=${id}`,embedUrl:`https://www.youtube-nocookie.com/embed/${id}?autoplay=0`,embedType:'official'};
 }
 if(['vimeo.com','player.vimeo.com'].includes(host)&&!u.port&&/^\/(?:video\/)?[1-9]\d{0,11}(?:\/[\da-f]+)?\/?$/.test(u.pathname)){
  const parts=u.pathname.split('/').filter(Boolean).filter(p=>p!=='video');id=parts[0];const hash=u.searchParams.get('h')||parts[1];return {provider:'Vimeo',externalId:id,sourceUrl:u.href,embedUrl:`https://player.vimeo.com/video/${id}?dnt=1${hash?'&h='+encodeURIComponent(hash):''}`,embedType:'official'};
 }
 const sourceUrl=u.href;
 // Keep the existing source/provider identity so saved records and favorites
 // remain valid; only the playback address changes for this provider.
 if(['xvideos.com','m.xvideos.com'].includes(host)&&!u.port){
  const match=u.pathname.match(/^\/(?:video\.([a-z0-9]{4,64})|video(\d{1,20})|embedframe\/([a-z0-9_-]{1,64}))(?:\/|$)/i);
  if(match){id=match[1]||match[2]||match[3];return {provider:'Outras fontes',externalId:sourceUrl,sourceUrl,sourceHost:u.hostname,embedUrl:`https://www.xvideos.com/embedframe/${id}`,embedType:'official',playbackProvider:'XVideos'};}
 }
 const direct=/\.(mp4|webm|ogv|m4v|mov|m3u8)$/i.test(u.pathname);
 return {provider:'Outras fontes',externalId:sourceUrl,sourceUrl,embedUrl:direct&&u.protocol==='https:'?sourceUrl:null,embedType:direct?(/\.m3u8$/i.test(u.pathname)?'hls':'video'):'link',sourceHost:u.hostname};
}
export function normalizeRecord(raw){
 if(!raw||typeof raw!=='object')throw new Error('Registro inválido.');
 const src=parseSource(raw.sourceUrl);
 const playbackUrl=String(raw.playbackUrl||'').trim();
 if(playbackUrl){const playback=parseSource(playbackUrl);src.embedUrl=playback.embedUrl;src.embedType=playback.embedType;src.playbackProvider=playback.provider;}

 const title=String(raw.title||'').trim(),author=String(raw.author||'').trim();
 if(!title||title.length>160||!author||author.length>100)throw new Error('Preencha título (até 160 caracteres) e autor (até 100).');
 if(!categories.includes(raw.category))throw new Error('Modalidade inválida.');
 if(!['Iniciante','Intermediário','Avançado','Todos'].includes(raw.level))throw new Error('Nível inválido.');
 if(raw.permissionConfirmed!==true)throw new Error('Confirme a permissão para o uso informado.');
 const note=String(raw.permissionNote||'').trim();if(note.length<10||note.length>1000)throw new Error('Descreva a base da permissão (10 a 1.000 caracteres).');
 const checkedAt=String(raw.checkedAt||'');const checkDate=new Date(checkedAt);if(!Number.isFinite(checkDate.getTime())||checkDate.getTime()>Date.now()+60000)throw new Error('Data de revisão inválida.');
 return {...src,playbackUrl,id:`${src.provider}:${src.externalId}`,title,author,category:raw.category,level:raw.level,description:String(raw.description||'').slice(0,2000),permissionConfirmed:true,permissionNote:note,checkedAt:checkDate.toISOString()};
}
export function parseCatalog(text){
 const parsed=JSON.parse(text);if(!Array.isArray(parsed)||parsed.length>1000)throw new Error('Importe um array JSON com até 1.000 registros.');
 const result=parsed.map(normalizeRecord);if(new Set(result.map(v=>v.id)).size!==result.length)throw new Error('O arquivo contém vídeos duplicados.');return result;
}
export function needsReview(v){return Date.now()-new Date(v.checkedAt).getTime()>30*86400000;}
