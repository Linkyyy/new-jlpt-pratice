// Official JLPT item types. Number maps apply to the current (2010+) format;
// semantic instructions take precedence, and unclassified material stays explicit.
export const officialFrequencySubtypes = [
  ['vocabulary-reading', 'vocabulary', '汉字读音', ['N1','N2','N3','N4','N5']],
  ['vocabulary-writing', 'vocabulary', '表记', ['N2','N3','N4','N5']],
  ['vocabulary-formation', 'vocabulary', '词语构成', ['N2']],
  ['vocabulary-context', 'vocabulary', '文脉规定', ['N1','N2','N3','N4','N5']],
  ['vocabulary-synonym', 'vocabulary', '近义替换', ['N1','N2','N3','N4','N5']],
  ['vocabulary-usage', 'vocabulary', '用法', ['N1','N2','N3','N4']],
  ['grammar-choice', 'grammar', '句子语法1（语法形式判断）', ['N1','N2','N3','N4','N5']],
  ['grammar-order', 'grammar', '句子语法2（句子组合）', ['N1','N2','N3','N4','N5']],
  ['grammar-passage', 'grammar', '文章语法', ['N1','N2','N3','N4','N5']],
  ['reading-short', 'reading', '内容理解（短篇）', ['N1','N2','N3','N4','N5']],
  ['reading-medium', 'reading', '内容理解（中篇）', ['N1','N2','N3','N4','N5']],
  ['reading-long', 'reading', '内容理解（长篇）', ['N1','N3']],
  ['reading-integrated', 'reading', '综合理解', ['N1','N2']],
  ['reading-thematic', 'reading', '主张理解（长篇）', ['N1','N2']],
  ['reading-information', 'reading', '信息检索', ['N1','N2','N3','N4','N5']],
  ['listening-task', 'listening', '课题理解', ['N1','N2','N3','N4','N5']],
  ['listening-point', 'listening', '要点理解', ['N1','N2','N3','N4','N5']],
  ['listening-gist', 'listening', '概要理解', ['N1','N2','N3']],
  ['listening-expression', 'listening', '发话表现', ['N3','N4','N5']],
  ['listening-response', 'listening', '即时应答', ['N1','N2','N3','N4','N5']],
  ['listening-integrated', 'listening', '综合理解', ['N1','N2']],
].map(([id, category, label, levels]) => ({id, category, label, levels}));
const official = new Map(officialFrequencySubtypes.map(item => [item.id, item]));
const numbers = {
  vocabulary: { N1: ['reading','context','synonym','usage'], N2: ['reading','writing','formation','context','synonym','usage'], N3: ['reading','writing','context','synonym','usage'], N4: ['reading','writing','context','synonym','usage'], N5: ['reading','writing','context','synonym'] },
  reading: { N1: {8:'short',9:'medium',10:'long',11:'integrated',12:'thematic',13:'information'}, N2: {10:'short',11:'medium',12:'integrated',13:'thematic',14:'information'}, N3: {4:'short',5:'medium',6:'long',7:'information'}, N4: {4:'short',5:'medium',6:'information'}, N5: {4:'short',5:'medium',6:'information'} },
  listening: { N1: ['task','point','gist','response','integrated'], N2: ['task','point','gist','response','integrated'], N3: ['task','point','gist','expression','response'], N4: ['task','point','expression','response'], N5: ['task','point','expression','response'] },
};
export function classifyFrequencySubtype(question, candidate, category, number) {
  let name;
  if (category === 'grammar') {
    if (/文章を読|文章全体/.test(candidate)) name = 'passage';
    else if (/[★☆]/.test(candidate)) name = 'order';
    else if (/文の|ぶんの/.test(candidate) || question.source === 'original') name = 'choice';
  }
  if (category === 'vocabulary') {
    for (const [pattern, subtype] of [[/読み方|よみかた/, 'reading'], [/漢字で|かんじで/, 'writing'], [/意味が最も近|意味がいちばん近|最も近い意味/, 'synonym'], [/使い方|つかいかた/, 'usage']]) {
      if (pattern.test(candidate)) { name = subtype; break; }
    }
  }
  if (category === 'reading') {
    if (/情報検索|情報を探/.test(candidate)) name = 'information';
    else if (/主張理解/.test(candidate)) name = 'thematic';
    else if (/AとB|ＡとＢ|総合理解/.test(candidate)) name = 'integrated';
    else if (/短文|短編/.test(candidate)) name = 'short';
    else if (/中文|中編/.test(candidate)) name = 'medium';
    else if (/長文|長編/.test(candidate)) name = 'long';
  }
  if (category === 'listening') {
    if (/課題理解/.test(candidate)) name = 'task';
    else if (/ポイント理解/.test(candidate)) name = 'point';
    else if (/概要理解|全体としてどんな内容/.test(candidate)) name = 'gist';
    else if (/統合理解|長めの話/.test(candidate)) name = 'integrated';
    else if (/発話表現|やじるし|矢印/.test(candidate)) name = 'expression';
    else if (/即時応答|それに対する返事/.test(candidate)) name = 'response';
  }
  if (!name && question.source !== 'original' && number) {
    name = category === 'reading' ? numbers.reading[question.level]?.[number] : numbers[category]?.[question.level]?.[Number(number) - 1];
  }
  const subtype = official.get(`${category}-${name}`);
  if (subtype && subtype.levels.includes(question.level)) return subtype;
  return {id: `${category}-other`, category, label: `${question.category}（未分类）`};
}
