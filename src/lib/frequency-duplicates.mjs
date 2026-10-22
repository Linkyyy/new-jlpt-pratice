const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** One displayed headword per spelling/reading, with all POS and senses retained.
 * This is display aggregation, not a claim that homonymous senses are identical. */
export function mergeFrequencyDuplicateWords(corpus) {
  const buckets = new Map();
  corpus.terms.forEach((term, id) => {
    if (!['word', 'connective'].includes(term[3])) return;
    const key = `${term[0].normalize('NFKC')}\t${normalize(term[1])}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
  });
  const groups = [...buckets.values()].filter(ids => ids.length > 1);
  const report = {groups: groups.length, removedRows: groups.reduce((total, ids) => total + ids.length - 1, 0), merged: groups.map(ids => ({label: corpus.terms[ids[0]][0], reading: corpus.terms[ids[0]][1], partsOfSpeech: ids.map(id => corpus.terms[id][2]), originalRows: ids.length})), retainedAmbiguous: []};
  applyFrequencyMerges(corpus, groups);
  return report;
}

/** Apply disjoint groups (canonical ID first) to every aligned annotation. */
export function applyFrequencyMerges(corpus, groups) {
  const targets = corpus.terms.map((_, id) => id), merged = new Map();
  for (const ids of groups) { merged.set(ids[0], ids); for (const id of ids) targets[id] = ids[0]; }
  const retained = targets.map((target, id) => target === id ? id : -1).filter(id => id !== -1);
  const indices = new Map(retained.map((id, index) => [id, index]));
  const remap = targets.map(id => indices.get(id));
  const partsOfSpeech = retained.map(id => [...new Set((merged.get(id) ?? [id]).flatMap(other => corpus.partsOfSpeech?.[other] ?? [corpus.terms[other][2]]))]);
  const aliases = retained.map(id => [...new Set((merged.get(id) ?? [id]).flatMap(other => [corpus.terms[other][0], ...(corpus.aliases?.[other] ?? [])]))].filter(label => label !== corpus.terms[id][0]));
  const definitions = corpus.definitions && retained.map(id => {
    const ids = merged.get(id) ?? [id], definitions = ids.map(other => corpus.definitions[other]);
    const first = definitions.find(definition => definition?.meaning) ?? definitions[0];
    if (ids.length === 1) return first;
    const meanings = [...new Set(definitions.map(definition => definition?.meaning).filter(Boolean))];
    const usage = [...new Set(definitions.map(definition => definition?.usage).filter(Boolean))].join('；');
    const senses = [...new Map(ids.flatMap(other => {
      const definition = corpus.definitions[other];
      return definition?.senses?.length ? definition.senses.map(sense => ({...sense, pos: sense.pos ?? corpus.terms[other][2]})) : definition?.meaning ? [{word: definition.word ?? corpus.terms[other][0], pos: corpus.terms[other][2], meaning: definition.meaning}] : [];
    }).map(sense => [`${sense.word}\t${sense.pos ?? ''}\t${sense.meaning}`, sense])).values()];
    return {...first, meaning: meanings.join('；'), usage, ...(meanings.length > 1 ? {senses} : {}), source: definitions.some(definition => definition?.source === 'editorial') ? 'editorial' : first.source};
  });
  corpus.units = corpus.units.map(([field, references, counts]) => {
    const totals = new Map();
    for (let i = 0; i < counts.length; i += 2) { const id = remap[counts[i]]; totals.set(id, (totals.get(id) ?? 0) + counts[i + 1]); }
    return [field, references, [...totals].flat()];
  });
  // Preserve aligned annotations if this pass is also used on a built index.
  for (const key of ['referenceLevels', 'compounds', 'referenceBasis']) if (corpus[key]) corpus[key] = retained.map(id => key === 'referenceLevels'
    ? [...new Set((merged.get(id) ?? [id]).flatMap(other => corpus[key][other] ?? []))].sort()
    : key === 'compounds' ? (merged.get(id) ?? [id]).some(other => corpus[key][other])
      : ['reference', 'supplemental', 'editorial', 'ungraded'].find(basis => (merged.get(id) ?? [id]).some(other => corpus[key][other] === basis)) ?? corpus[key][id]);
  if (corpus.referenceEvidence) corpus.referenceEvidence = retained.map(id => [...new Map((merged.get(id) ?? [id]).flatMap(other => corpus.referenceEvidence[other] ?? []).map(row => [JSON.stringify(row), row])).values()]);
  if (corpus.surfaceForms) corpus.surfaceForms = retained.map(id => [...new Set((merged.get(id) ?? [id]).flatMap(other => corpus.surfaceForms[other] ?? []))].sort());
  if (corpus.readingAliases) corpus.readingAliases = retained.map(id => [...new Set((merged.get(id) ?? [id]).flatMap(other => corpus.readingAliases[other] ?? []))]);
  if (corpus.termReview) {
    const coverage = retained.map(() => ({occurrences: 0, questions: new Set(), papers: new Set()}));
    for (const [, references, counts] of corpus.units) for (let i = 0; i < counts.length; i += 2) {
      const row = coverage[counts[i]]; row.occurrences += counts[i + 1];
      for (const question of references) { row.questions.add(question); row.papers.add(corpus.questions[question][8]); }
    }
    corpus.termReview = retained.map((id, index) => ({
      flags: [...new Set((merged.get(id) ?? [id]).flatMap(other => corpus.termReview[other]?.flags ?? []))],
      reasons: [...new Set((merged.get(id) ?? [id]).flatMap(other => corpus.termReview[other]?.reasons ?? []))],
      occurrences: coverage[index].occurrences, questions: coverage[index].questions.size, papers: coverage[index].papers.size,
    }));
    delete corpus.auditSummary; // Recomputed by the audit pass after aggregation.
  }
  corpus.terms = retained.map(id => {
    const term = [...corpus.terms[id]];
    if (term[3] === 'connective' && (merged.get(id) ?? []).some(other => corpus.terms[other][3] === 'word')) term[3] = 'word';
    return term;
  });
  corpus.aliases = aliases; corpus.partsOfSpeech = partsOfSpeech;
  if (definitions) {
    corpus.definitions = definitions;
    const matched = definitions.filter(definition => definition?.meaning).length;
    corpus.definitionSummary = {matched, missing: retained.length - matched, total: retained.length};
  }
  corpus.summary.terms = retained.length;
}
