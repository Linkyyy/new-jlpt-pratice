import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {frequencyText} from './bank-frequency.mjs';

export function listeningAnswerSourceHash(question){
  return createHash('sha256').update(JSON.stringify([question.id,question.sourceIdentity,question.sourceParentId,question.options,question.explanation])).digest('hex');
}
const compact=value=>frequencyText(value).normalize('NFKC').replace(/\s/g,'');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

/** Only apply a twice-reviewed inference to the exact transcript/options reviewed. */
export function withReviewedListeningAnswer(question,source,review){
  if(!review || review.status!=='confirmed')return question;
  assert.equal(question.category,'听力');assert.equal(question.id,source.id);assert.equal(review.id,source.id);
  assert.equal(review.sourceHash,listeningAnswerSourceHash(source),'Listening source changed; review must be repeated');
  assert(review.correctOptionId && review.firstPassOptionId===review.correctOptionId && review.secondPassOptionId===review.correctOptionId,'Answer did not pass both readings');
  assert(question.options.some(option=>option.id===review.correctOptionId),'Reviewed answer is not an available option');
  assert(typeof review.rationale==='string'&&review.rationale.length>0,'Missing reasoning');
  assert(Array.isArray(review.evidence)&&review.evidence.length>0,'Missing transcript evidence');
  const transcript=compact(source.explanation.join('\n'));
  for(const quote of review.evidence)assert(typeof quote==='string'&&quote.length>0&&transcript.includes(compact(quote)),'Evidence does not match the source transcript');
  const option=question.options.find(option=>option.id===review.correctOptionId);
  const analysis=`<p><strong>推导参考答案（非官方）</strong>：${escape(option.label??option.id)}</p><p>${escape(review.rationale)}</p><p>原文依据：${review.evidence.map(escape).join('；')}</p>`;
  // Put reasoning before the labelled original so it cannot pollute transcript statistics.
  return {...question,correctOptionId:review.correctOptionId,explanation:[analysis,...source.explanation]};
}
