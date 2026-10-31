import {resolve} from 'node:path';
import {CatalogDatabase} from '../local/database.mjs';
import {Collector} from '../local/collector.mjs';
import {projectRoot,loadConfig} from '../local/config.mjs';
import {setTimeout as delay} from 'node:timers/promises';
const db=new CatalogDatabase(resolve(projectRoot,'.data/catalog.sqlite')),collector=new Collector(db);
const controller=new AbortController();
for(const name of ['SIGINT','SIGTERM'])process.on(name,()=>{collector.stop();controller.abort()});
try{do{const result=await collector.run();console.log(JSON.stringify({...result,totals:db.status().totals}));if(!process.argv.includes('--watch')||controller.signal.aborted)break;console.log('Aguardando a próxima coleta.');await delay(loadConfig().collection.intervalHours*3600000,undefined,{signal:controller.signal})}while(!controller.signal.aborted)}catch(error){if(!controller.signal.aborted){console.error(error.message);process.exitCode=1}}finally{db.close()}
