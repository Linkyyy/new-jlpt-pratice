import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { defaultFrequencyPdfOptions } from './frequency-pdf-options.mjs';

export const frequencyExportLimit = 25000;
const translations = {
  zh: { title: '题库词频统计', note: '题库文本出现频率，不等于真实考查频率。', fields: ['排名', '词条', '读音', '词性', '出现次数', '覆盖题目', '覆盖场次'], results: '频率排名', summary: '查询说明', filters: '筛选条件', rows: '词条数量', date: '导出时间', empty: '没有符合条件的词条', all: '全部' },
  ja: { title: '問題集の語句頻度', note: '本文の出現頻度は、出題頻度とは異なります。', fields: ['順位', '語句', '読み', '品詞', '出現回数', '該当問題数', '該当実施回数'], results: '頻度ランキング', summary: '集計条件', filters: '絞り込み', rows: '語句数', date: '出力日時', empty: '該当する語句はありません', all: 'すべて' },
  en: { title: 'Question-bank frequencies', note: 'Text frequency does not equal exam-point frequency.', fields: ['Rank', 'Term', 'Reading', 'Part of speech', 'Occurrences', 'Questions', 'Sessions'], results: 'Frequency ranking', summary: 'Query details', filters: 'Filters', rows: 'Terms', date: 'Exported at', empty: 'No matching terms', all: 'All' },
};
const studyLabels = {
  zh: {meaning: '中文释义', usage: '用法／接续', source: '释义来源', missing: '释义待补充', editorial: '站内学习释义；具体含义请结合原题。', dictionary: '中文维基词典贡献者 · CC BY-SA 4.0', attribution: '中文词典：中文维基词典贡献者，经 Wiktextract / Kaikki.org、Nichū 整理；CC BY-SA 4.0。语法用法为站内学习说明。'},
  ja: {meaning: '中国語の意味', usage: '用法・接続', source: '意味の出典', missing: '意味は未収録', editorial: 'サイト内の学習用説明。文脈に合わせて確認してください。', dictionary: '中国語版ウィクショナリー執筆者 · CC BY-SA 4.0', attribution: '中国語辞書：中国語版ウィクショナリー執筆者、Wiktextract / Kaikki.org、Nichū。CC BY-SA 4.0。文法説明は本サイト作成。'},
  en: {meaning: 'Chinese meaning', usage: 'Usage / formation', source: 'Definition source', missing: 'Definition pending', editorial: 'Site study note; check the source question for the intended sense.', dictionary: 'Chinese Wiktionary contributors · CC BY-SA 4.0', attribution: 'Chinese dictionary: Chinese Wiktionary contributors, Wiktextract / Kaikki.org and Nichū; CC BY-SA 4.0. Grammar notes are site-authored.'},
};
const values = {
  exclusive: { all: ['全部词条（不排除低等级）','すべての語句（下位レベルも含む）','All terms (include lower levels)'], N1: ['N1 独有（N2–N5 未出现）','N1 のみ（N2〜N5 には未出現）','N1 only (absent from N2–N5)'], N2: ['N2 及以上独有（N3–N5 未出现）','N2 以上のみ（N3〜N5 には未出現）','N2 and above only (absent from N3–N5)'], N3: ['N3 及以上独有（N4–N5 未出现）','N3 以上のみ（N4〜N5 には未出現）','N3 and above only (absent from N4–N5)'], N4: ['N4 及以上独有（N5 未出现）','N4 以上のみ（N5 には未出現）','N4 and above only (absent from N5)'] },
  source: { all: ['全部题库','すべての問題集','All banks'], imported: ['用户提供题库','ユーザー提供問題集','Imported'], original: ['原创模拟题库','オリジナル模擬問題','Original'] },
  category: { all: ['全部题型','すべての分野','All categories'], vocabulary: ['词汇','語彙','Vocabulary'], grammar: ['语法','文法','Grammar'], reading: ['阅读','読解','Reading'], listening: ['听力','聴解','Listening'] },
  field: { all: ['全部题文','すべての本文','All text'], passage: ['文章','文章','Passages'], prompt: ['题干','設問','Prompts'], options: ['选项','選択肢','Options'], transcript: ['听力原文','聴解原文','Transcripts'] },
  kind: { idiom: ['惯用句','慣用句','Idioms'], word: ['单词','単語','Words'], grammar: ['语法表达','文法表現','Grammar expressions'], connective: ['接续表达','接続表現','Connectives'] },
  order: { occurrences: ['次数多到少','出現回数の多い順','Occurrences descending'], 'occurrences-asc': ['次数少到多','出現回数の少ない順','Occurrences ascending'], questions: ['覆盖题目多到少','該当問題数の多い順','Questions descending'], 'questions-asc': ['覆盖题目少到多','該当問題数の少ない順','Questions ascending'], papers: ['覆盖场次多到少','該当実施回数の多い順','Sessions descending'], 'papers-asc': ['覆盖场次少到多','該当実施回数の少ない順','Sessions ascending'], alphabetical: ['五十音顺序','五十音順','Japanese alphabetical order'], 'alphabetical-desc': ['五十音倒序','五十音の逆順','Japanese alphabetical descending'] },
  pos: { 复合词: ['复合词','複合語','Compound words'], 惯用句: ['惯用句','慣用句','Idiom'], all: ['全部词性','すべての品詞','All parts of speech'], 名词: ['名词','名詞','Noun'], 动词: ['动词','動詞','Verb'], 形容词: ['形容词','形容詞','Adjective'], 副词: ['副词','副詞','Adverb'], 连体词: ['连体词','連体詞','Adnominal'], 语法表达: ['语法表达','文法表現','Grammar expression'], 接续表达: ['接续表达','接続表現','Connective'], 接续词: ['接续词','接続詞','Conjunction'] },
};
function translated(group, value, locale) { return values[group]?.[value]?.[{ zh: 0, ja: 1, en: 2 }[locale]] ?? value; }
export function frequencyExportDescription(filters, metadata, locale = 'zh') {
  const labels = translations[locale];
  const subtype = metadata.subtypes.find(item => item.id === filters.subtype);
  const subtypeNames = { '句子语法1（语法形式判断）': ['文の文法1（文法形式の判断）', 'Sentence grammar 1 (grammar form)'], '句子语法2（句子组合）': ['文の文法2（文の組み立て）', 'Sentence grammar 2 (sentence composition)'], '文章语法': ['文章の文法', 'Text grammar'], '汉字读音': ['漢字読み', 'Kanji reading'], '表记': ['表記', 'Orthography'], '词语构成': ['語形成', 'Word formation'], '文脉规定': ['文脈規定', 'Contextual meaning'], '近义替换': ['言い換え類義', 'Paraphrases and synonyms'], '用法': ['用法', 'Usage'], '内容理解（短篇）': ['内容理解（短文）', 'Content comprehension (short)'], '内容理解（中篇）': ['内容理解（中文）', 'Content comprehension (medium)'], '内容理解（长篇）': ['内容理解（長文）', 'Content comprehension (long)'], '综合理解': ['統合理解', 'Integrated comprehension'], '主张理解（长篇）': ['主張理解（長文）', 'Thematic comprehension (long)'], '信息检索': ['情報検索', 'Information search'], '课题理解': ['課題理解', 'Task-based comprehension'], '要点理解': ['ポイント理解', 'Point comprehension'], '概要理解': ['概要理解', 'Gist comprehension'], '发话表现': ['発話表現', 'Verbal expressions'], '即时应答': ['即時応答', 'Quick response'] };
  const subtypeName = subtype ? (locale === 'zh' ? subtype.label : subtypeNames[subtype.label]?.[locale === 'ja' ? 0 : 1] ?? translated('category', subtype.category, locale)) : labels.all;
  const subtypeLabel = subtype ? [subtypeName, subtype.level, subtype.problem && `#${subtype.problem}`].filter(Boolean).join(' ') : labels.all;
  return [translated('source', filters.source, locale), filters.level === 'all' ? labels.all : filters.level, filters.period === 'all' ? labels.all : filters.period,
    ...(filters.grade && filters.grade !== 'all' ? [`${referenceLabel(locale)}: ${filters.grade === 'ungraded' ? ungradedLabel(locale) : filters.grade}`] : []),
    ...(filters.exclusive && filters.exclusive !== 'all' ? [translated('exclusive', filters.exclusive, locale), ({ zh: '低等级对照涵盖全部题库、场次、题型和文本；非官方词汇分级', ja: '下位レベルは全問題集・実施回・分野・本文で比較。公式の語彙分類ではありません', en: 'Lower-level comparison covers all banks, sessions, categories and text; not an official vocabulary level' })[locale]] : []),
    translated('kind', filters.kind, locale), translated('category', filters.category, locale), subtypeLabel,
    translated('field', filters.field, locale), translated('pos', filters.pos, locale), translated('order', filters.order, locale),
    `min=${filters.min}`, ...(filters.q ? [`search=${filters.q}`] : [])].join(' · ');
}
function definitionSource(definition, locale) {
  const labels = studyLabels[locale];
  return definition?.source === 'wiktionary' ? `${labels.dictionary} · https://zh.wiktionary.org/wiki/${encodeURIComponent(definition.word ?? '')}` : definition?.source === 'editorial' ? labels.editorial : labels.missing;
}
const referenceLabel = locale => ({zh: '参考等级', ja: '参考レベル', en: 'Reference level'})[locale];
const ungradedLabel = locale => ({zh: '未分级', ja: '未分類', en: 'Ungraded'})[locale];
const referenceNote = locale => ({zh: '非官方参考分级；“估级”为站内复核；“暂定”为未分级词汇、语法仅在当前真题库 N1/N2/N3 中某一级出现时按该级补充。其他等级来自公开词表及整词写法核对。', ja: '非公式の参考分類。「推定」は本サイトの評価。「暫定」は未分類の語彙・文法が現在の過去問で N1/N2/N3 の唯一のレベルに出現する場合の分類。他は公開リストと表記照合によります。', en: 'Unofficial reference levels. Estimated marks site study assessments; provisional fills ungraded vocabulary/grammar appearing at only one of N1/N2/N3 in the current past-paper bank. Other grades use public lists and whole-word variants.'})[locale];
const estimateLabel = locale => ({zh: '（估级）', ja: '（推定）', en: ' (estimated)'})[locale];
const provisionalLabel = locale => ({zh: '（暂定）', ja: '（暫定）', en: ' (provisional)'})[locale];
const gradeText = (row, locale) => (row.referenceLevels?.length ? row.referenceLevels.join(' / ') : ungradedLabel(locale)) + (row.referenceBasis === 'editorial' ? estimateLabel(locale) : row.referenceBasis === 'occurrence' ? provisionalLabel(locale) : '');
const posText = (row, locale) => translated('pos', row.pos, locale) + (row.compound ? ` / ${translated('pos', '复合词', locale)}` : '');
function exportCells(row, locale) { return [row.rank, row.label, row.reading, posText(row, locale), row.occurrences, row.questions, row.papers, row.definition?.meaning || studyLabels[locale].missing, row.definition?.usage ?? '', definitionSource(row.definition, locale), gradeText(row, locale)]; }
function verifyRows(result) {
  if (result.rows.length !== result.total) throw new Error('Export requires the entire filtered result');
  if (result.total > frequencyExportLimit) throw new Error('Export result exceeds the supported size');
}
export async function createFrequencyWorkbook(result, metadata, locale = 'zh', now = new Date()) {
  verifyRows(result);
  const labels = translations[locale], book = new ExcelJS.Workbook();
  book.creator = 'JLPT Practice'; book.created = now; book.modified = now;
  const sheet = book.addWorksheet(labels.results, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [...labels.fields, studyLabels[locale].meaning, studyLabels[locale].usage, studyLabels[locale].source, referenceLabel(locale)].map((header, index) => ({ header, key: `c${index}`, width: [9, 33, 36, 20, 18, 18, 18, 65, 85, 80, 24][index] }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5144C9' } };
  sheet.getRow(1).height = 25;
  for (const row of result.rows) { const added = sheet.addRow(exportCells(row, locale)); added.alignment = { vertical: 'top', wrapText: true }; }
  sheet.autoFilter = { from: 'A1', to: `K${Math.max(1, result.rows.length + 1)}` };
  sheet.columns.slice(4, 7).forEach(column => { column.numFmt = '#,##0'; });
  const summary = book.addWorksheet(labels.summary);
  summary.columns = [{ width: 24 }, { width: 110 }];
  summary.addRows([[labels.title, 'JLPT Practice'], [labels.filters, frequencyExportDescription(result.filters, metadata, locale)], [labels.rows, result.total], [labels.date, now.toISOString()], [labels.note], ['Index revision', result.revision]]);
  summary.addRows([[studyLabels[locale].source, studyLabels[locale].attribution], ['License', 'https://creativecommons.org/licenses/by-sa/4.0/'], ['Data & modifications', 'https://github.com/Linkyyy/new-jlpt-pratice/tree/main/src/data/frequency-dictionary']]);
  if (metadata.referenceSource) summary.addRows([[referenceLabel(locale), `${metadata.referenceSource.name} · ${metadata.referenceSource.url} · ${metadata.referenceSource.license} · ${metadata.referenceSource.revision}`], [referenceNote(locale)]]);
  if (metadata.referenceExpressionSource) summary.addRows([[referenceLabel(locale), `${metadata.referenceExpressionSource.name} · ${metadata.referenceExpressionSource.url} · ${metadata.referenceExpressionSource.license} · ${metadata.referenceExpressionSource.revision} · draft / nonofficial`]]);
  if (metadata.referenceSupplementSource) summary.addRows([[referenceLabel(locale), `${metadata.referenceSupplementSource.name} · ${metadata.referenceSupplementSource.url} · ${metadata.referenceSupplementSource.revision}`]]);
  summary.getColumn(2).alignment = { wrapText: true, vertical: 'top' }; summary.getRow(2).height = 65;
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function createFrequencyPdf(result, metadata, locale = 'zh', now = new Date(), fontPath = path.join(process.cwd(), 'src/data/export-fonts/NotoSansCJKjp-Regular.otf'), options = defaultFrequencyPdfOptions) {
  verifyRows(result);
  const labels = translations[locale], study = studyLabels[locale];
  const shown = new Set(options.fields), fontSize = options.fontSize, lineHeight = fontSize * 1.5;
  const doc = new PDFDocument({ size: options.paper, layout: options.orientation, margin: 34, font: fontPath, compress: true, info: { Title: labels.title, Author: 'JLPT Practice', CreationDate: now } });
  const chunks = [];
  const done = new Promise((resolve, reject) => { doc.on('data', data => chunks.push(data)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  done.catch(() => {});
  try {
    const left = 34, width = doc.page.width - 68, bottom = doc.page.height - 64;
    const metaLabel = [shown.has('reading') && labels.fields[2], shown.has('level') && referenceLabel(locale)].filter(Boolean).join(' / ');
    const columns = [
      ...(shown.has('rank') ? [{key: 'rank', label: labels.fields[0], weight: 0.65}] : []),
      {key: 'label', label: labels.fields[1], weight: 3},
      ...(metaLabel ? [{key: 'meta', label: metaLabel, weight: 3}] : []),
      ...['occurrences', 'questions', 'papers'].filter(key => shown.has(key)).map(key => ({key, label: labels.fields[{occurrences: 4, questions: 5, papers: 6}[key]], weight: 1.5})),
      ...(options.layout === 'table' ? [
        {key: 'pos', label: labels.fields[3], weight: 1.4},
        {key: 'meaning', label: study.meaning, weight: 4},
        {key: 'usage', label: study.usage, weight: 4.5},
        {key: 'source', label: study.source, weight: 4},
      ].filter(column => shown.has(column.key)) : []),
    ];
    const weights = columns.reduce((sum, column) => sum + column.weight, 0);
    const minimum = Math.min(30, width / columns.length / 2);
    columns.forEach(column => { column.width = minimum + (width - minimum * columns.length) * column.weight / weights; });
    const glyphWidths = new Map();
    // Wrap explicitly so even a very long definition can span pages without losing the table heading.
    function wrap(text, available, size = fontSize) {
      doc.fontSize(size);
      const lines = [];
      for (const paragraph of String(text ?? '').replace(/\t/g, ' ').split('\n')) {
        let line = '', measured = 0;
        for (const character of paragraph) {
          const key = `${size}:${character}`;
          if (!glyphWidths.has(key)) glyphWidths.set(key, doc.widthOfString(character));
          const next = glyphWidths.get(key);
          if (line && measured + next > available - 1) { lines.push(line); line = ''; measured = 0; }
          line += character; measured += next;
        }
        lines.push(line);
      }
      return lines;
    }
    function textLine(text, x, y, available, size = fontSize, color = '#28324A') {
      doc.fillColor(color).fontSize(size).text(text, x, y, {width: available, lineBreak: false});
    }
    let page = 0, y = 0, contentTop = 79;
    function heading() {
      const size = Math.min(9, fontSize), step = size * 1.5;
      const lines = columns.map(column => wrap(column.label, column.width - 8, size));
      const height = Math.max(...lines.map(line => line.length)) * step + 12;
      if (y + height + lineHeight + 12 > bottom) startPage(false);
      doc.rect(left, y, width, height).fill('#EEECFF');
      let x = left;
      columns.forEach((column, index) => { lines[index].forEach((line, i) => textLine(line, x + 4, y + 6 + i * step, column.width - 8, size, '#3E376F')); x += column.width; });
      y += height + 4; contentTop = y;
    }
    function startPage(table = true) {
      if (page) doc.addPage();
      page++;
      textLine(labels.title, left, 28, width, 17, '#202B46');
      textLine(`JLPT Practice · ${now.toISOString().slice(0, 10)} · ${result.total} ${labels.rows}`, left, 55, width, 8, '#6B7280');
      doc.fillColor('#7B8495').fontSize(8).text(String(page), left, doc.page.height - 48, {width, align: 'right', lineBreak: false});
      y = 79;
      if (table) heading();
    }
    function introduction(text) {
      for (const line of wrap(text, width, 7)) {
        if (y + 12 > bottom) startPage(false);
        textLine(line, left, y, width, 7, '#6B7280'); y += 11;
      }
      y += 6;
    }
    startPage(false);
    introduction(frequencyExportDescription(result.filters, metadata, locale));
    introduction(labels.note);
    introduction(study.attribution);
    if (metadata.referenceSource || metadata.referenceExpressionSource) introduction(referenceNote(locale));
    for (const source of [metadata.referenceSource, metadata.referenceExpressionSource, metadata.referenceSupplementSource].filter(Boolean)) introduction(`${referenceLabel(locale)}: ${source.name} · ${source.license} · ${source.url}`);
    heading();
    // Both table rows and full-width study notes can continue across pages, including A5/large fonts.
    function block(lines, widths, shaded) {
      const total = Math.max(...lines.map(cell => cell.length));
      let offset = 0;
      while (offset < total) {
        if (y + lineHeight + 12 > bottom) startPage();
        const count = Math.min(total - offset, Math.floor((bottom - y - 12) / lineHeight));
        const height = count * lineHeight + 12;
        if (shaded) doc.rect(left, y, width, height).fill('#F6F7FB');
        let x = left;
        lines.forEach((cell, index) => {
          for (let i = 0; i < count; i++) if (cell[offset + i]) textLine(cell[offset + i], x + 4, y + 5 + i * lineHeight, widths[index] - 8);
          x += widths[index];
        });
        y += height; offset += count;
      }
    }
    if (!result.rows.length) textLine(labels.empty, left, y + 15, width, fontSize, '#6B7280');
    for (const row of result.rows) {
      const values = {...row,
        meta: [shown.has('reading') && row.reading, shown.has('level') && gradeText(row, locale)].filter(Boolean).join(' · '),
        pos: posText(row, locale), meaning: row.definition?.meaning || study.missing,
        usage: row.definition?.usage ?? '', source: definitionSource(row.definition, locale),
      };
      const lines = columns.map(column => wrap(values[column.key], column.width - 8));
      const notes = options.layout === 'detailed' ? ['pos', 'meaning', 'usage', 'source'].filter(key => shown.has(key) && values[key]).flatMap(key => wrap(`${({pos: labels.fields[3], meaning: study.meaning, usage: study.usage, source: study.source})[key]}: ${values[key]}`, width - 8)) : [];
      const height = (Math.max(...lines.map(cell => cell.length)) + notes.length) * lineHeight + (notes.length ? 24 : 12) + 5;
      // Keep ordinary rows intact; oversized rows are split deliberately by block().
      if (height <= bottom - contentTop && y + height > bottom) startPage();
      const shaded = row.rank % 2 === 0;
      block(lines, columns.map(column => column.width), shaded);
      if (notes.length) block([notes], [width], shaded);
      y += 5;
    }
    doc.end();
    return await done;
  } catch (error) { doc.destroy(); throw error; }
}
