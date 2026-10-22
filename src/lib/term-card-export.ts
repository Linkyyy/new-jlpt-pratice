import {termStudyKey,type TermCardExample,type TermIdentity} from './term-study-data';
export type TermCard=TermIdentity&{meaning:string;usage:string;referenceLevels?:string[];example?:TermCardExample};
const html=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\r?\n/g,'<br>').replace(/\t/g,' ');
export function createAnkiText(cards:readonly TermCard[],origin:string):string {
  const base=new URL(origin);if(!['http:','https:'].includes(base.protocol))throw Error('Invalid export origin');
  const lines=['#separator:tab','#html:true','#columns:Front\tBack\tTags','#tags column:3'];
  const seen=new Set<string>();
  for(const card of cards){const key=termStudyKey(card);if(seen.has(key))continue;seen.add(key);
    const front=`<b>${html(card.label)}</b><br>${html(card.reading)}<br>${html(card.pos)}`;
    const query=new URLSearchParams({kind:card.kind,entry:key}),termLink=new URL('/frequency?'+query,base.origin).href;
    const example=card.example&&/^\/practice\?/.test(card.example.path)&&!/[\\\r\n]/.test(card.example.path)?`<blockquote>${html(card.example.text)}</blockquote><a href="${html(new URL(card.example.path,base.origin).href)}">${html(card.example.label)}</a><br>`:'';
    const back=`${html(card.meaning||'释义待补充')}${card.usage?'<br>'+html(card.usage):''}<br>${example}<a href="${html(termLink)}">查看词条与原题</a><br><small>中文维基词典／站内学习释义；分级为非官方参考。词典内容 CC BY-SA 4.0。</small>`;
    const tags=['JLPT',`kind::${card.kind}`,...(card.referenceLevels??[]).map(level=>`ref::${level}`)].join(' ');
    lines.push([front,back,tags].join('\t'));
  }return lines.join('\n')+'\n';
}
/** Plain word list only. Do not claim a proprietary MOJi schema without a template. */
export function createWordListText(cards:readonly Pick<TermCard,'label'>[]):string {
  return [...new Set(cards.map(card=>card.label.normalize('NFKC').replace(/[\r\n\t]/g,' ').trim()).filter(Boolean))].join('\n')+'\n';
}
/** RFC 4180 with a UTF-8 BOM for Excel. Neutralize spreadsheet formula prefixes. */
export function createTermCsv(cards:readonly TermCard[],origin:string,locale:'zh'|'ja'|'en'='zh'):string {
  const base=new URL(origin);if(!['http:','https:'].includes(base.protocol))throw Error('Invalid export origin');
  const labels={zh:['词条','读音','类别','词性','参考等级','中文释义','用法／接续','原题例句','原题信息','原题链接','词条链接'],ja:['語句','読み','種類','品詞','参考レベル','中国語の意味','用法・接続','原文の例文','原文情報','問題リンク','語句リンク'],en:['Term','Reading','Type','Part of speech','Reference level','Chinese meaning','Usage','Source example','Source information','Question link','Term link']}[locale];
  const cell=(value:string)=>'"'+(/^[\s\uFEFF]*[=+\-@]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"';
  const seen=new Set<string>(),rows=[labels];
  for(const card of cards){const key=termStudyKey(card);if(seen.has(key))continue;seen.add(key);const example=card.example&&/^\/practice\?/.test(card.example.path)&&!/[\\\r\n]/.test(card.example.path)?card.example:undefined;
    rows.push([card.label,card.reading,card.kind,card.pos,(card.referenceLevels??[]).join(' / '),card.meaning,card.usage,example?.text??'',example?.label??'',example?new URL(example.path,base.origin).href:'',new URL('/frequency?'+new URLSearchParams({kind:card.kind,entry:key}),base.origin).href]);
  }
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
export function downloadTermBlob(blob:Blob,filename:string):void {
  const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);
}
export function downloadTermText(text:string,filename:string):void {
  downloadTermBlob(new Blob([text],{type:'text/plain;charset=utf-8'}),filename);
}
