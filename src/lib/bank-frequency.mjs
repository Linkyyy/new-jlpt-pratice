import { createCompoundMatcher } from './frequency-review.mjs';
import { reviewFrequencyTokens, frequencyTokenIssue, frequencyTokenPos } from './frequency-morphology.mjs';
import { grammarExpressions, connectiveExpressions, wordStopList } from './frequency-lexicon.mjs';
import { classifyFrequencySubtype, officialFrequencySubtypes } from './frequency-subtypes.mjs';
import { createIdiomMatcher, idiomEntries } from './frequency-idioms.mjs';

export const frequencyKinds = ['word', 'grammar', 'idiom'];
export const frequencyFields = ['all', 'passage', 'prompt', 'options', 'transcript'];
export const frequencyOrders = ['occurrences', 'occurrences-asc', 'questions', 'questions-asc', 'papers', 'papers-asc', 'alphabetical', 'alphabetical-desc'];
export function frequencySort(order) {
  const metric = order.startsWith('questions') ? 'questions' : order.startsWith('papers') ? 'papers' : order.startsWith('alphabetical') ? 'label' : 'occurrences';
  const ascending = order === 'alphabetical' || order.endsWith('-asc');
  const next = metric === 'label' ? (ascending ? 'alphabetical-desc' : 'alphabetical') : `${metric}${ascending ? '' : '-asc'}`;
  return {metric, ascending, next};
}
export const frequencyLevelScopes = ['all', 'N1', 'N2', 'N3', 'N4'];
const types = { 词汇: 'vocabulary', 语法: 'grammar', 阅读: 'reading', 听力: 'listening' };
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ' };
export function frequencyText(value = '') {
  return String(value).replace(/<(script|style|rt)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_, entity) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? ' ';
      const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
    }).normalize('NFKC').replace(/[\t\r \u3000]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^(?:男|女|男性|女性|[男女][12]|M|F)\s*[:：]\s*/gm, '').trim();
}
export function frequencySubtype(question) {
  const instruction = frequencyText(question.instruction || '');
  const candidate = instruction || (question.source === 'original' ? frequencyText(question.prompt) : '');
  const number = instruction.match(/問[題题]\s*(\d+)/)?.[1];
  const category = types[question.category];
  return classifyFrequencySubtype(question, candidate, category, number);
}
/** Only the explicitly labelled Japanese transcript; never count translations or repeated copies after them. */
export function listeningTranscript(explanation) {
  const text = frequencyText(explanation.join('\n'));
  const start = /(?:听力原文|聴解原文|聴解スクリプト|スクリプト|【原文】)/.exec(text);
  if (!start) return '';
  const remaining = text.slice(start.index + start[0].length);
  const end = /(?:听力译文|聴解訳文|参考译文|中文翻译|中文译文|中文解析|中文翻譯|日本語訳|【译文】|【翻译】|【解析】|听力翻译|译文|翻译|答案解析)/.exec(remaining);
  return remaining.slice(0, end?.index ?? remaining.length).trim();
}
const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const toHiragana = text => text.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
export function frequencySearchText(text) { return toHiragana(frequencyText(text).toLowerCase()); }

function expressionInventory(rows, kind) {
  const owner = new Map();
  rows.forEach(row => row.forEach(form => {
    const prior = owner.get(form);
    if (!prior || form === row[0]) owner.set(form, { label: row[0], form, kind });
  }));
  return [...owner.values()].sort((a, b) => b.form.length - a.form.length || a.form.localeCompare(b.form, 'ja'));
}
const inventory = [...expressionInventory(grammarExpressions, 'grammar'), ...expressionInventory(connectiveExpressions, 'connective')];
const knownConnectives = new Set(connectiveExpressions.flat());
const ambiguousConnectives = new Set(['では', 'でも', 'だから', 'だけど', 'けれども', 'けれど', 'すると', 'それで']);

/** Tokenizer is a build-time dependency. This module and the deployed API never load its dictionaries. */
export function createFrequencyBuilder(tokenize, {trustedWords = new Set()} = {}) {
  const matchIdioms = createIdiomMatcher(tokenize);
  const matchCompounds = createCompoundMatcher(tokenize, trustedWords);
  const questions = [], units = [], terms = [], papers = [], subtypes = new Map();
  const termIds = new Map(), paperIds = new Map(), sharedUnits = new Map(), ids = new Set(), readings = new Map();
  let transcripts = 0, listeningQuestions = 0, excludedFragments = 0;
  const morphologyReview = new Map();
  const recordMorphology = row => {
    const key = `${row.reason}\t${row.surface}\t${row.label}\t${row.pos}`;
    if (!morphologyReview.has(key)) morphologyReview.set(key, {...row, occurrences: 0});
    morphologyReview.get(key).occurrences++;
  };
  const readingFor = label => {
    if (!readings.has(label)) readings.set(label, toHiragana(tokenize(label).map(t => t.reading && t.reading !== '*' ? t.reading : t.surface_form).join('')));
    return readings.get(label);
  };
  const termId = (label, reading, pos, kind) => {
    const key = `${kind}\t${label}\t${pos}`;
    if (!termIds.has(key)) { termIds.set(key, terms.length); terms.push([label, reading, pos, kind]); }
    return termIds.get(key);
  };
  function analyze(text) {
    const tokens = reviewFrequencyTokens(text, tokenize(text), recordMorphology), counts = new Map();
    const add = id => counts.set(id, (counts.get(id) ?? 0) + 1);
    const starts = new Set(), ends = new Set(), tokensAt = new Map();
    for (const [tokenIndex, token] of tokens.entries()) {
      tokensAt.set(token.word_position - 1, token);
      starts.add(token.word_position - 1); ends.add(token.word_position - 1 + token.surface_form.length);
      if (token.pos === '接続詞') {
        if (!knownConnectives.has(token.surface_form)) add(termId(token.surface_form, toHiragana(token.reading ?? ''), '接续词', 'connective'));
        continue;
      }
      const label = token.basic_form && token.basic_form !== '*' ? token.basic_form : token.surface_form;
      // Unknown kana runs often swallow particles or start mid-word (e.g. ょうしつのじゅんび).
      // Do not turn unrecognized source spellings/distractors into invented vocabulary.
      if (/^[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/.test(label) ||
          (token.word_type === 'UNKNOWN' && !token.reading && /[ぁ-ゖ]/.test(label) && !trustedWords.has(label))) { excludedFragments++; continue; }
      if ((label.length === 1 && kana.test(label)) || !japanese.test(label) || label.length > 40 || wordStopList.has(label) || !['名詞', '動詞', '形容詞', '副詞', '連体詞'].includes(token.pos)) continue;
      if (['数', '代名詞', '非自立', '接尾'].includes(token.pos_detail_1)) continue;
      const issue = frequencyTokenIssue(token, tokens[tokenIndex + 1]);
      if (issue) { excludedFragments++; recordMorphology({reason: issue, surface: token.surface_form, label, pos: token.pos}); continue; }
      const pos = frequencyTokenPos(token);
      if (token.pos === '名詞' && pos === '形容词') recordMorphology({reason: 'na_adjective_pos', surface: token.surface_form, label, pos: token.pos});
      add(termId(label, token.reviewed_reading ? toHiragana(token.reviewed_reading) : readingFor(label), pos, 'word'));
    }
    // Longest non-overlapping expression per kind, with morphological boundaries.
    // Do not concatenate choices or join across a sentence/paragraph boundary.
    const occupied = { grammar: [], connective: [] };
    for (const expression of inventory) {
      let from = 0, at;
      while ((at = text.indexOf(expression.form, from)) !== -1) {
        const end = at + expression.form.length; from = at + 1;
        if (!starts.has(at) || !ends.has(end) || occupied[expression.kind].some(([left, right]) => at < right && end > left)) continue;
        if (expression.kind === 'connective' && ambiguousConnectives.has(expression.form) && tokensAt.get(at)?.pos !== '接続詞' && !/(?:^|[。！？!?\n「『])\s*$/.test(text.slice(0, at))) continue;
        occupied[expression.kind].push([at, end]);
        add(termId(expression.label, readingFor(expression.label), expression.kind === 'grammar' ? '语法表达' : '接续词', expression.kind));
      }
    }
    for (const label of matchCompounds(text, tokens)) add(termId(label, readingFor(label), '名词', 'word'));
    for (const label of matchIdioms(tokens)) add(termId(label, idiomEntries.find(entry => entry.label === label)?.reading ?? readingFor(label), '惯用句', 'idiom'));
    return [...counts].flat();
  }
  function addUnit(text, field, questionIndex, shared) {
    if (!text || !japanese.test(text) || /^(?:选项\s*[1-4]|[1-4])?\s*[（(]以音频为准[）)]$|^选项\s*[1-4]\s*[（(]以音频为准[）)]$/.test(text)) return;
    const question = questions[questionIndex];
    const key = shared ? `${question[1]}:${question[2]}:${question[3]}:${question[4]}:${field}:${text}` : '';
    if (shared && sharedUnits.has(key)) { units[sharedUnits.get(key)][1].push(questionIndex); return; }
    const unit = [field, [questionIndex], analyze(text)];
    if (shared) sharedUnits.set(key, units.length);
    units.push(unit);
  }
  return {
    addQuestion(question) {
      if (ids.has(question.id)) throw new Error(`Duplicate statistics question ID: ${question.id}`);
      ids.add(question.id);
      const subtype = frequencySubtype(question); subtypes.set(subtype.id, subtype);
      const paperKey = `${question.source}:${question.level}:${question.period}`;
      if (!paperIds.has(paperKey)) { paperIds.set(paperKey, papers.length); papers.push([question.source, question.level, question.period]); }
      const index = questions.length;
      questions.push([question.id, question.source, question.level, question.period, types[question.category], subtype.id, question.sourceQuestionNumber ?? null, question.available !== false, paperIds.get(paperKey)]);
      const passage = frequencyText(question.passage ?? ''), prompt = frequencyText(question.prompt);
      addUnit(passage, 'passage', index, true);
      // Imported listening prompts are Chinese UI placeholders; never treat them as Japanese corpus.
      if (prompt !== passage && !/^(?:听力第\s*\d+\s*题|请选择第\s*\d+\s*题)/.test(prompt)) addUnit(prompt, 'prompt', index, false);
      for (const option of question.options) addUnit(frequencyText(option.text), 'options', index, false);
      if (question.category === '听力') {
        listeningQuestions++;
        const transcript = listeningTranscript(question.explanation);
        if (transcript && kana.test(transcript)) { transcripts++; addUnit(transcript, 'transcript', index, true); }
      }
    },
    finish(revision) {
      return { version: 1, revision, terms, questions, units, papers, morphologyReview: [...morphologyReview.values()], subtypes: [...subtypes.values()], summary: { questions: questions.length, papers: papers.length, units: units.length, terms: terms.length, listeningQuestions, transcripts, excludedFragments, grammarExpressions: grammarExpressions.length, idiomExpressions: idiomEntries.length } };
    },
  };
}
export const defaultFrequencyFilters = { source: 'all', level: 'all', grade: 'all', exclusive: 'all', period: 'all', category: 'all', subtype: 'all', field: 'all', kind: 'word', pos: 'all', order: 'occurrences', min: 1, max: 0, q: '', page: 1, size: 30 };
export class FrequencyInputError extends Error {}
export function parseFrequencyFilters(params, metadata) {
  const filters = { ...defaultFrequencyFilters };
  const allowed = { source: ['all', 'imported', 'original'], grade: ['all', 'ungraded', 'N1', 'N2', 'N3', 'N4', 'N5'], level: ['all', ...metadata.levels], exclusive: frequencyLevelScopes, period: ['all', ...metadata.periods], category: ['all', ...Object.values(types)], subtype: ['all', ...metadata.subtypes.map(x => x.id)], field: frequencyFields, kind: [...frequencyKinds, 'connective'], pos: ['all', '名词', '动词', '形容词', '副词', '连体词', '接续词', '复合词'], order: frequencyOrders };
  for (const [key, values] of Object.entries(allowed)) {
    if (!params.has(key)) continue;
    const value = params.get(key);
    if (!values.includes(value)) throw new FrequencyInputError('统计筛选条件无效。');
    filters[key] = value;
  }
  for (const [key, max] of [['page', 100000], ['size', 100], ['min', 100000], ['max', 100000]]) {
    if (!params.has(key)) continue;
    const value = params.get(key);
    if (!/^[1-9]\d{0,5}$/.test(value ?? '') || Number(value) > max) throw new FrequencyInputError('统计筛选条件无效。');
    filters[key] = Number(value);
  }
  if (filters.max && filters.max < filters.min) throw new FrequencyInputError('最多出现次数不能小于最少出现次数。');
  if (params.has('q')) {
    if (params.get('q').length > 80) throw new FrequencyInputError('搜索词最多 80 个字符。');
    filters.q = params.get('q').trim();
  }
  // Preserve bookmarked links to the former third tab without exposing it again.
  if (filters.kind === 'connective') { filters.kind = 'word'; filters.pos = '接续词'; }
  if (filters.grade !== 'all' && filters.source === 'original') throw new FrequencyInputError('参考分级仅适用于真题词条。');
  if (filters.subtype !== 'all' && filters.category !== 'all' && metadata.subtypes.find(x => x.id === filters.subtype)?.category !== filters.category) throw new FrequencyInputError('子题型与题目类型不一致。');
  const subtype = metadata.subtypes.find(x => x.id === filters.subtype);
  if (filters.level !== 'all' && subtype?.levels && !subtype.levels.includes(filters.level)) throw new FrequencyInputError('子题型与日语等级不一致。');
  if (filters.exclusive !== 'all') {
    const limit = Number(filters.exclusive.slice(1));
    if ((filters.level !== 'all' && Number(filters.level.slice(1)) > limit) || (subtype?.levels && !subtype.levels.some(level => Number(level.slice(1)) <= limit))) throw new FrequencyInputError('日语等级不在所选独有范围内。');
  }
  return filters;
}
export function frequencyMetadata(corpus) {
  return { version: corpus.version, revision: corpus.revision, summary: corpus.summary, ...(corpus.definitionSummary ? {definitionSummary: corpus.definitionSummary} : {}),
    referenceSource: corpus.referenceSource,
    referenceExpressionSource: corpus.referenceExpressionSource,
    referenceSupplementSource: corpus.referenceSupplementSource,
    qualitySummary: corpus.qualitySummary,
    levels: [...new Set(corpus.questions.map(q => q[2]))].sort(),
    periods: [...new Set(corpus.questions.map(q => q[3]))].sort().reverse(),
    subtypes: [...officialFrequencySubtypes, ...corpus.subtypes.filter(item => !officialFrequencySubtypes.some(official => official.id === item.id))],
  };
}
// Cache all-corpus presence once per loaded index. Lower-level comparison must
// never inherit the user's source, session, subtype, field or POS filters.
const corpusLevelPresence = new WeakMap();
function levelPresence(corpus) {
  if (corpusLevelPresence.has(corpus)) return corpusLevelPresence.get(corpus);
  const presence = new Uint8Array(corpus.terms.length);
  for (const [, references, counts] of corpus.units) {
    let levels = 0;
    for (const index of references) {
      const level = corpus.questions[index][2];
      if (/^N[1-5]$/.test(level)) levels |= 1 << (Number(level.slice(1)) - 1);
    }
    for (let i = 0; i < counts.length; i += 2) presence[counts[i]] |= levels;
  }
  // A lemma seen at a lower level is still familiar if its POS differs there.
  // Conjunctions share the word scope; grammar and idioms have separate scopes.
  const labels = new Map();
  corpus.terms.forEach((term, id) => {
    const key = `${term[3] === 'connective' ? 'word' : term[3]}\t${frequencySearchText(term[0])}`;
    labels.set(key, (labels.get(key) ?? 0) | presence[id]);
  });
  corpus.terms.forEach((term, id) => { presence[id] = labels.get(`${term[3] === 'connective' ? 'word' : term[3]}\t${frequencySearchText(term[0])}`); });
  corpusLevelPresence.set(corpus, presence);
  return presence;
}
export function queryFrequency(corpus, filters, selectedTerm, options = {}) {
  const exclusive = filters.exclusive ?? 'all';
  const limit = exclusive === 'all' ? 5 : Number(exclusive.slice(1));
  const lowerMask = 31 ^ ((1 << limit) - 1);
  const presence = exclusive === 'all' ? null : levelPresence(corpus);
  const mask = new Uint8Array(corpus.questions.length), paperIds = new Set();
  let questionCount = 0;
  corpus.questions.forEach((question, index) => {
    if (filters.grade && filters.grade !== 'all' && question[1] !== 'imported') return;
    if (exclusive !== 'all' && Number(question[2].slice(1)) > limit) return;
    if (['source', 'level', 'period', 'category', 'subtype'].some((key, n) => filters[key] !== 'all' && filters[key] !== question[n + 1])) return;
    mask[index] = 1; questionCount++; paperIds.add(question[8]);
  });
  const search = frequencySearchText(filters.q), wanted = new Uint8Array(corpus.terms.length);
  corpus.terms.forEach((term, index) => {
    const grades = corpus.referenceLevels?.[index] ?? [];
    if (filters.grade === 'ungraded' && grades.length) return;
    if (filters.grade && !['all', 'ungraded'].includes(filters.grade) && !grades.includes(filters.grade)) return;
    if (presence && (presence[index] & lowerMask)) return;
    if ((term[3] === filters.kind || (filters.kind === 'word' && term[3] === 'connective')) && (filters.kind !== 'word' || filters.pos === 'all' || (filters.pos === '复合词' ? corpus.compounds?.[index] === true : (corpus.partsOfSpeech?.[index] ?? [term[2]]).includes(filters.pos))) && (!search || frequencySearchText([term[0], term[1], ...(corpus.aliases?.[index] ?? [])].join('\n')).includes(search))) wanted[index] = 1;
  });
  const matched = new Map(); let unitCount = 0;
  for (const unit of corpus.units) {
    if (filters.field !== 'all' && filters.field !== unit[0]) continue;
    const references = unit[1].filter(id => mask[id]);
    if (!references.length) continue;
    unitCount++;
    for (let i = 0; i < unit[2].length; i += 2) {
      const id = unit[2][i]; if (!wanted[id]) continue;
      let found = matched.get(id);
      if (!found) { found = { id, occurrences: 0, questions: new Set(), papers: new Set(), fields: new Set() }; matched.set(id, found); }
      found.occurrences += unit[2][i + 1]; found.fields.add(unit[0]);
      for (const index of references) {
        found.questions.add(index); found.papers.add(corpus.questions[index][8]);
        if (id === selectedTerm) { found.locations ??= new Map(); if (!found.locations.has(index)) found.locations.set(index, new Set()); found.locations.get(index).add(unit[0]); }
      }
    }
  }
  let rows = [...matched.values()].filter(row => row.occurrences >= filters.min && (!filters.max || row.occurrences <= filters.max));
  const alphabetical = (a, b) => (corpus.terms[a.id][1] || corpus.terms[a.id][0]).localeCompare(corpus.terms[b.id][1] || corpus.terms[b.id][0], 'ja') || corpus.terms[a.id][0].localeCompare(corpus.terms[b.id][0], 'ja');
  const sort = frequencySort(filters.order);
  const metricValue = row => sort.metric === 'occurrences' ? row.occurrences : row[sort.metric].size;
  rows.sort((a, b) => (sort.metric === 'label' ? alphabetical(a, b) : metricValue(a) - metricValue(b)) * (sort.ascending ? 1 : -1) || b.occurrences - a.occurrences || alphabetical(a, b));
  const total = rows.length, totalOccurrences = rows.reduce((n, row) => n + row.occurrences, 0);
  const page = options.allRows ? 1 : Math.min(filters.page, Math.max(1, Math.ceil(total / filters.size)));
  const shape = row => ({ aliases: corpus.aliases?.[row.id] ?? [], id: row.id, label: corpus.terms[row.id][0], reading: corpus.terms[row.id][1], pos: corpus.terms[row.id][2], occurrences: row.occurrences, questions: row.questions.size, papers: row.papers.size,
    partsOfSpeech: corpus.partsOfSpeech?.[row.id] ?? [corpus.terms[row.id][2]],
    referenceLevels: corpus.referenceLevels?.[row.id] ?? [],
    referenceBasis: corpus.referenceBasis?.[row.id] ?? 'reference', compound: corpus.compounds?.[row.id] ?? false,
    definition: corpus.definitions?.[row.id] ?? {meaning: '', usage: '', source: 'missing'},
  });
  const selected = selectedTerm === undefined ? null : rows.find(row => row.id === selectedTerm);
  let detail = null;
  if (selected) {
    const paperCounts = new Map();
    for (const index of selected.questions) { const paperId = corpus.questions[index][8]; paperCounts.set(paperId, (paperCounts.get(paperId) ?? 0) + 1); }
    const comparePapers = (a, b) => corpus.papers[b][2].localeCompare(corpus.papers[a][2]) || corpus.papers[a][1].localeCompare(corpus.papers[b][1]) || corpus.papers[a][0].localeCompare(corpus.papers[b][0]);
    const references = [...selected.questions].filter(index => options.examplePaper === undefined || corpus.questions[index][8] === options.examplePaper)
      .sort((a, b) => comparePapers(corpus.questions[a][8], corpus.questions[b][8]) || corpus.questions[a][4].localeCompare(corpus.questions[b][4]) || (corpus.questions[a][6] ?? 0) - (corpus.questions[b][6] ?? 0) || a - b);
    const exampleSize = options.exampleSize ?? 20;
    const examplePage = Math.min(options.examplePage ?? 1, Math.max(1, Math.ceil(references.length / exampleSize)));
    detail = { ...shape(selected), exampleTotal: references.length, examplePage, exampleSize,
      sourcePapers: [...paperCounts.keys()].sort(comparePapers).map(id => ({ id, source: corpus.papers[id][0], level: corpus.papers[id][1], period: corpus.papers[id][2], questions: paperCounts.get(id) })),
      examples: references.slice((examplePage - 1) * exampleSize, examplePage * exampleSize).map(index => {
        const q = corpus.questions[index];
        return { id: q[0], source: q[1], level: q[2], period: q[3], category: q[4], subtype: q[5], number: q[6] ?? (q[1] === 'original' ? Number(q[0].match(/-(\d+)$/)?.[1]) || null : null), available: q[7], fields: [...(selected.locations?.get(index) ?? [])] };
      }) };
  }
  return { revision: corpus.revision, filters: { ...filters, page }, total, totalOccurrences, questionCount, paperCount: paperIds.size, unitCount,
    rows: (options.allRows ? rows : rows.slice((page - 1) * filters.size, page * filters.size)).map((row, index) => ({ ...shape(row), rank: (page - 1) * filters.size + index + 1 })), detail,
  };
}
export function parseFrequencyDetailOptions(params, corpus) {
  const options = {};
  for (const [key, max] of [['examplePage', 100000], ['exampleSize', 50]]) {
    if (!params.has(key)) continue;
    const value = params.get(key);
    if (!/^[1-9]\d{0,5}$/.test(value ?? '') || Number(value) > max) throw new FrequencyInputError('统计筛选条件无效。');
    options[key] = Number(value);
  }
  if (params.has('examplePaper')) {
    const value = params.get('examplePaper');
    if (!/^\d{1,6}$/.test(value ?? '') || Number(value) >= corpus.papers.length) throw new FrequencyInputError('统计筛选条件无效。');
    options.examplePaper = Number(value);
  }
  return options;
}
