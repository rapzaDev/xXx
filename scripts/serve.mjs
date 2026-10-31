import {createServer} from 'node:http';
import worker from '../dist/server/index.js';
createServer(async(req,res)=>{try{const request=new Request(`http://localhost:4173${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const response=await worker.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500);res.end('Server error')}}).listen(4173,()=>console.log('Local: http://localhost:4173'));
