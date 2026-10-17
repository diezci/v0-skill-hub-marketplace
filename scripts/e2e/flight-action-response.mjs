// Decode the data subset returned by local Next server actions. Fail closed on
// unsupported Flight types instead of silently treating a missing result as success.
export function decodeActionResponse(text) {
  const bytes=Buffer.from(text),chunks=new Map(),errors=new Map();let position=0
  while(position<bytes.length){
    if(bytes[position]===10||bytes[position]===13){position++;continue}
    const colon=bytes.indexOf(58,position);if(colon<0)break
    const id=bytes.subarray(position,colon).toString();if(!/^[0-9a-f]+$/.test(id)){const next=bytes.indexOf(10,position);if(next<0)break;position=next+1;continue}
    let start=colon+1
    if(bytes[start]===84){ // T: byte-length-delimited text; newlines are payload.
      const comma=bytes.indexOf(44,start+1);if(comma<0)throw Error('FLIGHT_TRUNCATED_TEXT_HEADER')
      const lengthText=bytes.subarray(start+1,comma).toString();if(!/^[0-9a-f]+$/.test(lengthText))throw Error('FLIGHT_INVALID_TEXT_LENGTH')
      const end=comma+1+Number.parseInt(lengthText,16);if(end>bytes.length)throw Error('FLIGHT_TRUNCATED_TEXT')
      chunks.set(id,{rawText:bytes.subarray(comma+1,end).toString()});position=end;continue
    }
    let end=bytes.indexOf(10,start);if(end<0)end=bytes.length
    const payload=bytes.subarray(start,end).toString();position=end+1
    if(payload.startsWith('E')){try{errors.set(id,JSON.parse(payload.slice(1)))}catch{};continue}
    // Debug/timing/hint records may reuse a model's ID. Never overwrite it.
    try{chunks.set(id,{model:JSON.parse(payload)})}catch{}
  }
  const memo=new WeakMap(),resolving=new Set()
  function reference(id,path=[]){
    if(errors.has(id)){const e=errors.get(id);throw Error(`ACTION_FLIGHT_ERROR: ${e.message||e.digest||'server error'}`)}
    const chunk=chunks.get(id);if(!chunk)throw Error(`FLIGHT_REFERENCE_MISSING: ${id}`)
    if('rawText'in chunk){if(path.length)throw Error('FLIGHT_TEXT_HAS_NO_PROPERTIES');return chunk.rawText}
    let value=chunk.model
    for(const key of path){if(typeof value==='string'&&/^\$@?[0-9a-f]+(?::|$)/.test(value))value=decode(value);if(value==null||!Object.hasOwn(value,key))throw Error('FLIGHT_REFERENCE_PATH_MISSING');value=value[key]}
    const token=[id,...path].join(':');if(resolving.has(token))throw Error('FLIGHT_CIRCULAR_REFERENCE_STRING')
    resolving.add(token);try{return decode(value)}finally{resolving.delete(token)}
  }
  function decode(value){
    if(typeof value==='string'){
      if(value.startsWith('$$'))return value.slice(1)
      if(value==='$undefined')return undefined
      if(value==='$NaN')return NaN
      if(value==='$Infinity')return Infinity
      if(value==='$-Infinity')return -Infinity
      if(value==='$-0')return -0
      if(value.startsWith('$D'))return new Date(value.slice(2))
      if(/^\$n-?\d+$/.test(value))return BigInt(value.slice(2))
      const m=/^\$@?([0-9a-f]+)(?::([\s\S]*))?$/.exec(value)
      if(m)return reference(m[1],m[2]===undefined?[]:m[2].split(':'))
      if(value.startsWith('$'))throw Error('FLIGHT_UNSUPPORTED_MODEL_TYPE')
      return value
    }
    if(value===null||typeof value!=='object')return value
    if(memo.has(value))return memo.get(value)
    const output=Array.isArray(value)?[]:{};memo.set(value,output)
    for(const[key,child]of Object.entries(value))Object.defineProperty(output,key,{value:decode(child),enumerable:true,writable:true,configurable:true})
    return output
  }
  const root=chunks.get('0')?.model
  if(!root||!Object.hasOwn(root,'a'))throw Error('ACTION_FLIGHT_RESULT_MISSING')
  return decode(root.a)
}
