// Exact, reviewed tokenizer errors. Each replacement must still be attested by
// the source dictionary; never choose between legitimate alternative readings.
const readingCorrections = [
  ['授ける', 'さづける', 'さずける'], ['預ける', 'あづける', 'あずける'], ['厳正', 'いむただし', 'げんせい'],
  ['武勇', 'たけいさむ', 'ぶゆう'], ['図形', 'づけい', 'ずけい'],
  ['強いて', 'つよいて', 'しいて'], ['厳密', 'いむひそか', 'げんみつ'],
  ['五角形', 'ごかっけい', 'ごかくけい'], ['一杯', 'いちはい', 'いっぱい'],
  ['一泊', 'いちはく', 'いっぱく'], ['粉薬', 'こぐすり', 'こなぐすり'],
  ['一本調子', 'いっぽんぢょうし', 'いっぽんちょうし'], ['風流', 'ふりゅう', 'ふうりゅう'],
];
export function correctFrequencyReadings(corpus, dictionary) {
  const corrected = [];
  for (const term of corpus.terms) {
    if (!['word', 'connective'].includes(term[3])) continue;
    const correction = readingCorrections.find(([label, prior]) => term[0] === label && term[1] === prior);
    if (!correction) continue;
    const [label, prior, reading] = correction;
    if (!dictionary[label]?.some(entry => entry.readings.includes(reading))) throw new Error(`Unverified reading correction: ${label}`);
    term[1] = reading;
    corrected.push({label, prior, reading, source: 'frequency-dictionary'});
  }
  return corrected;
}
// Review the derived vocabulary index only; never edit source questions/answers.
export function reviewFrequencyCorpus(corpus, {trustedWords = new Set(), referenceReadings = new Set(), tokenize}) {
  const excluded = [], retained = [], remap = new Map();
  corpus.terms.forEach(([label, reading, pos, kind], id) => {
    let reason = '';
    if (kind === 'word' || kind === 'connective') {
      const definition = corpus.definitions?.[id];
      if (/^[ー々〆・]|[〇○□■]|[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶヵ・A-Za-z0-9]/u.test(label)) reason = 'symbol_or_placeholder';
      else if (!definition?.meaning && !trustedWords.has(label)) reason = 'unverified_word_or_spelling';
      else if (!referenceReadings.has(`${label}\t${reading}`) && definition?.source !== 'editorial') {
        const tokens = tokenize(label);
        // Personal/organization names are not study headwords unless the
        // reference list explicitly includes them or a study note verifies them.
        if (tokens.length === 1 && tokens[0].pos_detail_1 === '固有名詞' && ['人名', '組織'].includes(tokens[0].pos_detail_2)) reason = 'personal_or_organization_name';
      }
    }
    if (reason) excluded.push({id, label, reading, pos, kind, reason, occurrences: 0, examples: []});
    else {remap.set(id, retained.length); retained.push(id);}
  });
  const excludedById = new Map(excluded.map(row => [row.id, row]));
  const units = corpus.units.map(([field, references, counts]) => {
    const next = [];
    for (let i = 0; i < counts.length; i += 2) {
      const id = counts[i], target = remap.get(id);
      if (target !== undefined) next.push(target, counts[i + 1]);
      else {
        const review = excludedById.get(id); review.occurrences += counts[i + 1];
        for (const q of references) if (review.examples.length < 3 && !review.examples.includes(corpus.questions[q][0])) review.examples.push(corpus.questions[q][0]);
      }
    }
    return [field, references, next];
  });
  const reasons = {};
  for (const row of excluded) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
  const report = {revision: corpus.revision, excludedTerms: excluded.length, reasons,
    excluded: excluded.map(({label, reading, pos, kind, reason, occurrences, examples}) => ({label, reading, pos, kind, reason, occurrences, examples}))};
  for (const key of ['terms', 'definitions', 'referenceLevels']) if (corpus[key]) corpus[key] = retained.map(id => corpus[key][id]);
  corpus.units = units;
  corpus.summary.terms = retained.length;
  corpus.qualitySummary = {excludedTerms: excluded.length, reasons};
  if (corpus.definitions) {
    const matched = corpus.definitions.filter(row => row.meaning).length;
    corpus.definitionSummary = {matched, missing: retained.length - matched, total: retained.length};
  }
  return report;
}
