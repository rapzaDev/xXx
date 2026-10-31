let hlsLibrary;
function loadHls(){
 if(window.Hls)return Promise.resolve(window.Hls);
 if(!hlsLibrary)hlsLibrary=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/hls.light.min.js';script.onload=()=>resolve(window.Hls);script.onerror=()=>{script.remove();hlsLibrary=null;reject(new Error('Não foi possível carregar o player de streaming.'))};document.head.append(script)});
 return hlsLibrary;
}
export function openPlayback(record,box,status){
 const controller=new AbortController();let dispose=()=>{},attempt=0;
 const options=document.createElement('div');options.className='playback-options';options.hidden=true;options.setAttribute('role','group');options.setAttribute('aria-label','Opções de reprodução');box.after(options);
 function showOptions(candidates,index){
  options.hidden=candidates.length<2;
  options.replaceChildren(...candidates.map((candidate,i)=>{const button=document.createElement('button');button.type='button';button.className='button outline';button.textContent=`Player ${i+1}`;button.setAttribute('aria-pressed',String(i===index));button.onclick=()=>play(candidates,i);return button}));
 }
 function clear(){attempt++;dispose();dispose=()=>{}}
 function message(text){const p=document.createElement('p');p.textContent=text;p.setAttribute('role','status');box.replaceChildren(p)}
 function fail(text){if(controller.signal.aborted)return;clear();message(text);const retry=document.createElement('button');retry.className='button lime';retry.textContent='Tentar novamente';retry.onclick=resolve;const wrapper=document.createElement('div');wrapper.append(...box.childNodes,retry);box.replaceChildren(wrapper);status.hidden=false;status.textContent='Você também pode usar Abrir na fonte ou informar outro endereço em Configurar reprodução.'}
 async function play(candidates,index=0){
  if(controller.signal.aborted)return;
  clear();const run=attempt,candidate=candidates[index];if(!candidate){fail('Nenhuma das opções de vídeo fornecidas pela origem pôde ser reproduzida. O link pode ter expirado ou a origem pode bloquear reprodução externa.');return}
  showOptions(candidates,index);
  let u;try{u=new URL(candidate.url);if(u.protocol!=='https:'||u.username||u.password)throw new Error()}catch{play(candidates,index+1);return}
  const next=()=>{if(!controller.signal.aborted&&run===attempt)play(candidates,index+1)};
  status.hidden=false;
  if(['official','embed'].includes(candidate.type)){
   const frame=document.createElement('iframe');frame.title=record.title;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');frame.onerror=next;frame.src=u.href;dispose=()=>{frame.onerror=null;frame.remove()};box.replaceChildren(frame);status.textContent='Player da origem. Se o site bloquear a incorporação ou pedir login, use Abrir na fonte.';return;
  }
  const video=document.createElement('video');video.controls=true;video.autoplay=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label',record.title);let hls;
  dispose=()=>{video.onerror=null;hls?.destroy();video.pause();video.removeAttribute('src');video.load();video.remove()};box.replaceChildren(video);video.onerror=next;
  status.textContent='Use os controles do vídeo para assistir. Se a origem bloquear a reprodução, abra na fonte.';
  const start=()=>video.play().catch(()=>{if(!controller.signal.aborted&&run===attempt)status.textContent='Pressione ▶ nos controles do vídeo para iniciar a reprodução.'});
  if(candidate.type==='hls'&&!video.canPlayType('application/vnd.apple.mpegurl')){
   try{const Hls=await loadHls();if(controller.signal.aborted||run!==attempt)return;if(!Hls.isSupported()){next();return}hls=new Hls({enableWorker:false});hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)next()});hls.on(Hls.Events.MANIFEST_PARSED,start);hls.loadSource(u.href);hls.attachMedia(video)}catch{next()}
  }else{video.src=u.href;start()}
 }
 async function resolve(){
  if(controller.signal.aborted)return;clear();options.hidden=true;status.hidden=true;message('Identificando o vídeo e preparando a reprodução…');
  const target=record.playbackUrl||record.sourceUrl;
  if(record.embedUrl&&['official','video','hls'].includes(record.embedType)){await play([{url:record.embedUrl,type:record.embedType}]);return}
  try{const response=await fetch('/api/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:target}),signal:controller.signal});if(controller.signal.aborted)return;const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível identificar o vídeo.');if(!Array.isArray(result.candidates))throw new Error('Resposta de reprodução inválida.');await play(result.candidates)}catch(error){if(!controller.signal.aborted)fail(error instanceof SyntaxError?'O serviço de reprodução está indisponível. Tente novamente.':error.message)}
 }
 resolve();return ()=>{controller.abort();clear();options.remove();box.replaceChildren();status.hidden=true};
}
