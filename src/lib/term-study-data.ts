export const termKinds = ["word", "grammar", "idiom"] as const;
export type TermKind = typeof termKinds[number];
export type TermIdentity = { kind: TermKind; label: string; reading: string; pos: string };
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type TermSchedule = {dueAt:number;intervalDays:number;streak:number;lapses:number;lastRating:ReviewRating};
export type TermGroup = {id:string;name:string;updatedAt:number;deleted?:boolean};
export type FrequencyPreset = {id:string;name:string;query:string;updatedAt:number;deleted?:boolean};
export type TermCardExample={text:string;path:string;label:string};
export type TermStudyEntry = TermIdentity & { key: string; meaning: string; usage: string; savedAt: number; updatedAt: number; reviewedAt: number | null; reviews: number; status: "pending" | "mastered";groupIds?:string[];schedule?:TermSchedule;example?:TermCardExample;referenceLevels?:string[] };
export type TermStudyData = { version: 1; entries: TermStudyEntry[];groups?:TermGroup[];presets?:FrequencyPreset[];removed?:{key:string;updatedAt:number}[] };
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number, empty = false): v is string => typeof v === "string" && v.length <= max && (empty || v.trim().length > 0);
const timestamp = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 8640000000000000;
export function isTermIdentity(v: unknown): v is TermIdentity & Record<string, unknown> {
  return record(v) && termKinds.includes(v.kind as TermKind) && text(v.label, 120) && text(v.reading, 240, true) && text(v.pos, 40);
}
// Persist semantic identities, never build-specific numeric term IDs.
export function termStudyKey(term: TermIdentity): string {
  return JSON.stringify([term.kind, term.label.normalize("NFKC"), term.reading.normalize("NFKC"), term.pos]);
}
export function parseTermStudyKey(key: unknown): TermIdentity | null {
  if (typeof key !== "string" || key.length > 1000) return null;
  try { const values = JSON.parse(key); if (!Array.isArray(values) || values.length !== 4) return null; const term = {kind: values[0], label: values[1], reading: values[2], pos: values[3]}; return isTermIdentity(term) && termStudyKey(term) === key ? term : null; } catch { return null; }
}
const id = (value:unknown):value is string => typeof value==='string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value);
const entity = (value:unknown):value is TermGroup => record(value)&&id(value.id)&&value.id!=='default'&&text(value.name,40)&&value.name.trim()===value.name&&timestamp(value.updatedAt)&&(value.deleted===undefined||typeof value.deleted==='boolean');
export function isFrequencyPresetQuery(value:unknown):value is string {
  if(typeof value!=='string'||value.length>2000||/[\r\n]/.test(value))return false;
  const allowed=new Set(['source','level','grade','exclusive','period','category','subtype','field','kind','pos','order','min','max','q','size']),seen=new Set<string>();
  try{for(const part of value.split('&').filter(Boolean)){const at=part.indexOf('=');if(at<1)return false;const key=decodeURIComponent(part.slice(0,at).replace(/\+/g,' ')),item=decodeURIComponent(part.slice(at+1).replace(/\+/g,' '));if(!allowed.has(key)||seen.has(key)||/[\x00-\x1f\x7f]/.test(item))return false;seen.add(key);}return true;}catch{return false;}
}
function isSchedule(value:unknown):value is TermSchedule {return record(value)&&timestamp(value.dueAt)&&Number.isInteger(value.intervalDays)&&Number(value.intervalDays)>=0&&Number(value.intervalDays)<=365&&Number.isSafeInteger(value.streak)&&Number(value.streak)>=0&&Number(value.streak)<=1000000&&Number.isSafeInteger(value.lapses)&&Number(value.lapses)>=0&&Number(value.lapses)<=1000000&&['again','hard','good','easy'].includes(String(value.lastRating));}
export function isTermStudyData(v: unknown): v is TermStudyData {
  if(!record(v)||v.version!==1||!Array.isArray(v.entries)||v.entries.length>5000)return false;
  if(v.groups!==undefined&&(!Array.isArray(v.groups)||v.groups.length>100||!v.groups.every(entity)||new Set(v.groups.map(g=>g.id)).size!==v.groups.length))return false;
  if(v.presets!==undefined&&(!Array.isArray(v.presets)||v.presets.length>100||!v.presets.every(p=>record(p)&&isFrequencyPresetQuery(p.query)&&entity(p))||new Set(v.presets.map(p=>(p as FrequencyPreset).id)).size!==v.presets.length))return false;
  if(v.removed!==undefined&&(!Array.isArray(v.removed)||v.removed.length>5000||!v.removed.every(r=>record(r)&&parseTermStudyKey(r.key)!==null&&timestamp(r.updatedAt))||new Set(v.removed.map(r=>(r as {key:string}).key)).size!==v.removed.length))return false;
  const groups=new Set(['default',...((v.groups as TermGroup[]|undefined)??[]).filter(g=>!g.deleted).map(g=>g.id)]);
  return v.entries.every(e => isTermIdentity(e) && record(e) && e.key === termStudyKey(e)
    && text(e.meaning, 2000, true) && text(e.usage, 2000, true) && timestamp(e.savedAt) && timestamp(e.updatedAt) && Number(e.updatedAt) >= Number(e.savedAt)
    && ["pending", "mastered"].includes(String(e.status)) && Number.isSafeInteger(e.reviews) && Number(e.reviews) >= 0 && Number(e.reviews) <= 1000000
    && (e.groupIds===undefined||Array.isArray(e.groupIds)&&e.groupIds.length>0&&e.groupIds.length<=50&&e.groupIds.every(g=>typeof g==='string'&&groups.has(g))&&new Set(e.groupIds).size===e.groupIds.length)
    && (e.schedule===undefined||isSchedule(e.schedule)&&timestamp(e.reviewedAt)&&e.schedule.dueAt>=e.reviewedAt)
    && (e.referenceLevels===undefined||Array.isArray(e.referenceLevels)&&e.referenceLevels.length<=5&&e.referenceLevels.every(l=>/^N[1-5]$/.test(String(l)))&&new Set(e.referenceLevels).size===e.referenceLevels.length)
    && (e.example===undefined||record(e.example)&&text(e.example.text,1000)&&text(e.example.label,160)&&text(e.example.path,2000)&&/^\/practice\?/.test(e.example.path)&&!/[\\\r\n]/.test(e.example.path))
    && (e.reviewedAt === null || timestamp(e.reviewedAt) && Number(e.reviewedAt) >= Number(e.savedAt) && Number(e.reviewedAt) <= Number(e.updatedAt)))
    && new Set(v.entries.map(e => e.key)).size === v.entries.length;
}
export function mergeTermStudyData(local: TermStudyData, incoming: TermStudyData): TermStudyData {
  const entries = new Map(local.entries.map(e => [e.key, e]));
  for (const entry of incoming.entries) { const old = entries.get(entry.key); if (!old) entries.set(entry.key, entry); else entries.set(entry.key, {...(entry.updatedAt > old.updatedAt ? entry : old), savedAt: Math.min(old.savedAt, entry.savedAt)}); }
  const mergeEntities=<T extends {id:string;updatedAt:number}>(a:T[]=[],b:T[]=[])=>{const rows=new Map(a.map(r=>[r.id,r]));for(const row of b){const old=rows.get(row.id);if(!old||row.updatedAt>old.updatedAt)rows.set(row.id,row);}return [...rows.values()];};
  const groups=mergeEntities(local.groups,incoming.groups),presets=mergeEntities(local.presets,incoming.presets);
  const groupAliases=new Map<string,string>(),names=new Map<string,string>();
  for(const group of groups.filter(g=>!g.deleted).sort((a,b)=>a.id.localeCompare(b.id))){const key=group.name.toLocaleLowerCase(),existing=names.get(key);if(existing)groupAliases.set(group.id,existing);else names.set(key,group.id);}
  const finalGroups=groups.filter(g=>!groupAliases.has(g.id)),active=new Set(['default',...finalGroups.filter(g=>!g.deleted).map(g=>g.id)]);
  const removed=new Map<string,{key:string;updatedAt:number}>();for(const row of [...local.removed??[],...incoming.removed??[]])if(!removed.has(row.key)||removed.get(row.key)!.updatedAt<row.updatedAt)removed.set(row.key,row);
  const result=[...entries.values()].filter(e=>(removed.get(e.key)?.updatedAt??0)<e.updatedAt).map(e=>{if(!e.groupIds)return e;const groupIds=[...new Set(e.groupIds.map(id=>groupAliases.get(id)??id).filter(id=>active.has(id)))];return {...e,groupIds:groupIds.length?groupIds:['default']};});
  return {version: 1, entries:result,...(local.groups||incoming.groups?{groups:finalGroups}:{}),...(local.presets||incoming.presets?{presets}:{}),...(local.removed||incoming.removed?{removed:[...removed.values()]}:{})};
}

export function termIsDue(entry:TermStudyEntry,now=Date.now()):boolean {return entry.schedule?entry.schedule.dueAt<=now:entry.status==='pending';}
export function scheduleTermReview(entry:TermStudyEntry,rating:ReviewRating,now=Date.now()):TermStudyEntry {
  const time=Math.max(now,entry.updatedAt+1),previous=entry.schedule,ladder=[1,3,7,14,30,60,120,240,365];
  const streak=rating==='again'?0:rating==='hard'?Math.max(0,(previous?.streak??0)-1):Math.min(1000000,(previous?.streak??0)+(rating==='easy'?2:1));
  const intervalDays=rating==='again'?0:rating==='hard'?1:ladder[Math.min(streak,ladder.length-1)];
  return {...entry,status:rating==='good'||rating==='easy'?'mastered':'pending',updatedAt:time,reviewedAt:time,reviews:Math.min(1000000,entry.reviews+1),schedule:{dueAt:time+(rating==='again'?600000:intervalDays*86400000),intervalDays,streak,lapses:Math.min(1000000,(previous?.lapses??0)+(rating==='again'?1:0)),lastRating:rating}};
}
