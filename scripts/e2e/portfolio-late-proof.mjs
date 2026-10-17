import fs from'node:fs';import assert from'node:assert/strict';import{localFixture}from'./local-client-fixtures.mjs';
const f=await localFixture('eur'),alias=process.argv[2];assert.ok(['PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO'].includes(alias));
try{const start=JSON.parse(fs.readFileSync(f.dir+'/portfolio-'+alias+'-late-start.json'));
 const rows=(await f.db.query('select id,estado,public_url,created_at from archivos_subidas_pendientes where propietario_id=$1 and created_at>=$2 order by created_at',[f.m.users[alias].id,start.startedAt])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].estado,'confirmado_publico');fs.writeFileSync(f.dir+'/portfolio-'+alias+'-late-completed.json',JSON.stringify(rows,null,2));console.log('PASS actual late upload completed',alias);
}finally{await f.db.end();}
