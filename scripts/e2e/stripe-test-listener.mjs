// Stripe TEST transport only. Never reads production env files or registers remote endpoints.
import fs from 'node:fs'
import path from 'node:path'
import {parseEnv} from 'node:util'
import {spawn} from 'node:child_process'
import Stripe from 'stripe'
const directory=path.resolve('.build/e2e-20261014')
const envPath=path.join(directory,'.env.stripe-test.local')
const args=process.argv.slice(2)
if(args.includes('--help')){console.log('Usage: node scripts/e2e/stripe-test-listener.mjs --prepare-secret | --listen. TEST keys only; forwards only to http://127.0.0.1:3200/api/stripe/webhook; secrets stay in ignored600 env.');process.exit(0)}
if(args.length!==1||!['--prepare-secret','--listen'].includes(args[0]))throw Error('CHOOSE_PREPARE_SECRET_OR_LISTEN')
const env=parseEnv(fs.readFileSync(envPath,'utf8')),key=env.STRIPE_SECRET_KEY
if(!key?.startsWith('sk_test_')||env.DIIME_STRIPE_SECRET_KEY!==key)throw Error('MATCHING_TEST_KEYS_REQUIRED')
const stripe=new Stripe(key,{maxNetworkRetries:0,timeout:15000})
if((await stripe.balance.retrieve()).livemode!==false)throw Error('STRIPE_TEST_MODE_REQUIRED')
const binary=path.join(directory,'pagos-tools/node_modules/.bin/stripe'),config=path.join(directory,'stripe-cli-config.toml')
const cliArgs=['--config',config,'--project-name','diime-e2e-20261014','listen','--skip-update',...(args[0]==='--prepare-secret'?['--print-secret']:['--events','checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,account.updated,refund.updated,refund.failed,charge.dispute.created,charge.dispute.closed','--forward-to','http://127.0.0.1:3200/api/stripe/webhook','--forward-connect-to','http://127.0.0.1:3200/api/stripe/webhook'])]
const child=spawn(binary,cliArgs,{env:{PATH:process.env.PATH,HOME:process.env.HOME,STRIPE_API_KEY:key},stdio:['ignore','pipe','pipe']})
let pending='',secretStored=false
function line(text){const secret=text.match(/whsec_[A-Za-z0-9_]+/)?.[0];if(secret&&!secretStored){env.STRIPE_WEBHOOK_SECRET=secret;env.DIIME_STRIPE_WEBHOOK_SECRET=secret;fs.writeFileSync(envPath,Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});fs.chmodSync(envPath,0o600);secretStored=true;console.log(JSON.stringify({testMode:true,webhookSecretStored:true,forwardLocalOnly:true}))}if(args[0]==='--listen'){process.stdout.write(text.replace(/(?:whsec_|[sr]k_(?:test|live)_)[A-Za-z0-9_]+/g,'[REDACTED]'))}}
function output(chunk){pending+=chunk.toString();let end;while((end=pending.indexOf('\n'))>=0){line(pending.slice(0,end+1));pending=pending.slice(end+1)}}
child.stdout.on('data',output);child.stderr.on('data',output)
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'))
const code=await new Promise(resolve=>child.once('exit',resolve))
if(pending)line(pending)
if(code!==0||!secretStored){console.error('STRIPE_TEST_LISTENER_FAILED');process.exitCode=1}
