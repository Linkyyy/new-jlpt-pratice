import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isAudioReference} from '../src/lib/audio-url.mjs';
import {isImageReference} from '../src/lib/image-url.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const format='jlpt-practice/import-listening-practice/v1';
const text=value=>typeof value==='string'?value.trim():'';
const visible=value=>text(value).replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').trim();

/** Owner-authorized filename convention: number recordings by parent, not by subquestion. */
export function convertListeningPractice(source){
  assert(/^202[4-6](?:07|12)$/.test(source.period) && /^N[1-5]$/.test(source.level),'Unexpected listening period/level');
  const parents=new Map(), ids=new Set();
  const ordered=[...source.questions].sort((a,b)=>a.sourceQuestionNumber-b.sourceQuestionNumber);
  const metadata=[];
  const questions=ordered.map(row=>{
    assert(row.category==='听力' && row.sourceParentId && row.sourceObjectId,'Missing source parent identity');
    assert(!ids.has(row.id),'Duplicate source question');ids.add(row.id);
    assert(Number.isInteger(row.sourceQuestionNumber),'Missing source question number');
    if(!parents.has(row.sourceParentId))parents.set(row.sourceParentId,parents.size+1);
    const audio=row.media?.audio || `audio/${source.period}${source.level.toLowerCase()}/${parents.get(row.sourceParentId)}.mp3`;
    assert(isAudioReference(audio),'Invalid audio path');
    const options=row.options.map((option,index)=>({...option,text:visible(option.text)?option.text:`选项 ${index+1}（以音频为准）`}));
    assert(options.length>=2 && options.length<=4 && new Set(options.map(option=>option.id)).size===options.length,'Invalid options');
    const correctOptionId=row.correctOptionId??null;
    assert(correctOptionId===null || options.some(option=>option.id===correctOptionId),'Invalid reference answer');
    const instruction=text(row.instruction);
    // Numeric placeholders in printed-paper/image sections refer to a diagram.
    // Listening-only response sections have no printed choices and need no image.
    const placeholderChoices=row.options.every(option=>/^[1-4]$|^[アイウエオカキクケコ→\s・、]+$/.test(visible(option.text).normalize('NFKC')));
    const needsImage=/[絵え]を見|イラスト|図を見/.test(instruction)
      || placeholderChoices && /用紙の/.test(instruction) && !/用紙に何も印刷/.test(instruction);
    const images=row.media?.images??(needsImage?[`pic/${source.level.slice(1)}${source.period}${row.sourceQuestionNumber}.jpg`]:[]);
    assert(images.every(isImageReference),'Invalid image path');
    const sourceId=Number(row.id.split(':')[4]);
    assert(Number.isSafeInteger(sourceId) && row.id===`imported:${source.period}:${source.level}:4:${sourceId}:${row.sourceQuestionNumber}`,'Unstable question ID');
    metadata.push({id:row.id,objectId:row.sourceObjectId,parentObjectId:row.sourceParentId,identity:row.sourceIdentity,
      audio,audioMapping:row.media?.audio?'source':'parent-order-convention',images,answerStatus:correctOptionId===null?'pending':'source'});
    return {id:row.id,level:source.level,category:'听力',prompt:text(row.prompt)||`听力第 ${row.sourceQuestionNumber} 题：请听音频后选择答案。`,
      instruction,richText:true,options,correctOptionId,explanation:row.explanation,sourceQuestionNumber:row.sourceQuestionNumber,sourceId,
      media:{images,...(row.media?.questionImages?{questionImages:row.media.questionImages}:{}),audio}};
  });
  assert.equal(questions.length,source.questionCount,'Source count mismatch');
  return {version:1,sourceFile:source.sourceFile,period:source.period,level:source.level,type:'listening',questions,unavailable:[],
    sourceMetadata:{format,checksum:source.checksum,questions:metadata},
    importStats:{sourceRecords:questions.length+parents.size,containers:parents.size}};
}

export async function importListeningPractice({sourceDirectory=path.join(root,'src/data/frequency-listening'),outputDirectory=path.join(root,'src/data/imported-bank')}={}){
  const sources=JSON.parse(await fs.readFile(path.join(sourceDirectory,'index.json'),'utf8'));
  const manifestPath=path.join(outputDirectory,'index.json');
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  const replacements=new Map(), priorBanks=new Map();
  for(const group of sources.groups){
    if(group.period<'202401'||group.period>'202612')continue;
    assert(/^\d{6}-N[1-5]\.json$/.test(group.file),'Invalid transcript source filename');
    const source=JSON.parse(await fs.readFile(path.join(sourceDirectory,'exams',group.file),'utf8'));
    const bank=convertListeningPractice(source), filename=`${bank.period}-${bank.level}-4.json`;
    let old;
    try{old=JSON.parse(await fs.readFile(path.join(outputDirectory,'questions',filename),'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    assert(!old || old.questions.length+old.unavailable.length===0 || old.sourceMetadata?.format===format,`Refusing to overwrite existing listening IDs: ${filename}`);
    if(old)priorBanks.set(filename,old);
    // Retain subsequently supplied authoritative answer keys across reruns.
    const prior=new Map(old?.questions.map(question=>[question.id,question])??[]);
    for(const question of bank.questions){
      const key=prior.get(question.id)?.correctOptionId;
      if(question.correctOptionId===null&&key!=null){assert(question.options.some(option=>option.id===key));question.correctOptionId=key;bank.sourceMetadata.questions.find(row=>row.id===question.id).answerStatus='source';}
    }
    replacements.set(filename,bank);
  }
  const groups=manifest.groups.map(group=>{
    const bank=replacements.get(group.file);
    return bank?{...group,sourceFile:bank.sourceFile,availableCount:bank.questions.length,unavailableCount:0,totalCount:bank.questions.length}:group;
  });
  for(const [file,bank]of replacements)if(!groups.some(group=>group.file===file))groups.push({file,level:bank.level,period:bank.period,type:'listening',sourceFile:bank.sourceFile,
    availableCount:bank.questions.length,unavailableCount:0,totalCount:bank.questions.length});
  const report={...manifest.report,files:groups.length,questions:0,available:0,unavailable:0,reasons:{}};
  for(const [file,bank]of replacements){report.sourceRecords+=bank.importStats.sourceRecords-(priorBanks.get(file)?.importStats?.sourceRecords??0);report.containers+=bank.importStats.containers-(priorBanks.get(file)?.importStats?.containers??0);}
  const ids=new Set();
  for(const group of groups){
    const bank=replacements.get(group.file)??JSON.parse(await fs.readFile(path.join(outputDirectory,'questions',group.file),'utf8'));
    assert.equal(bank.questions.length,group.availableCount);assert.equal(bank.unavailable.length,group.unavailableCount);
    report.questions+=group.totalCount;report.available+=group.availableCount;report.unavailable+=group.unavailableCount;
    for(const question of [...bank.questions,...bank.unavailable]){assert(!ids.has(question.id),'Duplicate practice ID');ids.add(question.id);}
    for(const question of bank.unavailable)for(const reason of question.reasons??[question.reason])report.reasons[reason]=(report.reasons[reason]??0)+1;
  }
  for(const [file,bank]of replacements)await fs.writeFile(path.join(outputDirectory,'questions',file),JSON.stringify(bank,null,2)+'\n');
  await fs.writeFile(manifestPath,JSON.stringify({...manifest,groups,report},null,2)+'\n');
  return {papers:replacements.size,questions:[...replacements.values()].reduce((sum,bank)=>sum+bank.questions.length,0),
    pendingAnswers:[...replacements.values()].reduce((sum,bank)=>sum+bank.questions.filter(q=>q.correctOptionId===null).length,0)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await importListeningPractice(),null,2));
