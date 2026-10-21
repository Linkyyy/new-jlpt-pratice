import { grammarStudyNotes, connectiveStudyNotes, wordStudyNotes } from './frequency-study-notes.mjs';
import { idiomStudyNotes } from './frequency-idioms.mjs';
import { findSupplementalWordNote } from './frequency-word-supplements.mjs';
const posNames = {名词: ['noun', 'name', 'proper-noun'], 动词: ['verb'], 形容词: ['adj'], 副词: ['adv'], 连体词: ['det', 'adnominal'], 接续词: ['conj', 'phrase']};

function cleanGloss(text) {
  const lines = text.replace(/<[^>]*>/g, '').split('\n').map(line => line.trim()).filter(Boolean);
  return lines.filter(line => !/^[^【\n]{1,50}【[^】]+】$/.test(line) && !/^[自他名形副接助动動五一二三四サカラ・、 ]{1,8}$/.test(line))
    // Legacy dictionaries put Japanese POS tags before the Chinese definition.
    // Remove the tag, rather than rejecting the entire line because it contains サ.
    .map(line => line.replace(/^[?？]?[自他名代形副接助感动動五一二三四サカラナ・·.?？]+\s+/, '').trim())
    .map(line => {
      // Keep Chinese explicitly supplied in a source's variant gloss, not the
      // Japanese cross-reference itself (e.g. 住む (“栖息”)的另一種寫法).
      if (!/(?:另一[種种](?:[寫写]法|拼[寫写]法)|之同[義义][詞词]|[縮缩][寫写])/.test(line)) return line;
      const quoted = line.match(/[“「]([^”」]+)[”」]/)?.[1];
      return quoted && /\p{Script=Han}/u.test(quoted) && !/[ぁ-ゖァ-ヺ]/.test(quoted) ? quoted : line;
    })
    .filter(line => !/[ぁ-ゖァ-ヺ]/.test(line) || /[，；：]|表示|比喻|用于|用於|\[接|【用/.test(line)).join('；').trim();
}
export function annotateFrequencyCorpus(corpus, dictionary) {
  corpus.definitions = corpus.terms.map(([label, reading, pos, kind]) => {
    const authored = kind === 'idiom' ? idiomStudyNotes[label] : kind === 'grammar' ? grammarStudyNotes[label] : kind === 'connective' ? connectiveStudyNotes[label] ?? wordStudyNotes[label] : wordStudyNotes[label];
    if (authored) return authored;
    const candidates = (dictionary[label.normalize('NFKC')] ?? []).filter(entry => !entry.readings.length || !reading || entry.readings.includes(reading));
    const score = entry => (entry.readings.includes(reading) ? 12 : 0) + (posNames[pos]?.includes(entry.pos) ? 8 : 0) + (entry.word === label ? 3 : 0) + (entry.pos === 'unknown' ? -1 : 0);
    candidates.sort((a, b) => score(b) - score(a));
    for (const entry of candidates) {
      const meaning = [...new Set(entry.glosses.map(cleanGloss).filter(Boolean))].join('；').slice(0, 1600);
      if (meaning) return {meaning, usage: '', source: 'wiktionary', word: entry.word};
    }
    if (kind === 'word' || kind === 'connective') {
      const supplemental = findSupplementalWordNote(label, reading);
      if (supplemental) return supplemental;
    }
    return {meaning: '', usage: '', source: 'missing'};
  });
  const matched = corpus.definitions.filter(item => item.meaning).length;
  corpus.definitionSummary = {matched, missing: corpus.terms.length - matched, total: corpus.terms.length};
  return corpus;
}
