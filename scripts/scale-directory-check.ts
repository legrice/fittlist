import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { getDb, schema } from "../src/db";
import { publicFeedSchedules, publicSchedules, type ScheduleRow } from "../src/lib/coachweek";
import { occurrenceEnded, runsOn } from "../src/lib/format";

async function main() {
  if(process.env.DATABASE_URL)throw new Error("Scale check refuses DATABASE_URL");
  assert(process.env.AUDIT_FIXTURES,"Set AUDIT_FIXTURES to scale fixture manifest");
  const f=JSON.parse(readFileSync(process.env.AUDIT_FIXTURES,"utf8"));
  assert(f.dataDir.startsWith(f.directory+"/"));
  process.env.PGLITE_DATA_DIR=f.dataDir;
  const db=await getDb();
  const everyone=await db.select({id:schema.users.id,shiftsPublic:schema.users.shiftsPublic}).from(schema.users);
  const limit=Number(process.env.AUDIT_DIRECTORY_COACH_LIMIT||everyone.length);
  const people=everyone.slice(0,limit);
  const start=new Date(`${f.iso}T00:00:00Z`),end=new Date(start);end.setUTCDate(end.getUTCDate()+13);
  const window={start:f.iso,end:end.toISOString().slice(0,10)};
  function summary(rows:ScheduleRow[]) {
    const counts=new Map<string,number>(),soonest=new Map<string,string>();
    for(let i=0;i<14;i++){
      const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);const iso=d.toISOString().slice(0,10),dow=(d.getUTCDay()+6)%7;
      for(const row of rows){
        if(!row.isPublic||!runsOn(row,iso,dow))continue;
        if(i<7)counts.set(row.ownerUserId,(counts.get(row.ownerUserId)||0)+1);
        if(!soonest.has(row.ownerUserId)&&!occurrenceEnded(iso,row.startTime,row.durationMin,row.timeZone))soonest.set(row.ownerUserId,`${iso} ${row.startTime}`);
      }
    }
    return {counts:[...counts].sort(),soonest:[...soonest].sort()};
  }
  const results=[];
  let fullSummary:ReturnType<typeof summary>|undefined;
  const batchSize=Number(process.env.AUDIT_DIRECTORY_BATCH_SIZE||0);
  const fullLoader=async()=>{
    if(!batchSize)return publicSchedules(people);
    const rows:ScheduleRow[]=[];
    for(let i=0;i<people.length;i+=batchSize)rows.push(...await publicSchedules(people.slice(i,i+batchSize)));
    return rows;
  };
  for(const [name,loader] of [[batchSize?"full-image-loader-batched":"full-image-loader",fullLoader],["list-loader",()=>publicFeedSchedules(people,window)]] as const){
    const started=performance.now(),rows=await loader(),durationMs=performance.now()-started;
    const result=summary(rows);
    if(fullSummary)assert.deepEqual(result,fullSummary,"Directory week counts and soonest classes remain identical");else fullSummary=result;
    results.push({name,rows:rows.length,durationMs:Math.round(durationMs),serializedBytes:Buffer.byteLength(JSON.stringify(rows)),classImages:rows.filter(row=>!!row.image).length,coachCount:result.counts.length});
  }
  const output=`${f.directory}/directory-loader-report.json`;
  writeFileSync(output,JSON.stringify({fixture:f.counts,sampledPeople:people.length,baselineBatchSize:batchSize||null,results,correctness:"identical week counts and soonest class per coach",limitation:"Synthetic local PGlite measurements, not a production latency forecast; batching the old loader only avoids its PGlite result-buffer limit in this benchmark"},null,2));
  console.log(JSON.stringify({results,report:output}));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
