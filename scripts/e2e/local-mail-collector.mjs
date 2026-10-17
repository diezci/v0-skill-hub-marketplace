// Real app Resend HTTP requests captured by local Mailpit SMTP. No delivery provider.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
export const localKey='re_local_e2e_only'
export function syntheticAddress(value){
  if(typeof value!=='string'||/[\r\n]/.test(value))throw Error('INVALID_ADDRESS')
  const address=value.match(/^[^<>]*<([^<>]+)>$/)?.[1]??value
  if(!/^[^\s<>@,;]+@(?:[a-z0-9-]+\.)*(?:test|example)$|^[^\s<>@,;]+@example\.com$/i.test(address))throw Error('SYNTHETIC_ADDRESS_REQUIRED')
  return address
}
export function validateMessage(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('INVALID_MESSAGE')
  syntheticAddress(body.from)
  let recipients=0
  for(const field of ['to','cc','bcc'])for(const value of body[field]==null?[]:Array.isArray(body[field])?body[field]:[body[field]]){syntheticAddress(value);recipients++}
  if(!recipients)throw Error('RECIPIENT_REQUIRED')
  if(body.reply_to)for(const value of Array.isArray(body.reply_to)?body.reply_to:[body.reply_to])syntheticAddress(value)
  if(body.attachments?.length)throw Error('ATTACHMENTS_UNSUPPORTED_IN_LOCAL_COLLECTOR')
  if(body.scheduled_at)throw Error('SCHEDULE_UNSUPPORTED')
  // The app includes this ordinary transactional-email header. Preserve it in
  // Mailpit, without admitting arbitrary headers or external unsubscribe links.
  if(body.headers){
    if(typeof body.headers!=='object'||Array.isArray(body.headers)||Object.keys(body.headers).some(key=>key!=='List-Unsubscribe'))throw Error('CUSTOM_HEADERS_UNSUPPORTED')
    const value=body.headers['List-Unsubscribe']
    if(typeof value!=='string'||/[\r\n]/.test(value)||!/^<[^<>]+>$/.test(value))throw Error('INVALID_UNSUBSCRIBE_HEADER')
    const url=new URL(value.slice(1,-1))
    if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='3200'||url.username||url.password)throw Error('LOCAL_UNSUBSCRIBE_REQUIRED')
  }
  if(typeof body.subject!=='string'||/[\r\n]/.test(body.subject))throw Error('INVALID_SUBJECT')
  if(typeof body.html!=='string'&&typeof body.text!=='string')throw Error('BODY_REQUIRED')
  return {...body,recipients}
}
export function collectorServer({sendMail,record=()=>{}}){
  return http.createServer(async(req,res)=>{
    const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}
    if(req.method==='GET'&&req.url==='/health')return reply(200,{local:true,transport:'Mailpit SMTP',provider:'Resend-compatible local capture'})
    if(req.method!=='POST'||!['/emails','/emails/batch'].includes(req.url))return reply(404,{message:'Not found',name:'not_found'})
    if(req.headers.authorization!==`Bearer ${localKey}`)return reply(401,{message:'Local key required',name:'validation_error'})
    try{
      let size=0;const parts=[]
      for await(const part of req){size+=part.length;if(size>2*1024*1024)throw Error('REQUEST_TOO_LARGE');parts.push(part)}
      const body=JSON.parse(Buffer.concat(parts).toString()),batch=req.url==='/emails/batch',messages=batch?body:[body]
      if(!Array.isArray(messages)||messages.length<1||messages.length>100)throw Error('INVALID_BATCH')
      const validated=messages.map(validateMessage),data=[]
      for(const message of validated){
        const id=randomUUID()
        await sendMail({from:message.from,to:message.to,cc:message.cc,bcc:message.bcc,replyTo:message.reply_to,subject:message.subject,text:message.text,html:message.html,headers:message.headers,disableFileAccess:true,disableUrlAccess:true,messageId:`<${id}@diime.test>`})
        await record({id,at:new Date().toISOString(),transport:'local-http-to-mailpit-smtp',recipients:message.recipients,subject:message.subject})
        data.push({id})
      }
      reply(200,batch?{data}:data[0])
    }catch(error){reply(400,{name:'validation_error',message:String(error.message).replace(/(?:[sr]k_(?:test|live)_|whsec_)[A-Za-z0-9]+/g,'[REDACTED]')})}
  })
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(process.argv.includes('--help')){console.log('Usage: node scripts/e2e/local-mail-collector.mjs. HTTP127.0.0.1:3321 → Mailpit SMTP127.0.0.1:54325. Synthetic recipients only. No real Resend/APNS/FCM.');process.exit(0)}
  const directory=path.resolve('.build/e2e-20261014'),nodemailer=createRequire(path.join(directory,'pagos-tools/package.json'))('nodemailer')
  const transport=nodemailer.createTransport({host:'127.0.0.1',port:54325,secure:false,ignoreTLS:true,connectionTimeout:5000,socketTimeout:5000})
  await transport.verify()
  const records=path.join(directory,'notifications');fs.mkdirSync(records,{recursive:true,mode:0o700})
  const server=collectorServer({sendMail:mail=>transport.sendMail(mail),record:record=>fs.appendFileSync(path.join(records,'captured.jsonl'),JSON.stringify(record)+'\n',{mode:0o600})})
  server.listen(3321,'127.0.0.1',()=>console.log(JSON.stringify({localOnly:true,httpPort:3321,smtpPort:54325,transportReady:true})))
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)))
}
