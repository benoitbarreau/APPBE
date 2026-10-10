import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
let result = { error: null }; let call
const source = fs.readFileSync('src/lib/referentielApi.ts','utf8').replace("import { supabase } from './supabase'", 'const supabase=globalThis.__synoxReferentielClient')
globalThis.__synoxReferentielClient = { rpc: async (name,args) => { call={name,args};return result } }
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
const {assignClientManager}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'))
delete globalThis.__synoxReferentielClient
test('manager reassignment uses the authorized RPC, including removal',async()=>{
 for(const managerId of ['manager',null]){
  await assignClientManager('client',managerId)
  assert.deepEqual(call,{name:'assign_client_manager',args:{p_client_id:'client',p_manager_id:managerId}})
 }
})
test('denied reassignment remains visible to the caller',async()=>{
 result={error:{message:'Assignation non autorisée',code:'42501'}}
 await assert.rejects(assignClientManager('foreign','manager'),/Assignation non autorisée/)
})
