// Staging-only provisioning; credentials supplied by a protected local file, never committed.
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {DynamoDBClient,CreateTableCommand,DescribeTableCommand,ListTagsOfResourceCommand,UpdateTimeToLiveCommand,DescribeTimeToLiveCommand,UpdateContinuousBackupsCommand,waitUntilTableExists} from '@aws-sdk/client-dynamodb';
const require=createRequire(process.env.BAIR1_AWS_TOOLS+'/package.json');
const {IAMClient,CreateUserCommand,PutUserPolicyCommand,CreateAccessKeyCommand,SimulatePrincipalPolicyCommand}=require('@aws-sdk/client-iam');
const {STSClient,GetCallerIdentityCommand}=require('@aws-sdk/client-sts');
const source=JSON.parse(readFileSync(process.env.BAIR1_ADMIN_CREDENTIALS,'utf8'));
const region='eu-west-2',prefix='bair1-staging-20261030-',userName='bair1-staging-ingestion-20261030';
const options={region,credentials:{accessKeyId:source.AccessKeyId,secretAccessKey:source.SecretAccessKey,...(source.SessionToken?{sessionToken:source.SessionToken}:{})}};
const identity=await new STSClient(options).send(new GetCallerIdentityCommand({}));
const db=new DynamoDBClient(options),iam=new IAMClient(options);
const tables=[['readings','deviceId','timestamp'],['reading-events','deviceId','eventId'],['devices','deviceId'],['api-keys','id'],['commands','deviceId','commandId'],['users','userId']];
for(const [suffix,pk,sk] of tables){
 const TableName=prefix+suffix;
 let exists=false;try{await db.send(new DescribeTableCommand({TableName}));exists=true;}catch(e){if(e.name!=='ResourceNotFoundException')throw e;}
 if(exists){const table=(await db.send(new DescribeTableCommand({TableName}))).Table;const tags=(await db.send(new ListTagsOfResourceCommand({ResourceArn:table.TableArn}))).Tags; if(!tags.some(t=>t.Key==='Purpose'&&t.Value==='bair1-two-second-staging'))throw new Error('Refusing to adopt an unrelated table');}
 const input={TableName,BillingMode:'PAY_PER_REQUEST',KeySchema:[{AttributeName:pk,KeyType:'HASH'},...(sk?[{AttributeName:sk,KeyType:'RANGE'}]:[])],AttributeDefinitions:[{AttributeName:pk,AttributeType:'S'},...(sk?[{AttributeName:sk,AttributeType:'S'}]:[])],Tags:[{Key:'Purpose',Value:'bair1-two-second-staging'},{Key:'Environment',Value:'staging'}]};
 if(suffix==='api-keys'){input.AttributeDefinitions.push({AttributeName:'keyHash',AttributeType:'S'});input.GlobalSecondaryIndexes=[{IndexName:'keyHash-index',KeySchema:[{AttributeName:'keyHash',KeyType:'HASH'}],Projection:{ProjectionType:'ALL'}}];}
 if(!exists)await db.send(new CreateTableCommand(input));await waitUntilTableExists({client:db,maxWaitTime:60,minDelay:1,maxDelay:3},{TableName});
 if(['readings','reading-events','commands'].includes(suffix)){const ttl=(await db.send(new DescribeTimeToLiveCommand({TableName}))).TimeToLiveDescription;if(!['ENABLED','ENABLING'].includes(ttl.TimeToLiveStatus))await db.send(new UpdateTimeToLiveCommand({TableName,TimeToLiveSpecification:{AttributeName:'expiresAt',Enabled:true}}));}
 if(['readings','reading-events'].includes(suffix)){for(let attempt=0;;attempt++){try{await db.send(new UpdateContinuousBackupsCommand({TableName,PointInTimeRecoverySpecification:{PointInTimeRecoveryEnabled:true}}));break;}catch(e){if(e.name!=='ContinuousBackupsUnavailableException'||attempt>=12)throw e;await new Promise(r=>setTimeout(r,5000));}}}
 console.log('Created isolated table:',TableName);
}
await iam.send(new CreateUserCommand({UserName:userName,Tags:[{Key:'Environment',Value:'staging'}]}));
const resources=tables.flatMap(([suffix])=>{const arn=`arn:aws:dynamodb:${region}:${identity.Account}:table/${prefix}${suffix}`;return [arn,arn+'/index/*'];});
const policy={Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem','dynamodb:DeleteItem','dynamodb:Query','dynamodb:Scan','dynamodb:ConditionCheckItem'],Resource:resources}]};
await iam.send(new PutUserPolicyCommand({UserName:userName,PolicyName:'isolated-staging-tables',PolicyDocument:JSON.stringify(policy)}));
const key=(await iam.send(new CreateAccessKeyCommand({UserName:userName}))).AccessKey;
writeFileSync('/tmp/bair1-stage-runtime.json',JSON.stringify({region,prefix,userName,accessKeyId:key.AccessKeyId,secretAccessKey:key.SecretAccessKey}),{mode:0o600});
const simulation=await iam.send(new SimulatePrincipalPolicyCommand({PolicySourceArn:`arn:aws:iam::${identity.Account}:user/${userName}`,ActionNames:['dynamodb:PutItem','dynamodb:GetItem'],ResourceArns:[`arn:aws:dynamodb:${region}:${identity.Account}:table/bair1-readings`,`arn:aws:dynamodb:${region}:${identity.Account}:table/${prefix}readings`]}));
const decisions=simulation.EvaluationResults.map(r=>({action:r.EvalActionName,table:r.EvalResourceName.split('/').at(-1),decision:r.EvalDecision}));
console.log('Runtime policy simulation:',decisions);
const ttl=[];for(const suffix of ['readings','reading-events'])ttl.push({table:prefix+suffix,...(await db.send(new DescribeTimeToLiveCommand({TableName:prefix+suffix}))).TimeToLiveDescription});
writeFileSync('docs/evidence/staging-infrastructure.json',JSON.stringify({region,prefix,tables:tables.map(([s])=>prefix+s),decisions,ttl},null,2));
