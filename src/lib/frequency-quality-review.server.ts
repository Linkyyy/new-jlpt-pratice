import {loadFrequencyCorpus} from './bank-frequency.server';
import {requireFeedbackAdmin} from './question-feedback.server';
import {cloudJson, CloudServiceError, handleCloudRequest} from './cloud-backup.server';
import {checkApiRateLimit} from './request-limits';
import {termStudyKey} from './term-study-data';

export function listFrequencyQualityReview(request:Request) {
  return handleCloudRequest(async()=>{
    const denied=checkApiRateLimit(request,{scope:'term-quality-list',limit:30,windowSeconds:60});if(denied)return denied;
    await requireFeedbackAdmin(request);
    const params=new URL(request.url).searchParams,flag=params.get('flag')??'all',search=(params.get('q')??'').trim(),page=params.get('page')??'1';
    if(!['all','polysemy','token','level'].includes(flag)||search.length>80||!/^[1-9]\d{0,4}$/.test(page))throw new CloudServiceError(400,'复核筛选条件无效。');
    const corpus=await loadFrequencyCorpus();
    const ids=corpus.terms.flatMap(([label,reading],id)=>{const review=corpus.termReview?.[id];return review?.flags.length&&(flag==='all'||review.flags.includes(flag))&&(!search||label.includes(search)||reading.includes(search))?[id]:[];});
    ids.sort((a,b)=>Number(corpus.termReview![b].flags.includes('token'))-Number(corpus.termReview![a].flags.includes('token'))||corpus.termReview![b].occurrences-corpus.termReview![a].occurrences||a-b);
    const currentPage=Math.min(Number(page),Math.max(1,Math.ceil(ids.length/30)));
    const items=ids.slice((currentPage-1)*30,currentPage*30).map(id=>{const [label,reading,pos,rawKind]=corpus.terms[id],kind=rawKind==='connective'?'word':rawKind;return {key:termStudyKey({label,reading,pos,kind}),label,reading,pos,kind,review:corpus.termReview![id],definition:corpus.definitions?.[id],levels:corpus.referenceLevels?.[id]??[],basis:corpus.referenceBasis?.[id]??'ungraded'};});
    return cloudJson({revision:corpus.revision,summary:corpus.auditSummary,total:ids.length,page:currentPage,pages:Math.max(1,Math.ceil(ids.length/30)),items});
  });
}
