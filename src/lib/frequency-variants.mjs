const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hasKanji = value => /\p{Script=Han}/u.test(value);
const kanaOnly = value => /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(value);
const dictionaryPos = {名词: ['noun'], 动词: ['verb'], 形容词: ['adj', 'adj_noun'], 副词: ['adv'], 连体词: ['det', 'adnominal'], 接续词: ['conj']};

/** Explicit dictionary spelling links, exact reading and POS; never merge just
 * because two words sound alike. Both spellings must occur in the corpus. */
export function mergeFrequencyWordVariants(corpus, dictionary) {
  const existing = new Map(corpus.terms.map(([label, reading, pos, kind], id) => [`${kind}\t${label}\t${normalize(reading)}\t${pos}`, id]));
  const homophones = new Map();
  // Include dictionary senses absent from this bank too: あう must not become
  // 会う merely because 合う happens to be absent from the current corpus.
  for (const entries of Object.values(dictionary)) for (const entry of entries) {
    if (!hasKanji(entry.word)) continue;
    for (const reading of entry.readings) {
      const key = `${normalize(reading)}\t${entry.pos}`;
      if (!homophones.has(key)) homophones.set(key, new Set());
      homophones.get(key).add(entry.word);
    }
  }
  // Dictionary reading/POS fields are incomplete. Actual kanji headwords in
  // the bank also veto an ambiguous merge (e.g. みる: 見る versus 診る).
  for (const [label, reading, pos, kind] of corpus.terms) {
    if (kind !== 'word' || !hasKanji(label)) continue;
    for (const tag of dictionaryPos[pos] ?? []) {
      const key = `${normalize(reading)}\t${tag}`;
      if (!homophones.has(key)) homophones.set(key, new Set());
      homophones.get(key).add(label);
    }
  }
  const targets = corpus.terms.map((_, id) => id), groups = new Map();
  corpus.terms.forEach(([label, reading, pos, kind], id) => {
    if (kind !== 'word' || !kanaOnly(label)) return;
    const allowed = dictionaryPos[pos] ?? [];
    const candidates = (dictionary[label] ?? []).filter(entry => hasKanji(entry.word) && allowed.includes(entry.pos) && entry.readings.some(r => normalize(r) === normalize(reading)));
    const names = new Set(candidates.map(entry => entry.word));
    const alternatives = new Set(allowed.flatMap(tag => [...(homophones.get(`${normalize(reading)}\t${tag}`) ?? [])]));
    if (names.size !== 1 || alternatives.size !== 1) return;
    const canonical = [...names][0], target = existing.get(`${kind}\t${canonical}\t${normalize(reading)}\t${pos}`);
    if (target === undefined || target === id) return;
    targets[id] = target;
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push(id);
  });
  const retained = [], remap = new Map();
  targets.forEach((target, id) => { if (target === id) { remap.set(id, retained.length); retained.push(id); } });
  targets.forEach((target, id) => remap.set(id, remap.get(target)));
  const aliases = retained.map(id => groups.has(id) ? [...new Set(groups.get(id).map(alias => corpus.terms[alias][0]))] : []);
  const report = {mergedTerms: corpus.terms.length - retained.length, groups: [...groups].map(([id, variants]) => ({label: corpus.terms[id][0], reading: corpus.terms[id][1], pos: corpus.terms[id][2], aliases: variants.map(alias => corpus.terms[alias][0])}))};
  corpus.units = corpus.units.map(([field, references, counts]) => {
    const summed = new Map();
    for (let i = 0; i < counts.length; i += 2) { const id = remap.get(counts[i]); summed.set(id, (summed.get(id) ?? 0) + counts[i + 1]); }
    return [field, references, [...summed].flat()];
  });
  for (const key of ['terms', 'definitions']) if (corpus[key]) corpus[key] = retained.map(id => corpus[key][id]);
  corpus.aliases = aliases;
  corpus.summary.terms = retained.length;
  if (corpus.definitions) { const matched = corpus.definitions.filter(row => row.meaning).length; corpus.definitionSummary = {matched, missing: retained.length - matched, total: retained.length}; }
  return report;
}
