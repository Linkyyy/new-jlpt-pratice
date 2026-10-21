import { idiomEntries } from './frequency-idioms.mjs';
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
  corpus.referenceLevels = corpus.terms.map(([word, reading, , kind]) => {
    if (kind === 'grammar') return [...(expressionIndex.get(`grammar\t${normalize(word)}`) ?? [])].sort();
    const levels = new Set(index.get(`${normalize(word)}\t${normalize(reading)}`) ?? []);
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
  return corpus;
}
