import test from 'node:test'
import assert from 'node:assert/strict'
import { createReorderVideos } from '../src/services/videoOrderService.js'
function setup() {
 let records=[{id:'a',sortOrder:1},{id:'b',sortOrder:2},{id:'c',sortOrder:3}]
 const prisma={$transaction:async fn=>{let draft=structuredClone(records);const result=await fn({video:{findMany:async()=>[...draft].sort((a,b)=>a.sortOrder-b.sortOrder),update:async({where,data})=>Object.assign(draft.find(v=>v.id===where.id),data)}});records=draft;return result}}
 return {run:async body=>{const res={code:200,status(n){this.code=n;return this},json(data){this.data=data;return this}};await createReorderVideos(prisma)({body},res);return res},records:()=>records}
}
test('reorders all videos and persists positions',async()=>{const s=setup();const r=await s.run({ids:['c','a','b'],previousIds:['a','b','c']});assert.equal(r.code,200);assert.deepEqual(r.data.map(v=>v.id),['c','a','b']);assert.deepEqual(r.data.map(v=>v.sortOrder),[1,2,3])})
test('rejects duplicate, partial and stale lists without changing stored order',async()=>{for(const [body,code] of [[{ids:['a','a','c'],previousIds:['a','b','c']},400],[{ids:['a'],previousIds:['a']},409],[{ids:['a','c','b'],previousIds:['b','a','c']},409],[{ids:['z','b','c'],previousIds:['a','b','c']},400]]){const s=setup();assert.equal((await s.run(body)).code,code);assert.deepEqual(s.records().map(v=>v.sortOrder),[1,2,3])}})
