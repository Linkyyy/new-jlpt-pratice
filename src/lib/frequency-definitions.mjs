import { grammarStudyNotes, connectiveStudyNotes, wordStudyNotes } from './frequency-study-notes.mjs';
import { idiomStudyNotes } from './frequency-idioms.mjs';
import { findSupplementalWordNote } from './frequency-word-supplements.mjs';
import { simplifiedDefinition } from './frequency-simplified.mjs';
// Exact POS-specific reviews prevent homophone names/nouns from supplying
// unrelated glosses for common adverbs, verbs or adjectives.
const reviewedPosNotes = new Map([
  ['かなり\t副词', '相当；颇；很'],
  ['すすむ\t动词', '前进；进展；（时间）推进'],
  ['あんな\t连体词', '那样的；那种的'],
  ['わかい\t形容词', '年轻的；幼嫩的；经验不足的'],
  ['からっと\t副词', '干燥清爽地；晴朗地；爽快地'],
  ['とろい\t形容词', '迟钝的；动作慢的'],
  ['いくら\t副词', '多少；无论怎样……，也……'],
  ['いくら\t名词', '多少；多少钱；价钱'],
  ['たま\t副词', '偶尔；很少，常见「たまに」'],
  ['いかん\t副词', '如何；怎样，常见「いかんともしがたい」（无可奈何）'],
  ['かく\t副词', '如此；这样，见于书面语或古典表达'],
  ['かなり\t名词', '相当的程度；颇多'],
]);
const posNames = {名词: ['noun', 'name', 'proper-noun'], 动词: ['verb'], 形容词: ['adj', 'adj_noun'], 副词: ['adv'], 连体词: ['det', 'adnominal'], 接续词: ['conj', 'phrase']};

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
    const reviewed = kind === 'word' && reading === label && reviewedPosNotes.get(`${label}\t${pos}`);
    if (reviewed) return {meaning: reviewed, usage: '', source: 'editorial'};
    const authored = kind === 'idiom' ? idiomStudyNotes[label] : kind === 'grammar' ? grammarStudyNotes[label] : kind === 'connective' ? connectiveStudyNotes[label] ?? wordStudyNotes[label] : wordStudyNotes[label];
    if (authored) return authored;
    const candidates = (dictionary[label.normalize('NFKC')] ?? []).filter(entry => (!entry.readings.length || !reading || entry.readings.includes(reading)) && (pos === '名词' || !['name', 'proper-noun'].includes(entry.pos)));
    const score = entry => (entry.readings.includes(reading) ? 12 : 0) + (posNames[pos]?.includes(entry.pos) ? 8 : 0) + (entry.word === label ? 3 : 0) + (entry.pos === 'unknown' ? -1 : 0);
    candidates.sort((a, b) => score(b) - score(a));
    const senses = candidates.filter(entry => /^[ぁ-ゖー]+$/.test(label) && posNames[pos]?.includes(entry.pos) && !['name','proper-noun'].includes(entry.pos))
      .map(entry => ({word:entry.word,meaning:simplifiedDefinition([...new Set(entry.glosses.map(cleanGloss).filter(Boolean))].join('；')).slice(0,400)})).filter(sense=>sense.meaning);
    const uniqueSenses=[...new Map(senses.map(sense=>[`${sense.word}:${sense.meaning}`,sense])).values()];
    if(new Set(uniqueSenses.map(sense=>sense.word)).size>1)return {meaning:uniqueSenses.map(sense=>`${sense.word}：${sense.meaning}`).join('；').slice(0,1600),usage:'同音词的可能义项，请结合原题核对，不自动判定当前句子的含义。',source:'wiktionary',senses:uniqueSenses.slice(0,8)};
    for (const entry of candidates) {
      const meaning = [...new Set(entry.glosses.map(cleanGloss).filter(Boolean))].join('；').slice(0, 1600);
      if (meaning) return {meaning, usage: '', source: 'wiktionary', word: entry.word};
    }
    if (kind === 'word' || kind === 'connective') {
      const supplemental = findSupplementalWordNote(label, reading);
      if (supplemental) return supplemental;
    }
    return {meaning: '', usage: '', source: 'missing'};
  }).map(definition => ({...definition, meaning: simplifiedDefinition(definition.meaning), usage: simplifiedDefinition(definition.usage)}));
  const matched = corpus.definitions.filter(item => item.meaning).length;
  corpus.definitionSummary = {matched, missing: corpus.terms.length - matched, total: corpus.terms.length};
  return corpus;
}
