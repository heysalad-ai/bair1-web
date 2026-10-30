import fs from 'node:fs';
import {createRequire} from 'node:module';
const requireTools=createRequire(process.env.BAIR1_AWS_TOOLS+'/package.json');
const {IAMClient,SimulatePrincipalPolicyCommand}=requireTools('@aws-sdk/client-iam');
const {STSClient,GetCallerIdentityCommand}=requireTools('@aws-sdk/client-sts');
const a=JSON.parse(fs.readFileSync(process.env.BAIR1_ADMIN_CREDENTIALS,'utf8')),s=JSON.parse(fs.readFileSync('/tmp/bair1-stage-runtime.json','utf8'));
const options={region:s.region,credentials:{accessKeyId:a.AccessKeyId,secretAccessKey:a.SecretAccessKey,...(a.SessionToken?{sessionToken:a.SessionToken}:{})}};
(async()=>{const identity=await new STSClient(options).send(new GetCallerIdentityCommand({})),iam=new IAMClient(options),results=[];
 for(const table of ['bair1-readings',s.prefix+'readings']){
 const r=await iam.send(new SimulatePrincipalPolicyCommand({PolicySourceArn:`arn:aws:iam::${identity.Account}:user/${s.userName}`,ActionNames:['dynamodb:PutItem','dynamodb:GetItem'],ResourceArns:[`arn:aws:dynamodb:${s.region}:${identity.Account}:table/${table}`]}));
 for(const e of r.EvaluationResults){results.push({table,action:e.EvalActionName,decision:e.EvalDecision});if(e.EvalDecision!==(table.startsWith(s.prefix)?'allowed':'implicitDeny'))throw Error('Unexpected policy decision');}
 }
 console.log(JSON.stringify(results,null,2));const path='docs/evidence/staging-infrastructure.json',doc=JSON.parse(fs.readFileSync(path,'utf8'));doc.decisions=results;fs.writeFileSync(path,JSON.stringify(doc,null,2));
})().catch(e=>{console.error(e.name);process.exit(1)});
