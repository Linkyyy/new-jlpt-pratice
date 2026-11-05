import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {withReviewedListeningAnswer} from '../src/lib/listening-answer-review.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));

export async function applyListeningAnswers({bankDirectory=path.join(root,'src/data/imported-bank'),sourceDirectory=path.join(root,'src/data/frequency-listening'),
  reviewFile=path.join(root,'src/data/listening-answer-review/entries.json'),dryRun=false}={}){
  const review=JSON.parse(await fs.readFile(reviewFile,'utf8'));
  assert(review.version===1&&review.format==='jlpt-listening-answer-review'&&review.official===false,'Invalid review registry');
  const entries=new Map(review.entries.map(entry=>[entry.id,entry]));assert.equal(entries.size,review.entries.length,'Duplicate answer review');
  const files=[...new Set(review.entries.map(entry=>`${entry.period}-${entry.level}`))].sort();
  const replacements=new Map(),papers=[];let filledNow=0,confirmed=0;
  for(const paper of files){
    assert(/^\d{6}-N[1-5]$/.test(paper),'Invalid review paper');
    const bankFile=path.join(bankDirectory,'questions',`${paper}-4.json`);
    const bank=JSON.parse(await fs.readFile(bankFile,'utf8'));
    assert.equal(bank.sourceMetadata?.format,'jlpt-practice/import-listening-practice/v1','Refusing to modify unrelated listening bank');
    const source=JSON.parse(await fs.readFile(path.join(sourceDirectory,'exams',`${paper}.json`),'utf8'));
    const sources=new Map(source.questions.map(question=>[question.id,question]));
    const metadata=new Map(bank.sourceMetadata.questions.map(question=>[question.id,question]));
    const questions=bank.questions.map(question=>{
      const entry=entries.get(question.id),meta=metadata.get(question.id);
      if(!entry||entry.status!=='confirmed')return question;
      // Never replace an authoritative key supplied later by the owner.
      if(question.correctOptionId!==null&&meta?.answerStatus!=='inferred-reviewed')return question;
      const updated=withReviewedListeningAnswer(question,sources.get(question.id),entry);
      if(question.correctOptionId===null)filledNow++;
      confirmed++;
      meta.answerStatus='inferred-reviewed';meta.answerReviewFile='src/data/listening-answer-review/entries.json';meta.answerSourceHash=entry.sourceHash;
      return updated;
    });
    replacements.set(bankFile,{...bank,questions});
    papers.push({period:bank.period,level:bank.level,confirmed:questions.filter(q=>metadata.get(q.id)?.answerStatus==='inferred-reviewed').length,
      pending:questions.filter(q=>q.correctOptionId===null).length});
  }
  // All source/evidence checks finish before the first file is changed.
  if(!dryRun)for(const [file,bank]of replacements)await fs.writeFile(file,JSON.stringify(bank,null,2)+'\n');
  return {filledNow,confirmed,pending:review.entries.filter(entry=>entry.status!=='confirmed'),papers};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=await applyListeningAnswers();
  await fs.writeFile(path.join(root,'docs/listening-answer-review-2026-11-05.json'),JSON.stringify({version:1,answerSource:'transcript-inference',official:false,
    reviewedAt:new Date().toISOString(),...report},null,2)+'\n');
  console.log(JSON.stringify({filledNow:report.filledNow,confirmed:report.confirmed,pending:report.pending.length,papers:report.papers},null,2));
}
