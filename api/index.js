import { handleApi } from '../server/api.js';

export default async function handler(req, res) {
  const headers = new Headers();
  for (const [key,value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key,Array.isArray(value)?value.join(', '):value);
  const body = ['GET','HEAD'].includes(req.method) ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const response = await handleApi(new Request('https://app.local' + req.url,{method:req.method,headers,body}));
  res.statusCode = response.status;
  response.headers.forEach((value,key)=>res.setHeader(key,value));
  res.end(await response.text());
}
