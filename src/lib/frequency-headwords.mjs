const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60));

/** Actual analyzed headwords, before a display-only kanji preference. Do not
 * borrow a spelling-dependent JLPT grade from a newly introduced display form. */
export function frequencySourceHeadwords(corpus, id) {
  return frequencySourceHeadwordGroups(corpus, id).flat();
}

export function frequencySourceHeadwordGroups(corpus, id) {
  return corpus.sourceHeadwords?.[id] ?? [[corpus.terms[id][0], ...(corpus.aliases?.[id] ?? [])]];
}

/** Only explicitly reviewed whole-word mappings; readings and every original
 * POS must agree. Never choose a kanji on the strength of its reading alone. */
export function preferFrequencyHeadwords(corpus, entries) {
  const changes = [];
  corpus.terms.forEach((term, id) => {
    const [label, reading, pos, kind] = term;
    if (!['word', 'connective'].includes(kind) || /\p{Script=Han}/u.test(label)) return;
    const poses = corpus.partsOfSpeech?.[id] ?? [pos];
    const entry = entries.find(row => row.forms.includes(label) && normalize(row.reading) === normalize(reading) && poses.every(p => row.pos.includes(p)));
    if (!entry) return;
    if (!/\p{Script=Han}/u.test(entry.canonical)) throw new Error(`Preferred headword lacks kanji: ${entry.canonical}`);
    const sources = frequencySourceHeadwordGroups(corpus, id);
    corpus.sourceHeadwords ??= corpus.terms.map(() => null);
    corpus.sourceHeadwords[id] = sources;
    corpus.aliases ??= corpus.terms.map(() => []);
    corpus.aliases[id] = [...new Set([label, ...(corpus.aliases[id] ?? [])])].filter(form => form !== entry.canonical);
    term[0] = entry.canonical;
    changes.push({prior: label, label: entry.canonical, reading, partsOfSpeech: poses, jmdictId: entry.jmdictId, reason: entry.reason});
  });
  return {changedHeadwords: changes.length, changes};
}
