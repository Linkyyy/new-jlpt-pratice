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
  corpus.referenceLevels = corpus.terms.map(([word, reading, , kind], id) => {
    if (kind === 'grammar') return [...(expressionIndex.get(`grammar\t${normalize(word)}`) ?? [])].sort();
    const levels = new Set(index.get(`${normalize(word)}\t${normalize(reading)}`) ?? []);
    if (kind === 'word') for (const alias of corpus.aliases?.[id] ?? []) {
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
  return corpus;
}

/** Fallback requested by the site owner, based on the full imported bank, never
 * the currently selected filters or component-word levels. Existing grades win. */
export function annotateFrequencyOccurrenceLevels(corpus) {
  const presence = new Map();
  const keyFor = ([word, reading, , kind]) => `${kind === 'connective' ? 'word' : kind}\t${normalize(word)}\t${normalize(reading)}`;
  for (const [, references, counts] of corpus.units) {
    const levels = new Set(references.map(id => corpus.questions[id]).filter(q => q[1] === 'imported').map(q => q[2]));
    for (let i = 0; i < counts.length; i += 2) {
      const key = keyFor(corpus.terms[counts[i]]);
      if (!presence.has(key)) presence.set(key, new Set());
      for (const level of levels) presence.get(key).add(level);
    }
  }
  const added = [];
  corpus.referenceLevels ??= corpus.terms.map(() => []);
  corpus.referenceBasis ??= corpus.terms.map((_, id) => corpus.referenceLevels[id]?.length ? 'reference' : 'ungraded');
  corpus.terms.forEach(([label, reading, , kind], id) => {
    if (!['word', 'connective', 'grammar'].includes(kind) || corpus.referenceLevels[id]?.length) return;
    const levels = [...(presence.get(keyFor(corpus.terms[id])) ?? [])];
    if (levels.length !== 1 || !['N1', 'N2', 'N3'].includes(levels[0])) return;
    corpus.referenceLevels[id] = levels; corpus.referenceBasis[id] = 'occurrence';
    added.push({kind: kind === 'connective' ? 'word' : kind, label, reading, levels, method: 'imported-bank-single-level'});
  });
  return {rule: 'Only ungraded words/grammar appearing exclusively at exactly one of N1/N2/N3 in the entire imported bank; other grades and cross-level entries remain unchanged.', added, counts: Object.fromEntries(['N1', 'N2', 'N3'].map(level => [level, added.filter(row => row.levels[0] === level).length]))};
}
