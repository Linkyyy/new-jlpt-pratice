"use client";
import { useSyncExternalStore } from "react";
import { scheduleTermReview, isFrequencyPresetQuery, type ReviewRating, isTermStudyData, termStudyKey, type TermIdentity, type TermStudyData, type TermStudyEntry, type TermCardExample } from "./term-study-data";
export const TERM_STUDY_STORAGE_KEY = "jlpt-practice.term-study.v1";
const empty: TermStudyData = {version: 1, entries: []};
type Snapshot = {data: TermStudyData; ready: boolean; error: string | null};
const server: Snapshot = {data: empty, ready: false, error: null};
let rawCache: string | null | undefined, cache = server;
const listeners = new Set<() => void>();
export function readTermStudySnapshot(): Snapshot {
  if (typeof window === "undefined") return server;
  try {
    const raw = window.localStorage.getItem(TERM_STUDY_STORAGE_KEY);
    if (raw === rawCache && cache.ready && !cache.error) return cache;
    const data: unknown = raw === null ? empty : JSON.parse(raw);
    if (!isTermStudyData(data)) throw new Error("Invalid term collection");
    rawCache = raw; cache = {data, ready: true, error: null};
  } catch { if (!cache.ready || !cache.error) cache = {data: cache.data, ready: true, error: "无法读取词条收藏，原数据未被覆盖，请检查浏览器存储权限。"}; }
  return cache;
}
export function refreshTermStudy() { rawCache = undefined; readTermStudySnapshot(); listeners.forEach(f => f()); }
function subscribe(f: () => void) {
  listeners.add(f);
  const storage = (e: StorageEvent) => { if (e.key === TERM_STUDY_STORAGE_KEY || e.key === null) { rawCache = undefined; f(); } };
  window.addEventListener("storage", storage);
  return () => { listeners.delete(f); window.removeEventListener("storage", storage); };
}
export function useTermStudy() { return useSyncExternalStore(subscribe, readTermStudySnapshot, () => server); }
export type TermStudyInput = TermIdentity & {meaning?:string;usage?:string;example?:TermCardExample;referenceLevels?:string[]};
type Result={ok:boolean;error?:string;id?:string};
function commit(transform:(data:TermStudyData,now:number)=>TermStudyData):Result {
  const current=readTermStudySnapshot();
  if(!current.ready||current.error)return {ok:false,error:current.error??'正在读取本地记录，请稍后重试。'};
  let data:TermStudyData;
  try{data=transform(current.data,Date.now());}catch(error){return {ok:false,error:error instanceof Error?error.message:'词条操作无效。'};}
  if(!isTermStudyData(data))return {ok:false,error:'操作无效或已达到收藏、分组或方案的数量上限。'};
  try{window.localStorage.setItem(TERM_STUDY_STORAGE_KEY,JSON.stringify(data));refreshTermStudy();return {ok:true};}
  catch{return {ok:false,error:'保存失败，请检查浏览器存储权限或空间。原收藏未修改。'};}
}
const nextId=()=>`item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
export function updateTermStudy(term:TermStudyInput,action:'save'|'remove'|'pending'|'mastered'):Result {
  return commit((data,time)=>{
    const key=termStudyKey(term),old=data.entries.find(e=>e.key===key),now=Math.max(time,(old?.updatedAt??0)+1,(data.removed?.find(r=>r.key===key)?.updatedAt??0)+1);
    if(action==='save'&&old)return data;
    const entries=data.entries.filter(e=>e.key!==key),removed=(data.removed??[]).filter(r=>r.key!==key);
    if(action==='remove'){removed.push({key,updatedAt:now});return {...data,entries,removed};}
    const entry:TermStudyEntry={...old,...term,key,meaning:(term.meaning??old?.meaning??'').slice(0,2000),usage:(term.usage??old?.usage??'').slice(0,2000),savedAt:old?.savedAt??now,updatedAt:now,reviewedAt:old?.reviewedAt??null,reviews:old?.reviews??0,status:old?.status??'pending',groupIds:old?.groupIds??['default']};
    if(action==='mastered'||action==='pending'){
      const reviewed=scheduleTermReview(entry,action==='mastered'?'good':'again',now);
      if(action==='pending')reviewed.schedule!.dueAt=reviewed.reviewedAt!;
      entries.push(reviewed);
    }else entries.push(entry);
    return {...data,entries,...(data.removed?{removed}:{})};
  });
}
export function rateTermStudy(key:string,rating:ReviewRating):Result {
  return commit((data,now)=>{if(!data.entries.some(e=>e.key===key))throw Error('词条已被移除，请返回清单刷新。');return {...data,entries:data.entries.map(e=>e.key===key?scheduleTermReview(e,rating,now):e)};});
}
export function batchTermStudy(keys:string[],action:'remove'|'pending'|'mastered'|'move'|'add-group',groupId='default'):Result {
  return commit((data,time)=>{
    const selected=new Set(keys),existing=new Set(data.entries.map(e=>e.key));if(!selected.size||selected.size>5000||keys.some(key=>!existing.has(key)))throw Error('所选词条已变化，请重新选择。');
    if(['move','add-group'].includes(action)&&groupId!=='default'&&!data.groups?.some(g=>g.id===groupId&&!g.deleted))throw Error('分组不存在，请重新选择。');
    const removed=new Map((data.removed??[]).map(r=>[r.key,r]));
    const entries=data.entries.flatMap(e=>{
      if(!selected.has(e.key))return [e];const now=Math.max(time,e.updatedAt+1);
      if(action==='remove'){removed.set(e.key,{key:e.key,updatedAt:now});return [];}
      if(action==='move'||action==='add-group'){const groupIds=action==='move'||groupId==='default'?[groupId]:[...new Set([...(e.groupIds??[]).filter(id=>id!=='default'),groupId])];return [{...e,updatedAt:now,groupIds}];}
      const reviewed=scheduleTermReview(e,action==='mastered'?'good':'again',now);if(action==='pending')reviewed.schedule!.dueAt=reviewed.reviewedAt!;return [reviewed];
    });
    return {...data,entries,...(action==='remove'?{removed:[...removed.values()]}:{})};
  });
}
export function saveTermGroup(name:string,id?:string):Result {
  const key=id??nextId();const result=commit((data,now)=>{
    const groups=data.groups??[],clean=name.trim(),old=groups.find(g=>g.id===key);if(!clean||clean.length>40)throw Error('名称需为 1–40 个字符。');
    if(groups.some(g=>!g.deleted&&g.id!==key&&g.name.toLocaleLowerCase()===clean.toLocaleLowerCase()))throw Error('已存在同名分组。');
    if(id&&(!old||old.deleted))throw Error('分组不存在，请重新选择。');
    return {...data,groups:[...groups.filter(g=>g.id!==key),{id:key,name:clean,updatedAt:Math.max(now,(old?.updatedAt??0)+1)}]};
  });return {...result,...(result.ok?{id:key}:{})};
}
export function deleteTermGroup(id:string):Result {
  return commit((data,now)=>{
    if(!data.groups?.some(g=>g.id===id&&!g.deleted)||id==='default')throw Error('分组不存在，请重新选择。');
    return {...data,groups:data.groups.map(g=>g.id===id?{...g,deleted:true,updatedAt:Math.max(now,g.updatedAt+1)}:g),entries:data.entries.map(e=>{if(!e.groupIds?.includes(id))return e;const groupIds=e.groupIds.filter(g=>g!==id);return {...e,groupIds:groupIds.length?groupIds:['default'],updatedAt:Math.max(now,e.updatedAt+1)};})};
  });
}
export function saveFrequencyPreset(name:string,query:string,id?:string):Result {
  const key=id??nextId();const result=commit((data,now)=>{
    const rows=data.presets??[],clean=name.trim(),old=rows.find(r=>r.id===key);
    if(!clean||clean.length>40)throw Error('名称需为 1–40 个字符。');
    if(!isFrequencyPresetQuery(query))throw Error('筛选方案无效。');
    if(rows.some(r=>!r.deleted&&r.id!==key&&r.name.toLocaleLowerCase()===clean.toLocaleLowerCase()))throw Error('已存在同名方案，请修改名称或更新原方案。');
    if(id&&(!old||old.deleted))throw Error('筛选方案已删除。');
    return {...data,presets:[...rows.filter(r=>r.id!==key),{id:key,name:clean,query,updatedAt:Math.max(now,(old?.updatedAt??0)+1)}]};
  });return {...result,...(result.ok?{id:key}:{})};
}
export function deleteFrequencyPreset(id:string):Result {
  return commit((data,now)=>{if(!data.presets?.some(r=>r.id===id&&!r.deleted))throw Error('筛选方案已删除。');return {...data,presets:data.presets.map(r=>r.id===id?{...r,deleted:true,updatedAt:Math.max(now,r.updatedAt+1)}:r)};});
}
