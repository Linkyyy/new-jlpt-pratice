const normalize = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const keyFor = (kind, label, reading = '') => `${kind === 'connective' ? 'word' : kind}\t${normalize(label)}\t${kind === 'word' || kind === 'connective' ? normalize(reading) : ''}`;

export function annotateFrequencySupplements(corpus, entries, reviewed, source) {
  const index = new Map();
  // Published/verified supplements take precedence over explicitly labelled site estimates.
  for (const entry of [...entries, ...reviewed.filter(row => row.method !== 'editorial'), ...reviewed.filter(row => row.method === 'editorial')]) {
    const key = keyFor(entry.kind, entry.label, entry.reading);
    if (!index.has(key) || entry.overridesVariant && index.get(key).method === 'dictionary-variant') index.set(key, entry);
  }
  const report = {added: [], unresolved: [], totals: {}};
  corpus.referenceBasis = corpus.terms.map(([label, reading, , kind], id) => {
    const group = kind === 'connective' ? 'word' : kind;
    report.totals[group] ??= {total: 0, before: 0, addedSourced: 0, addedEstimates: 0, after: 0};
    const totals = report.totals[group]; totals.total++;
    if (corpus.referenceLevels[id]?.length) { totals.before++; totals.after++; return 'reference'; }
    const entry = index.get(keyFor(kind, label, reading));
    if (!entry) { report.unresolved.push({kind: group, label, reading, reason: 'No verified whole-word/reading reference or reviewed whole-expression estimate; paper level and component-word grades are not used.'}); return 'ungraded'; }
    if (!entry.levels.length || !entry.levels.every(level => /^N[1-5]$/.test(level))) throw new Error(`Invalid reviewed level: ${label}`);
    corpus.referenceLevels[id] = [...new Set(entry.levels)].sort();
    const basis = entry.method === 'editorial' ? 'editorial' : 'supplemental';
    totals[basis === 'editorial' ? 'addedEstimates' : 'addedSourced']++; totals.after++;
    report.added.push({kind: group, label, reading, levels: corpus.referenceLevels[id], ...entry});
    return basis;
  });
  corpus.referenceSupplementSource = source;
  return report;
}

const endings = ['込む', '出す', '始める', '終わる', '続ける', '直す', '上げる', '下げる', '合う', '返す', '切る', '抜く', '取る', '込める', 'かける', 'かかる', '忘れる', '残す', '過ぎる', 'すぎる', '通す', '去る', '回る', '付ける', 'つける', '付く', 'つく', '入れる', '入る', '立てる', '立つ', '寄せる', '寄る', '替える', '換える', '合わせる', '分ける', '重ねる', '上がる', '下がる', '戻す', '乗る', '進む', '止める', '扱う'];
const godan = {'う':'い', 'く':'き', 'ぐ':'ぎ', 'す':'し', 'つ':'ち', 'ぬ':'に', 'ぶ':'び', 'む':'み', 'る':'り'};
const nominalSuffixes = new Set(['方', '物', '者', '用', '化', '性', '内', '外', '代', '料', '店', '屋', '場', '所', '口', '先', '会', '員', '長', '品', '力', '数', '率', '学', '生', '語']);
export function annotateFrequencyCompounds(corpus, {tokenize, trustedWords}) {
  const stems = new Map(), candidates = new Map();
  for (const word of trustedWords) {
    if (!/[一-龯]/.test(word) || !/[うくぐすつぬぶむる]$/.test(word)) continue;
    const tokens = tokenize(word);
    if (tokens.length !== 1 || tokens[0].pos !== '動詞' || tokens[0].basic_form !== word) continue;
    const ending = tokens[0].conjugated_type?.includes('一段') ? '' : godan[word.at(-1)];
    if (ending === undefined) continue;
    stems.set(word.slice(0, -1) + ending, word);
  }
  for (const [stem, base] of stems) for (const ending of endings) {
    const compound = stem + ending;
    if (compound !== base && trustedWords.has(compound)) {
      candidates.set(compound, [base, ending]);
      const tokens = tokenize(compound);
      const last = tokens.at(-1);
      const suffix = last?.conjugated_type?.includes('一段') ? '' : godan[compound.at(-1)];
      if (suffix !== undefined) { const noun = compound.slice(0, -1) + suffix; if (trustedWords.has(noun)) candidates.set(noun, [base, ending]); }
    }
  }
  corpus.compounds = corpus.terms.map(([label, , pos, kind]) => {
    if (kind !== 'word' || !['名词', '动词'].includes(pos) || !trustedWords.has(label)) return false;
    if (candidates.has(label)) return true;
    if (pos === '名词') {
      for (let split = 2; split < label.length; split++) {
        const first = label.slice(0, split), last = label.slice(split);
        if (trustedWords.has(first) && (last.length >= 2 && trustedWords.has(last) || nominalSuffixes.has(last))) return true;
      }
    }
    const tokens = tokenize(label);
    if (tokens.length < 2 || tokens.some(token => !['名詞', '動詞', '形容詞'].includes(token.pos) || token.pos_detail_2 === '人名')) return false;
    const lexical = tokens.filter(token => token.pos_detail_1 !== '接尾' || nominalSuffixes.has(token.surface_form));
    return lexical.length >= 2 && lexical.every(token => trustedWords.has(token.basic_form === '*' ? token.surface_form : token.basic_form) || nominalSuffixes.has(token.surface_form));
  });
  return corpus.compounds.filter(Boolean).length;
}

/** Only dictionary-attested compound nouns; never concatenate arbitrary adjacent nouns. */
export function createCompoundMatcher(tokenize, trustedWords) {
  const patterns = new Map();
  for (const label of trustedWords) {
    if (label.length < 3 || label.length > 20 || !/[一-龯ァ-ヶ]/.test(label)) continue;
    const tokens = tokenize(label);
    if (tokens.length < 2 || tokens.some(token => token.pos !== '名詞' || ['数', '代名詞'].includes(token.pos_detail_1) || token.pos_detail_2 === '人名' || token.pos_detail_1 === '接尾' && !nominalSuffixes.has(token.surface_form))) continue;
    if (!tokens.every(token => trustedWords.has(token.surface_form) || nominalSuffixes.has(token.surface_form))) continue;
    const list = patterns.get(label[0]) ?? []; list.push(label); patterns.set(label[0], list);
  }
  for (const list of patterns.values()) list.sort((a, b) => b.length - a.length || a.localeCompare(b, 'ja'));
  return (text, tokens) => {
    const ends = new Set(tokens.map(token => token.word_position - 1 + token.surface_form.length));
    const matches = []; let usedUntil = -1;
    for (const token of tokens) {
      const at = token.word_position - 1;
      if (at < usedUntil) continue;
      const label = patterns.get(text[at])?.find(candidate => text.startsWith(candidate, at) && ends.has(at + candidate.length));
      if (label) { matches.push(label); usedUntil = at + label.length; }
    }
    return matches;
  };
}
