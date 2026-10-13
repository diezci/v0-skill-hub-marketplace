// Prepara SQL, nunca conecta a una base ni ejecuta la prueba.
// node scripts/prepare-workflow-prioritarios-rollback.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
const root=process.cwd()
const data=JSON.parse(await fs.readFile(path.join(root,'.build/qa-ui-credentials.json'),'utf8'))
let sql=await fs.readFile(path.join(root,'scripts/verify-workflow-prioritarios-rollback.template.sql'),'utf8')
for(const alias of ['CP','PP','CE','PE','EP','AJ']){
 const user=data.accounts.find(a=>a.alias===alias)
 if(!user||!/^[0-9a-f-]{36}$/i.test(user.id))throw new Error(`Falta identidad QA válida: ${alias}`)
 sql=sql.replaceAll(`__QA_${alias}__`,user.id)
}
sql=sql.replaceAll('__QA_MARKER__',`QA rollback ${randomUUID()}`)
const output=path.join(root,'.build/correcciones-prioritarias-20261012/privacidad/production-rollback.sql')
await fs.writeFile(output,sql)
console.log('SQL preparado sin ejecución; no se copiaron contraseñas ni sesiones: '+output)
