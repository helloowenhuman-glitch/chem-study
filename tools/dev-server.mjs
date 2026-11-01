import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { handleApi } from '../server/api.js';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const port=Number(process.env.PORT || 5173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(url.pathname.startsWith('/api/')) {
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>12000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
      const method=req.method;
      const request=new Request(url,{method,headers:req.headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
      const response=await handleApi(request);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end();return;}
    const content=await readFile(path);
    res.writeHead(200,{'Content-Type':types[extname(path)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:content);
  } catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('요청을 처리하지 못했습니다.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`화학노트 http://127.0.0.1:${port}`));
