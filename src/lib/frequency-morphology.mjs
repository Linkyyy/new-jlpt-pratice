// Context-reviewed repairs for IPADIC's archaic analyses of modern words.
// Only match complete, contiguous source tokens: never join choices, sentences,
// substrings of a longer token, or silently rewrite the original question.
const repairs = [
  ['たまご', '卵', 'タマゴ', '名詞'],
  ['あたま', '頭', 'アタマ', '名詞'],
  ['失くし', '失くす', 'ナクス', '動詞'],
  ['しげき', '刺激', 'シゲキ', '名詞'],
  ['ばっちり', 'ばっちり', 'バッチリ', '副詞'],
  ['すなお', '素直', 'スナオ', '形容詞'],
  ['しょっき', '食器', 'ショッキ', '名詞'],
  ['とくい', '得意', 'トクイ', '形容詞'],
  ['かいしゅうする', '回収', 'カイシュウ', '名詞', 'する'],
  ['れんしゅうする', '練習', 'レンシュウ', '名詞', 'する'],
  ['きふする', '寄付', 'キフ', '名詞', 'する'],
  ['かびん', '花瓶', 'カビン', '名詞'],
  ['へんこう', '変更', 'ヘンコウ', '名詞'],
  ['とちゅう', '途中', 'トチュウ', '名詞'],
  ['あとち', '跡地', 'アトチ', '名詞'],
  ['きぼ', '規模', 'キボ', '名詞'],
  ['おうぼ', '応募', 'オウボ', '名詞'],
  ['ほいくえん', '保育園', 'ホイクエン', '名詞'],
  ['こうほ', '候補', 'コウホ', '名詞'],
  ['ちゅうすう', '中枢', 'チュウスウ', '名詞'],
  ['まぼろし', '幻', 'マボロシ', '名詞'],
  ['出ばな', '出ばな', 'デバナ', '名詞'],
  ['ほけんしょう', '保険証', 'ホケンショウ', '名詞'],
  ['にんてい', '認定', 'ニンテイ', '名詞'],
  ['にんたい', '忍耐', 'ニンタイ', '名詞'],
  ['にんそう', '人相', 'ニンソウ', '名詞'],
  ['もじ', '文字', 'モジ', '名詞'],
  ['けんしゅう', '研修', 'ケンシュウ', '名詞'],
  ['ぎんぱく', '銀箔', 'ギンパク', '名詞'],
  ['ふすま', '襖', 'フスマ', '名詞'],
  ['ふまじめ', '不真面目', 'フマジメ', '形容詞'],
  ['たらいまわし', 'たらい回し', 'タライマワシ', '名詞'],
].sort((a, b) => b[0].length - a[0].length);

export function reviewFrequencyTokens(text, tokens, record = () => {}) {
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], start = token.word_position - 1;
    let repaired = false;
    for (const [surface, label, reading, pos, tail] of repairs) {
      if (!text.startsWith(surface, start)) continue;
      const end = start + surface.length;
      let j = i;
      while (j < tokens.length && tokens[j].word_position - 1 + tokens[j].surface_form.length < end) j++;
      if (!tokens[j] || tokens[j].word_position - 1 + tokens[j].surface_form.length !== end) continue;
      const span = tokens.slice(i, j + 1);
      if (span.map(t => t.surface_form).join('') !== surface) continue;
      // Leave ordinary modern analyses intact. Repairs are limited to observed
      // false archaic conjugations or incorrect POS, not general kana aliases.
      if (span.length === 1 && token.pos === pos && !/体言接続|文語|ガル接続/.test(token.conjugated_form ?? '')) continue;
      result.push({...token, surface_form: tail ? surface.slice(0, -tail.length) : surface, basic_form: label, reading, pos, pos_detail_1: '一般', conjugated_form: '基本形', reviewed_reading: reading});
      if (tail) result.push({...token, word_position: start + surface.length - tail.length + 1, surface_form: tail, basic_form: tail, reading: 'スル', pos: '動詞', pos_detail_1: '自立', conjugated_form: '基本形'});
      record({reason: 'reviewed_lexeme', surface, label, pos});
      i = j; repaired = true; break;
    }
    if (repaired) continue;
    // 愛し求める is 愛する + 求める, not the adjective 愛しい.
    if (token.surface_form === '愛し' && token.basic_form === '愛しい' && tokens[i + 1]?.pos === '動詞') {
      result.push({...token, basic_form: '愛する', pos: '動詞', reading: 'アイシ', reviewed_reading: 'アイスル', conjugated_form: '連用形'});
      record({reason: 'reviewed_verb_context', surface: '愛し', label: '愛する', pos: '動詞'}); continue;
    }
    result.push(token);
  }
  return result;
}

export function frequencyTokenIssue(token, next) {
  // In audited sources, archaic くい is manufactured from しょくき and verb
  // contractions such as やっとくから. It must not receive 悔い's noun gloss.
  if (token.basic_form === 'くい' && token.surface_form !== 'くい') return 'unverified_archaic_adjective_fragment';
  // A bare adjective stem needs a real derivational suffix. Otherwise a fake
  // spelling such as 短遍 invents 短い and 遍い. Keep 寒さ/短すぎる/妖しげ.
  if (token.pos === '形容詞' && token.conjugated_form === 'ガル接続' &&
      !/^(?:さ|そう|げ|がる|すぎる|過ぎる|め|目)$/.test(next?.basic_form ?? '') &&
      !/^(?:がっ|がり|がら)$/.test(next?.surface_form ?? '')) return 'unsupported_adjective_stem';
  // IPADIC uses ancient noun-linking verb forms inside spurious kana choices.
  // Preserve genuine modern potential/passive forms, e.g. 摂 + れる.
  if (token.pos === '動詞' && /^体言接続特殊/.test(token.conjugated_form ?? '') &&
      !['れる', 'られる', 'せる', 'させる'].includes(next?.basic_form)) return 'unsupported_archaic_verb_fragment';
  return '';
}
export function frequencyTokenPos(token) {
  // IPADIC stores na-adjectives under 名詞; they belong with adjectives in the
  // study filter, rather than treating every nominal POS as a common noun.
  if (token.pos === '名詞' && ['ひとまず', 'なかなか', 'たっぷり', 'くよくよ', 'のんびり', 'しょんぼり'].includes(token.basic_form)) return '副词';
  return token.pos === '名詞' && token.pos_detail_1 === '形容動詞語幹' ? '形容词' :
    ({名詞: '名词', 動詞: '动词', 形容詞: '形容词', 副詞: '副词', 連体詞: '连体词'})[token.pos];
}
