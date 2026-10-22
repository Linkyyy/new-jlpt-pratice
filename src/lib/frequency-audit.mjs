const normalize = text => text.normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const posTags = {名词:['noun'], 动词:['verb'], 形容词:['adj','adj_noun'], 副词:['adv'], 连体词:['det','adnominal'], 接续词:['conj']};

/** Review signals, never automatic sense selection or invented JLPT grades. */
export function annotateFrequencyAudit(corpus, dictionary) {
  const summary = {total:corpus.terms.length, polysemy:0, token:0, level:0, ungraded:0, estimates:0, multipleGrades:0};
  const coverage=corpus.terms.map(()=>({occurrences:0,questions:new Set(),papers:new Set()}));
  for(const [,references,counts] of corpus.units)for(let i=0;i<counts.length;i+=2){const row=coverage[counts[i]];row.occurrences+=counts[i+1];for(const q of references){row.questions.add(q);row.papers.add(corpus.questions[q][8]);}}
  corpus.termReview = corpus.terms.map(([label,reading,pos,kind],id) => {
    const flags=[], reasons=[], definition=corpus.definitions[id], levels=corpus.referenceLevels[id] ?? [];
    const candidates=(dictionary[label] ?? []).filter(entry=>!entry.readings.length||entry.readings.some(r=>normalize(r)===normalize(reading)));
    const eligible=candidates.filter(entry=>(corpus.partsOfSpeech?.[id] ?? [pos]).some(p=>(posTags[p] ?? []).includes(entry.pos))||entry.pos==='unknown');
    if (kind==='word' && (new Set(candidates.map(entry=>entry.word)).size>1 || candidates.some(entry=>entry.glosses.length>=3))) {
      flags.push('polysemy');reasons.push('多个义项或同音词，需结合原题判断。');
    }
    if ((kind==='word'||kind==='connective') && (!definition.meaning || (candidates.length>0 && eligible.length===0 && definition.source!=='editorial'))) {
      flags.push('token');reasons.push(!definition.meaning?'缺少可靠释义，需核对分词与写法。':'词性与现有词典记录不一致，需核对原文。');
    }
    if (!levels.length || corpus.referenceBasis[id]==='editorial' || levels.length>1 || (definition.senses?.length && levels.length)) {
      flags.push('level');reasons.push(!levels.length?'缺少可靠的整词分级依据，保留未分级。':levels.length>1?'参考词表给出多个等级，暂不强行选定。':definition.senses?.length?'同音多义，参考等级需按具体词义核对。':'站内学习估级，仍需核对参考依据。');
    }
    if(!levels.length)summary.ungraded++;
    if(corpus.referenceBasis[id]==='editorial')summary.estimates++;
    if(levels.length>1)summary.multipleGrades++;
    for(const flag of flags)summary[flag]++;
    return {flags,reasons,occurrences:coverage[id].occurrences,questions:coverage[id].questions.size,papers:coverage[id].papers.size};
  });
  corpus.auditSummary=summary;
  return summary;
}
