import {createLocalServer} from '../local/server.mjs';
import worker from '../dist/server/index.js';
const {server,db,collector}=createLocalServer({worker});
const port=Number(process.env.PORT||4173);
server.listen(port,'127.0.0.1',()=>{console.log(`Local: http://localhost:${port}`);console.log('Catálogo SQLite: .data/catalog.sqlite · Coleta automática a cada 6 horas.');if(process.env.DOJO_AUTO_COLLECT!=='0')collector.schedule()});
let closing=false;
async function close(){if(closing)return;closing=true;collector.stop();for(let i=0;i<100&&collector.running;i++)await new Promise(resolve=>setTimeout(resolve,50));server.close(()=>{db.close();process.exit(0)});server.closeAllConnections()}
process.on('SIGINT',close);process.on('SIGTERM',close);
