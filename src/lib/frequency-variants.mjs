import {applyFrequencyMerges} from './frequency-duplicates.mjs';

const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hasKanji = value => /\p{Script=Han}/u.test(value);
const kanaOnly = value => /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(value);
const dictionaryPos = {名词: ['noun'], 动词: ['verb'], 形容词: ['adj', 'adj_noun'], 副词: ['adv'], 连体词: ['det', 'adnominal'], 接续词: ['conj']};

/** Explicit dictionary spelling links, exact reading and POS; never merge just
 * because two words sound alike. Both spellings must occur in the corpus. */
export function mergeFrequencyWordVariants(corpus, dictionary, reviewed = []) {
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
  const targets = corpus.terms.map((_, id) => id);
  const root = id => targets[id] === id ? id : (targets[id] = root(targets[id]));
  const join = (source, target) => { targets[root(source)] = root(target); };
  corpus.terms.forEach(([label, reading, pos, kind], id) => {
    if (kind !== 'word' || !kanaOnly(label)) return;
    const allowed = dictionaryPos[pos] ?? [];
    const candidates = (dictionary[label] ?? []).filter(entry => hasKanji(entry.word) && allowed.includes(entry.pos) && entry.readings.some(r => normalize(r) === normalize(reading)));
    const names = new Set(candidates.map(entry => entry.word));
    const alternatives = new Set(allowed.flatMap(tag => [...(homophones.get(`${normalize(reading)}\t${tag}`) ?? [])]));
    if (names.size !== 1 || alternatives.size !== 1) return;
    const canonical = [...names][0], target = existing.get(`${kind}\t${canonical}\t${normalize(reading)}\t${pos}`);
    if (target === undefined || target === id) return;
    join(id, target);
  });
  // Script conversion alone is unsafe (ママ/まま, カエル/かえる). These
  // links are individually reviewed whole words, never a blanket kana fold.
  for (const entry of reviewed) {
    const ids = corpus.terms.flatMap(([label, reading, , kind], id) => kind === 'word' && entry.forms.includes(label) && normalize(reading) === normalize(entry.reading) ? [id] : []);
    if (ids.length < 2) continue;
    const canonical = ids.find(id => corpus.terms[id][0] === entry.canonical) ?? ids[0];
    for (const id of ids) join(id, canonical);
  }
  const buckets = new Map();
  targets.forEach((_, id) => { const target = root(id); if (!buckets.has(target)) buckets.set(target, []); buckets.get(target).push(id); });
  const groups = [...buckets].filter(([, ids]) => ids.length > 1).map(([canonical, ids]) => [canonical, ...ids.filter(id => id !== canonical)]);
  const report = {mergedTerms: groups.reduce((total, ids) => total + ids.length - 1, 0), groups: groups.map(([id, ...variants]) => ({label: corpus.terms[id][0], reading: corpus.terms[id][1], pos: corpus.terms[id][2], aliases: [...new Set(variants.map(alias => corpus.terms[alias][0]))]}))};
  applyFrequencyMerges(corpus, groups);
  return report;
}
