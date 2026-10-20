import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'node:path';

export const frequencyExportLimit = 25000;
const translations = {
  zh: { title: '题库词频统计', note: '题库文本出现频率，不等于真实考查频率。', fields: ['排名', '词条', '读音', '词性', '出现次数', '覆盖题目', '覆盖场次'], results: '频率排名', summary: '查询说明', filters: '筛选条件', rows: '词条数量', date: '导出时间', empty: '没有符合条件的词条', all: '全部' },
  ja: { title: '問題集の語句頻度', note: '本文の出現頻度は、出題頻度とは異なります。', fields: ['順位', '語句', '読み', '品詞', '出現回数', '該当問題数', '該当実施回数'], results: '頻度ランキング', summary: '集計条件', filters: '絞り込み', rows: '語句数', date: '出力日時', empty: '該当する語句はありません', all: 'すべて' },
  en: { title: 'Question-bank frequencies', note: 'Text frequency does not equal exam-point frequency.', fields: ['Rank', 'Term', 'Reading', 'Part of speech', 'Occurrences', 'Questions', 'Sessions'], results: 'Frequency ranking', summary: 'Query details', filters: 'Filters', rows: 'Terms', date: 'Exported at', empty: 'No matching terms', all: 'All' },
};
const values = {
  exclusive: { all: ['全部词条（不排除低等级）','すべての語句（下位レベルも含む）','All terms (include lower levels)'], N1: ['N1 独有（N2–N5 未出现）','N1 のみ（N2〜N5 には未出現）','N1 only (absent from N2–N5)'], N2: ['N2 及以上独有（N3–N5 未出现）','N2 以上のみ（N3〜N5 には未出現）','N2 and above only (absent from N3–N5)'], N3: ['N3 及以上独有（N4–N5 未出现）','N3 以上のみ（N4〜N5 には未出現）','N3 and above only (absent from N4–N5)'], N4: ['N4 及以上独有（N5 未出现）','N4 以上のみ（N5 には未出現）','N4 and above only (absent from N5)'] },
  source: { all: ['全部题库','すべての問題集','All banks'], imported: ['用户提供题库','ユーザー提供問題集','Imported'], original: ['原创模拟题库','オリジナル模擬問題','Original'] },
  category: { all: ['全部题型','すべての分野','All categories'], vocabulary: ['词汇','語彙','Vocabulary'], grammar: ['语法','文法','Grammar'], reading: ['阅读','読解','Reading'], listening: ['听力','聴解','Listening'] },
  field: { all: ['全部题文','すべての本文','All text'], passage: ['文章','文章','Passages'], prompt: ['题干','設問','Prompts'], options: ['选项','選択肢','Options'], transcript: ['听力原文','聴解原文','Transcripts'] },
  kind: { word: ['单词','単語','Words'], grammar: ['语法表达','文法表現','Grammar expressions'], connective: ['接续表达','接続表現','Connectives'] },
  order: { occurrences: ['次数多到少','出現回数の多い順','Occurrences descending'], 'occurrences-asc': ['次数少到多','出現回数の少ない順','Occurrences ascending'], questions: ['覆盖题目优先','該当問題数順','Questions descending'], papers: ['覆盖场次优先','該当実施回数順','Sessions descending'], alphabetical: ['五十音顺序','五十音順','Japanese alphabetical order'] },
  pos: { all: ['全部词性','すべての品詞','All parts of speech'], 名词: ['名词','名詞','Noun'], 动词: ['动词','動詞','Verb'], 形容词: ['形容词','形容詞','Adjective'], 副词: ['副词','副詞','Adverb'], 连体词: ['连体词','連体詞','Adnominal'], 语法表达: ['语法表达','文法表現','Grammar expression'], 接续表达: ['接续表达','接続表現','Connective'], 接续词: ['接续词','接続詞','Conjunction'] },
};
function translated(group, value, locale) { return values[group]?.[value]?.[{ zh: 0, ja: 1, en: 2 }[locale]] ?? value; }
export function frequencyExportDescription(filters, metadata, locale = 'zh') {
  const labels = translations[locale];
  const subtype = metadata.subtypes.find(item => item.id === filters.subtype);
  const subtypeNames = { '语法选择': ['文法選択', 'Grammar choice'], '语句排序': ['文の組み立て', 'Sentence ordering'], '文章语法': ['文章の文法', 'Passage grammar'], '汉字读音': ['漢字読み', 'Kanji reading'], '汉字书写': ['漢字表記', 'Kanji writing'], '近义表达': ['言い換え', 'Synonyms'], '词语用法': ['用法', 'Usage'], '词汇填空': ['語彙穴埋め', 'Vocabulary cloze'] };
  const subtypeName = subtype ? (locale === 'zh' ? subtype.label : subtypeNames[subtype.label]?.[locale === 'ja' ? 0 : 1] ?? translated('category', subtype.category, locale)) : labels.all;
  const subtypeLabel = subtype ? [subtypeName, subtype.level, subtype.problem && `#${subtype.problem}`].filter(Boolean).join(' ') : labels.all;
  return [translated('source', filters.source, locale), filters.level === 'all' ? labels.all : filters.level, filters.period === 'all' ? labels.all : filters.period,
    ...(filters.exclusive && filters.exclusive !== 'all' ? [translated('exclusive', filters.exclusive, locale), ({ zh: '低等级对照涵盖全部题库、场次、题型和文本；非官方词汇分级', ja: '下位レベルは全問題集・実施回・分野・本文で比較。公式の語彙分類ではありません', en: 'Lower-level comparison covers all banks, sessions, categories and text; not an official vocabulary level' })[locale]] : []),
    translated('kind', filters.kind, locale), translated('category', filters.category, locale), subtypeLabel,
    translated('field', filters.field, locale), translated('pos', filters.pos, locale), translated('order', filters.order, locale),
    `min=${filters.min}`, ...(filters.q ? [`search=${filters.q}`] : [])].join(' · ');
}
function exportCells(row, locale) { return [row.rank, row.label, row.reading, translated('pos', row.pos, locale), row.occurrences, row.questions, row.papers]; }
function verifyRows(result) {
  if (result.rows.length !== result.total) throw new Error('Export requires the entire filtered result');
  if (result.total > frequencyExportLimit) throw new Error('Export result exceeds the supported size');
}
export async function createFrequencyWorkbook(result, metadata, locale = 'zh', now = new Date()) {
  verifyRows(result);
  const labels = translations[locale], book = new ExcelJS.Workbook();
  book.creator = 'JLPT Practice'; book.created = now; book.modified = now;
  const sheet = book.addWorksheet(labels.results, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = labels.fields.map((header, index) => ({ header, key: `c${index}`, width: [9, 33, 36, 20, 18, 18, 18][index] }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5144C9' } };
  sheet.getRow(1).height = 25;
  for (const row of result.rows) { const added = sheet.addRow(exportCells(row, locale)); added.alignment = { vertical: 'middle' }; }
  sheet.autoFilter = { from: 'A1', to: `G${Math.max(1, result.rows.length + 1)}` };
  sheet.columns.slice(4).forEach(column => { column.numFmt = '#,##0'; });
  const summary = book.addWorksheet(labels.summary);
  summary.columns = [{ width: 24 }, { width: 110 }];
  summary.addRows([[labels.title, 'JLPT Practice'], [labels.filters, frequencyExportDescription(result.filters, metadata, locale)], [labels.rows, result.total], [labels.date, now.toISOString()], [labels.note], ['Index revision', result.revision]]);
  summary.getColumn(2).alignment = { wrapText: true, vertical: 'top' }; summary.getRow(2).height = 65;
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function createFrequencyPdf(result, metadata, locale = 'zh', now = new Date(), fontPath = path.join(process.cwd(), 'src/data/export-fonts/NotoSansCJKjp-Regular.otf')) {
  verifyRows(result);
  const labels = translations[locale];
  const doc = new PDFDocument({ size: 'A4', margin: 34, font: fontPath, compress: true, info: { Title: labels.title, Author: 'JLPT Practice', CreationDate: now } });
  const chunks = [];
  const done = new Promise((resolve, reject) => { doc.on('data', data => chunks.push(data)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  // Attach a rejection handler immediately: a synchronous layout failure must not leave an unhandled rejection.
  done.catch(() => {});
  try {
    const widths = [30, 147, 126, 65, 65, 94];
    const headers = [labels.fields[0], labels.fields[1], labels.fields[2], labels.fields[4], labels.fields[5], labels.fields[6]];
    const left = 34, right = 561, bottom = 788;
    let page = 0, y = 0;
    function header(first = false) {
      page++;
      doc.fillColor('#202B46').fontSize(17).text(labels.title, left, 31, { width: right - left });
      doc.fillColor('#6B7280').fontSize(8).text(`JLPT Practice · ${now.toISOString().slice(0, 10)} · ${result.total} ${labels.rows}`, left, 57, { width: right - left });
      y = 79;
      if (first) {
        const description = frequencyExportDescription(result.filters, metadata, locale);
        doc.fontSize(8).text(description, left, y, { width: right - left, lineGap: 2 });
        y = doc.y + 9;
        doc.fontSize(7.5).text(labels.note, left, y, { width: right - left }); y = doc.y + 12;
      }
      doc.rect(left, y, right - left, 24).fill('#EEECFF');
      let x = left;
      headers.forEach((label, i) => { doc.fillColor('#3E376F').fontSize(8).text(label, x + 4, y + 7, { width: widths[i] - 8, lineBreak: false }); x += widths[i]; });
      y += 28;
      doc.fillColor('#7B8495').fontSize(8).text(`${page}`, left, 795, { width: right - left, align: 'right', lineBreak: false });
    }
    header(true);
    if (!result.rows.length) doc.fillColor('#6B7280').fontSize(10).text(labels.empty, left, y + 15);
    for (const row of result.rows) {
      const cells = [row.rank, row.label, row.reading, row.occurrences, row.questions, row.papers].map(String);
      doc.fontSize(8.5);
      const height = Math.max(19, ...cells.map((text, i) => doc.heightOfString(text, { width: widths[i] - 8, lineGap: 1 }) + 8));
      if (y + height > bottom) { doc.addPage(); header(); }
      if (row.rank % 2 === 0) doc.rect(left, y - 2, right - left, height).fill('#F6F7FB');
      let x = left;
      cells.forEach((text, i) => { doc.fillColor('#28324A').fontSize(8.5).text(text, x + 4, y + 2, { width: widths[i] - 8, lineGap: 1 }); x += widths[i]; });
      y += height;
    }
    doc.end();
    return await done;
  } catch (error) { doc.destroy(); throw error; }
}
