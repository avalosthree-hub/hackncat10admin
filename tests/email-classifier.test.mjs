import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEmail} from '../supabase/functions/_shared/classifyEmail.ts';
test('classifier encourages two relevant institution topics, caps at four and rejects invented labels',async t=>{
 const originalDeno=globalThis.Deno;globalThis.Deno={env:{get:()=> 'test-key'}};
 t.after(()=>{if(originalDeno===undefined)delete globalThis.Deno;else globalThis.Deno=originalDeno;});
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const request=JSON.parse(options.body);assert.match(request.messages[0].content,/Aim for two/);assert.match(request.messages[0].content,/never more than four/);
  return Response.json({choices:[{message:{content:JSON.stringify({title:'Test',caption:'Test',content:'Test',category:'Events',eventTimes:[],locations:[],relatedLinks:[],hashtags:['Research','Events','Career','Funding','Volunteer','Invented','Events'],replyEligibility:'none'})}}]});
 });
 const result=await classifyEmail({subject:'Test',text:'Test',html:'',from:'campus@example.edu'},'2026-11-15T15:00:00Z',['Research','Events','Career','Funding','Volunteer'],'America/New_York');
 assert.deepEqual(result.hashtags,['Research','Events','Career','Funding']);
});
