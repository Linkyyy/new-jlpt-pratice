import { Converter } from 'opencc-js/t2cn';
const convert = Converter({from: 't', to: 'cn'});
/** Convert Chinese explanations only. Japanese headwords and quoted examples stay intact. */
export function simplifiedDefinition(text) {
  return text.split(/(「[^」]*」|『[^』]*』|`[^`]*`|“[^”]*”|"[^"\n]*")/g)
    .map(part => /^[「『`]/.test(part) || (/^[“"]/.test(part) && /[ぁ-ゖァ-ヺ]/.test(part)) ? part : convert(part)).join('');
}
