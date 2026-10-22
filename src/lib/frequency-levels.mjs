import { idiomEntries } from './frequency-idioms.mjs';
import { frequencySourceHeadwords } from './frequency-headwords.mjs';
const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
/** Exact spelling AND reading prevent a homograph from inheriting another word's grade. */
export function annotateFrequencyLevels(corpus, entries, source, expressionEntries = [], expressionSource) {
  const index = new Map();
  for (const [word, reading, level] of entries) {
    const key = `${normalize(word)}\t${normalize(reading)}`;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(level);
  }
  const expressionIndex = new Map();
  for (const {kind, label, level} of expressionEntries) {
    const key = `${kind}\t${normalize(label)}`;
    if (!expressionIndex.has(key)) expressionIndex.set(key, new Set());
    expressionIndex.get(key).add(level);
  }
  corpus.referenceLevels = corpus.terms.map(([word, reading, pos, kind], id) => {
    // The N5 list's adverb よく must not grade the homonymous noun 欲.
    if (word === 'よく' && reading === 'よく' && (corpus.partsOfSpeech?.[id] ?? [pos]).every(value => value === '名词') && kind === 'word') return [];
    if (kind === 'grammar') return [...(expressionIndex.get(`grammar\t${normalize(word)}`) ?? [])].sort();
    const forms = ['word', 'connective'].includes(kind) ? frequencySourceHeadwords(corpus, id) : [word];
    const levels = new Set();
    for (const alias of forms) {
      for (const level of index.get(`${normalize(alias)}\t${normalize(reading)}`) ?? []) levels.add(level);
    }
    if (kind === 'idiom') {
      // Only aliases of the complete idiom may inherit its level, never its words.
      for (const form of idiomEntries.find(entry => entry.label === word)?.forms ?? []) {
        for (const level of index.get(`${normalize(form)}\t${normalize(reading)}`) ?? []) levels.add(level);
      }
      for (const level of expressionIndex.get(`idiom\t${normalize(word)}`) ?? []) levels.add(level);
    }
    return [...levels].sort();
  });
  corpus.referenceSource = source;
  if (expressionSource) corpus.referenceExpressionSource = expressionSource;
  corpus.referenceEvidence = corpus.terms.map(([word,reading,,kind],id) => {
    if(!corpus.referenceLevels[id].length)return [];
    const evidence=[];
    const forms=kind==='idiom'?(idiomEntries.find(entry=>entry.label===word)?.forms??[word]):frequencySourceHeadwords(corpus,id);
    const wordLevels=new Set(forms.flatMap(form=>[...(index.get(`${normalize(form)}\t${normalize(reading)}`) ?? [])]));
    if(kind!=='grammar' && wordLevels.size)evidence.push({...source,levels:[...wordLevels].sort(),method:'exact-word-reading',...(corpus.sourceHeadwords?.[id] ? {headwords:forms.filter(form=>index.has(`${normalize(form)}\t${normalize(reading)}`))} : {})});
    const expressionLevels=expressionIndex.get(`${kind}\t${normalize(word)}`);
    if(expressionLevels?.size && expressionSource)evidence.push({...expressionSource,levels:[...expressionLevels].sort(),method:'whole-expression'});
    return evidence;
  });
  return corpus;
}
