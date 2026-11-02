import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
// Boot the real production build with isolated names and dummy local credentials.
// No real identity, provider, key, customer record or physical device is supplied.
const port=18745, base=`http://127.0.0.1:${port}`;
const reservation=createServer();
await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(port,'127.0.0.1',resolve);});
await new Promise(resolve=>reservation.close(resolve));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{
 env:{...process.env,BAIR1_TABLE_PREFIX:'bair1-staging-runtime-review-',AWS_ACCESS_KEY_ID:'localtest',AWS_SECRET_ACCESS_KEY:'localtest',AWS_SESSION_TOKEN:'',BAIR1_ACCESS_ENABLED:'false',BAIR1_PAID_FEATURES_ENABLED:'false',ADMIN_BOOTSTRAP_SECRET:'',ADMIN_BOOTSTRAP_SUB:'',SENSOR_API_KEY:'',NOTEHUB_ROUTE_SECRET:'',OPENAI_API_KEY:'',GOOGLE_MAPS_API_KEY:'',ELEVENLABS_API_KEY:''},stdio:'ignore',
});
try{
 let ready=false;
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw new Error('Production test server exited before readiness');
  try{const response=await fetch(base+'/api/workspaces',{signal:AbortSignal.timeout(1000)});await response.body?.cancel();if(response.status===401){ready=true;break;}}catch{}
  await delay(100);
 }
 assert.ok(ready,'Production server failed to become ready');
 const cases=[['POST','/api/chat',401],['GET','/api/voice/briefing',401],['GET','/api/environment',401],['POST','/api/graphql',401],['GET','/api/workspaces',401],['GET','/api/developer/api-keys',401],['GET','/api/devices/synthetic/export',401],['GET','/api/v1/devices/synthetic/state',401],['POST','/api/v1/devices/synthetic/commands',401],['POST','/api/admin/bootstrap',503],['GET','/api/public/insight/kitchen',405],['POST','/api/public/insight/nonexistent',404],['GET','/share/synthetic',404]];
 for(const [method,path,status]of cases){
  const response=await fetch(base+path,{method,signal:AbortSignal.timeout(5000),...(method==='POST'?{body:'{}',headers:{'Content-Type':'application/json'}}:{})});
  assert.equal(response.status,status,path);
  if(path.startsWith('/share/')){assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.match(response.headers.get('x-robots-tag'),/noindex/);}
  await response.body?.cancel();
 }
 console.log(`${cases.length} production-build HTTP authorization, configuration and sharing-header checks passed`);
}finally{
 server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(3000)]);if(server.exitCode===null)server.kill('SIGKILL');
}
