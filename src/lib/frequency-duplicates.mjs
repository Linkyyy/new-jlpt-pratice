const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const tags = {名词: ['noun'], 形容词: ['adj', 'adj_noun'], 副词: ['adv'], 连体词: ['det', 'adnominal']};

/** A noun/na-adjective is one lexeme. Other POS combinations require an
 * unambiguous dictionary headword; kana homonyms and verbs remain separate. */
function sameWord(a, b, dictionary) {
  if ([a[2], b[2]].some(pos => !tags[pos])) return false;
  const poses = new Set([a[2], b[2]]);
  if (poses.size === 2 && poses.has('名词') && poses.has('形容词') && /[\p{Script=Han}\p{Script=Katakana}]/u.test(a[0])) return true;
  if (a[0] === '同じ' && a[1] === 'おなじ' && [...poses].every(pos => ['连体词', '形容词'].includes(pos))) return true;
  if (a[0] === 'こんな' && [...poses].every(pos => ['连体词', '形容词'].includes(pos))) return true;
  const headwords = term => new Set((dictionary[term[0]] ?? []).filter(entry => tags[term[2]].includes(entry.pos) && entry.readings.some(reading => normalize(reading) === normalize(term[1]))).map(entry => entry.word));
  const left = headwords(a), right = headwords(b);
  return left.size === 1 && right.size === 1 && [...left][0] === [...right][0];
}

export function mergeFrequencyDuplicateWords(corpus, dictionary) {
  const buckets = new Map(), groups = [], untouched = [];
  corpus.terms.forEach((term, id) => {
    if (term[3] !== 'word') return;
    const key = `${term[0].normalize('NFKC')}\t${normalize(term[1])}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
  });
  for (const ids of buckets.values()) {
    if (ids.length < 2) continue;
    const partitions = [];
    for (const id of ids) {
      const group = partitions.find(group => group.every(other => sameWord(corpus.terms[id], corpus.terms[other], dictionary)));
      if (group) group.push(id); else partitions.push([id]);
    }
    groups.push(...partitions.filter(group => group.length > 1));
    if (partitions.length > 1) untouched.push({label: corpus.terms[ids[0]][0], reading: corpus.terms[ids[0]][1], partsOfSpeech: ids.map(id => corpus.terms[id][2]), reason: 'homonym_or_insufficient_evidence'});
  }
  const targets = corpus.terms.map((_, id) => id), merged = new Map();
  for (const ids of groups) { merged.set(ids[0], ids); for (const id of ids) targets[id] = ids[0]; }
  const retained = targets.map((target, id) => target === id ? id : -1).filter(id => id !== -1);
  const indices = new Map(retained.map((id, index) => [id, index]));
  const remap = targets.map(id => indices.get(id));
  const report = {groups: groups.length, removedRows: corpus.terms.length - retained.length, merged: groups.map(ids => ({label: corpus.terms[ids[0]][0], reading: corpus.terms[ids[0]][1], partsOfSpeech: ids.map(id => corpus.terms[id][2]), originalRows: ids.length})), retainedAmbiguous: untouched};
  const partsOfSpeech = retained.map(id => [...new Set((merged.get(id) ?? [id]).flatMap(other => corpus.partsOfSpeech?.[other] ?? [corpus.terms[other][2]]))]);
  const aliases = retained.map(id => [...new Set((merged.get(id) ?? [id]).flatMap(other => corpus.aliases?.[other] ?? []))]);
  const definitions = corpus.definitions && retained.map(id => {
    const ids = merged.get(id) ?? [id], definitions = ids.map(other => corpus.definitions[other]);
    const first = definitions.find(definition => definition?.meaning) ?? definitions[0];
    if (ids.length === 1) return first;
    const meanings = [...new Set(definitions.map(definition => definition?.meaning).filter(Boolean))];
    const usage = [...new Set(definitions.map(definition => definition?.usage).filter(Boolean))].join('；');
    return {...first, meaning: meanings.join('；'), usage, source: definitions.some(definition => definition?.source === 'editorial') ? 'editorial' : first.source};
  });
  corpus.units = corpus.units.map(([field, references, counts]) => {
    const totals = new Map();
    for (let i = 0; i < counts.length; i += 2) { const id = remap[counts[i]]; totals.set(id, (totals.get(id) ?? 0) + counts[i + 1]); }
    return [field, references, [...totals].flat()];
  });
  // Preserve aligned annotations if this pass is also used on a built index.
  for (const key of ['referenceLevels', 'compounds', 'referenceBasis']) if (corpus[key]) corpus[key] = retained.map(id => key === 'referenceLevels'
    ? [...new Set((merged.get(id) ?? [id]).flatMap(other => corpus[key][other] ?? []))].sort()
    : key === 'compounds' ? (merged.get(id) ?? [id]).some(other => corpus[key][other]) : corpus[key][id]);
  corpus.terms = retained.map(id => corpus.terms[id]);
  corpus.aliases = aliases; corpus.partsOfSpeech = partsOfSpeech;
  if (definitions) {
    corpus.definitions = definitions;
    const matched = definitions.filter(definition => definition?.meaning).length;
    corpus.definitionSummary = {matched, missing: retained.length - matched, total: retained.length};
  }
  corpus.summary.terms = retained.length;
  return report;
}
