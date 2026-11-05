import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createLoader} from './helpers/load-ts.mjs';
const load=createLoader({'./factory-release.json':{default:JSON.parse(readFileSync('src/lib/factory-release.json','utf8'))}});
const protocol=load('src/lib/factory-usb-protocol.ts'),{FactoryUsb}=load('src/lib/factory-usb.ts');
const board=()=>({deviceId:`XIAO-${randomBytes(6).toString('hex').toUpperCase()}`,bootSession:randomBytes(16).toString('hex').toUpperCase(),firmwareVersion:protocol.FACTORY_FIRMWARE_VERSION,protocolVersion:1,chip:'ESP32-S3'});
function serial(handler){
 let controller;const port={readable:new ReadableStream({start(c){controller=c;}}),writable:new WritableStream({write(bytes){handler(JSON.parse(new TextDecoder().decode(bytes)),value=>{const encoded=new TextEncoder().encode(JSON.stringify(value)+'\n');controller.enqueue(encoded.slice(0,7));controller.enqueue(encoded.slice(7));});}}),async open(){},async close(){}};return port;
}
test('chip MAC derivation matches Arduino little-endian uint64 formatting',()=>{
 for(let i=0;i<20;i++){const bytes=randomBytes(6),mac=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join(':');let value=0n;bytes.forEach((n,j)=>{value|=BigInt(n)<<BigInt(8*j);});assert.equal(protocol.deviceIdFromMac(mac),`XIAO-${value.toString(16).padStart(12,'0').toUpperCase()}`);}
 assert.throws(()=>protocol.deviceIdFromMac('not-a-mac'));
});
test('Wi-Fi length checks use bytes, allow open networks, reject malformed settings',()=>{
 protocol.validateWifi('Synthetic factory','');protocol.validateWifi('Synthetic factory','12345678');assert.throws(()=>protocol.validateWifi('x','short'));assert.throws(()=>protocol.validateWifi('x','g'.repeat(64)));assert.throws(()=>protocol.validateWifi('界'.repeat(11),'12345678'));assert.throws(()=>protocol.validateWifi('x\0y','12345678'));
});
test('fragmented USB identity/configuration replies succeed and secrets never enter identity',async()=>{
 const b=board();let configured;
 const connection=new FactoryUsb(serial((command,reply)=>{if(command.bair1==='identify')reply({...b,bair1:'identity',requestId:command.requestId});else{configured=command;reply({...b,bair1:'configured',requestId:command.requestId});}}));await connection.open();
 assert.deepEqual(await connection.identify(),b);
 await connection.configure(b,{ssid:'Synthetic factory',password:'synthetic-password',apiKey:'bair1_'+randomBytes(24).toString('base64url'),factorySessionId:randomUUID()});assert.equal(configured.deviceId,b.deviceId);assert.equal(configured.bootSession,b.bootSession);assert.equal(configured.url,protocol.FACTORY_UPLOAD_URL);await connection.close();
});
test('wrong-board replies, malformed identity, timeouts and disconnects fail closed',async()=>{
 const b=board(),other=board();
 const wrong=new FactoryUsb(serial((c,reply)=>reply({...other,bair1:'configured',requestId:c.requestId})));await wrong.open();await assert.rejects(wrong.configure(b,{ssid:'Synthetic factory',password:'12345678',apiKey:'bair1_'+randomBytes(24).toString('base64url'),factorySessionId:randomUUID()}),/identity changed/);await wrong.close();
 const silent=new FactoryUsb(serial(()=>{}));await silent.open();await assert.rejects(silent.exchange({bair1:'identify',requestId:randomUUID()},15),/No factory reply/);const pending=silent.exchange({bair1:'identify',requestId:randomUUID()},1000);const rejected=assert.rejects(pending,/disconnected/);await silent.close();await rejected;
 assert.equal(protocol.parseIdentity({...b,bair1:'identity',requestId:'a',chip:'ESP32-C3'},'a'),null);
});
test('factory routes require login and bounded JSON before any provisioning',async()=>{
 let calls=0;const auth={requireAuth:async()=>Response.json({error:'Unauthorized'},{status:401})};const route=createLoader({'@/lib/auth':auth,'@/lib/factory-provisioning':{...load('src/lib/factory-provisioning.ts'),enrollFactoryUnit:async()=>{calls++;}}})('src/app/api/factory/units/route.ts');
 assert.equal((await route.GET(new Request('https://synthetic.invalid'))).status,401);assert.equal((await route.POST(new Request('https://synthetic.invalid',{method:'POST',body:'{}'}))).status,401);assert.equal(calls,0);
 const signed=createLoader({'@/lib/auth':{requireAuth:async()=>({user:{}})}})('src/app/api/factory/units/route.ts');assert.equal((await signed.POST(new Request('https://synthetic.invalid',{method:'POST',body:JSON.stringify({padding:'x'.repeat(3000)})}))).status,400);
});
test('receipt handler rejects a configuration change during receipt retrieval',async()=>{
 const value={deviceId:board().deviceId,ownershipVersion:randomUUID(),sessionId:randomUUID(),configuredAt:new Date().toISOString()};let reads=0;
 const route=createLoader({'@/lib/auth':{requireAuth:async()=>({user:{}})},'@/lib/device-access':{withDeviceRead:async(_actor,_id,read)=>read()},'@/lib/dynamo':{getLatestReading:async()=>null},'@/lib/factory-provisioning':{...load('src/lib/factory-provisioning.ts'),factoryUnit:async()=>({...value,sessionId:++reads===1?value.sessionId:randomUUID()})}})('src/app/api/factory/receipt/route.ts');
 const response=await route.GET(new Request('https://synthetic.invalid/api/factory/receipt?deviceId='+value.deviceId));assert.equal(response.status,409);assert.equal(reads,2);
});
test('browser flasher rejects wrong chip, protected flash and corrupted downloads before writing',async()=>{
 const manifest=JSON.parse(readFileSync('src/lib/factory-release.json','utf8'));let chip='ESP32-S3',protectedFlash=false,corrupt=false,writes=0,closed=0;
 const mac=[...randomBytes(6)].map(n=>n.toString(16).padStart(2,'0')).join(':');
 class Transport{async disconnect(){closed++;}}
 class Loader{chip={CHIP_NAME:chip,readMac:async()=>mac};async main(){}async getSecurityInfo(){return {parsedFlags:{SECURE_BOOT_EN:protectedFlash,SECURE_DOWNLOAD_ENABLE:false},flashCryptCnt:0};}async after(){}async writeFlash(options){writes++;assert.equal(options.eraseAll,false);assert.equal(options.fileArray.length,4);for(const file of options.fileArray)assert.equal(options.calculateMD5Hash(file.data),createHash('md5').update(file.data).digest('hex'));}}
 const {installFactoryFirmware}=createLoader({'./factory-release.json':{default:manifest},'esptool-js':{Transport,ESPLoader:Loader},'hash-wasm':{createMD5:async()=>{let hash;return{init(){hash=createHash('md5');return this;},update(data){hash.update(data);return this;},digest(){return hash.digest('hex');}};}}})('src/lib/factory-usb.ts');
 const savedFetch=globalThis.fetch;
 globalThis.fetch=async path=>{const data=readFileSync('public'+path);if(corrupt)data[0]^=1;return new Response(data);};
 try{
  chip='ESP32-C3';await assert.rejects(installFactoryFirmware({},()=>{}),/Wrong chip/);assert.equal(writes,0);
  chip='ESP32-S3';protectedFlash=true;await assert.rejects(installFactoryFirmware({},()=>{}),/protected flash/);assert.equal(writes,0);
  protectedFlash=false;corrupt=true;await assert.rejects(installFactoryFirmware({},()=>{}),/integrity check failed/);assert.equal(writes,0);
  corrupt=false;assert.equal(await installFactoryFirmware({},()=>{}),protocol.deviceIdFromMac(mac));assert.equal(writes,1);assert.equal(closed,4);
 }finally{globalThis.fetch=savedFetch;}
});
