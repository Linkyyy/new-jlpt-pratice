const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
/** Exact spelling AND reading prevent a homograph from inheriting another word's grade. */
export function annotateFrequencyLevels(corpus, entries, source) {
  const index = new Map();
  for (const [word, reading, level] of entries) {
    const key = `${normalize(word)}\t${normalize(reading)}`;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(level);
  }
  corpus.referenceLevels = corpus.terms.map(([word, reading, , kind]) =>
    kind === 'word' || kind === 'connective' ? [...(index.get(`${normalize(word)}\t${normalize(reading)}`) ?? [])].sort() : []);
  corpus.referenceSource = source;
  return corpus;
}
