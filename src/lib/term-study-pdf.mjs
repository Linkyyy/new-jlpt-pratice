import PDFDocument from 'pdfkit';
import path from 'node:path';

const labels = {
  zh: {title:'词条收藏', count:'词条数量', meaning:'中文释义', usage:'用法／接续', example:'原题例句', question:'查看原题', term:'查看词条与原题', missing:'释义待补充', note:'等级为非官方学习参考。中文释义：中文维基词典／站内学习说明；词典内容 CC BY-SA 4.0。'},
  ja: {title:'保存した語句', count:'語句数', meaning:'中国語の意味', usage:'用法・接続', example:'原文の例文', question:'原文の問題を見る', term:'語句と出典を見る', missing:'意味は未収録', note:'レベルは非公式の学習参考です。意味：中国語版ウィクショナリー／サイト内説明。辞書は CC BY-SA 4.0。'},
  en: {title:'Saved terms', count:'Terms', meaning:'Chinese meaning', usage:'Usage', example:'Source example', question:'View source question', term:'View term and sources', missing:'Definition pending', note:'Levels are unofficial study references. Definitions: Chinese Wiktionary / site study notes. Dictionary content: CC BY-SA 4.0.'},
};

/** Personal cards only: never invent occurrence counts or substitute a corpus query. */
export async function createTermStudyPdf(cards, origin, locale='zh', now=new Date(), fontPath=path.join(process.cwd(),'src/data/export-fonts/NotoSansCJKjp-Regular.otf')) {
  if (!cards.length || cards.length > 5000) throw Error('Invalid saved term count');
  const base=new URL(origin);if(!['http:','https:'].includes(base.protocol))throw Error('Invalid export origin');
  const t=labels[locale];
  const doc=new PDFDocument({size:'A4',margin:40,font:fontPath,compress:true,info:{Title:t.title,Author:'JLPT Practice',CreationDate:now}});
  const chunks=[],done=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  done.catch(()=>{});
  try {
    doc.fontSize(20).fillColor('#172033').text(t.title);
    const date=new Intl.DateTimeFormat(locale==='zh'?'zh-CN':locale,{timeZone:'Asia/Tokyo',dateStyle:'medium'}).format(now);
    doc.moveDown(0.4).fontSize(9).fillColor('#64748b').text(`${t.count}: ${cards.length} · ${date} (JST)`);
    doc.moveDown(0.5).fontSize(8).text(t.note,{lineGap:3});
    for (const [index,card] of cards.entries()) {
      if(doc.y>doc.page.height-160)doc.addPage();
      doc.moveDown(1).strokeColor('#e2e8f0').moveTo(40,doc.y).lineTo(doc.page.width-40,doc.y).stroke();
      doc.moveDown(0.5).fontSize(15).fillColor('#312e81').text(`${index+1}. ${card.label}`,{lineGap:3});
      doc.moveDown(0.2).fontSize(9).fillColor('#64748b').text([card.reading,card.pos,...card.referenceLevels??[]].filter(Boolean).join(' · '));
      doc.moveDown(0.6).fontSize(10).fillColor('#172033').text(`${t.meaning}: ${card.meaning||t.missing}`,{lineGap:4});
      if(card.usage)doc.moveDown(0.5).text(`${t.usage}: ${card.usage}`,{lineGap:4});
      const example=card.example&&/^\/practice\?/.test(card.example.path)&&!/[\\\r\n]/.test(card.example.path)?card.example:undefined;
      if(example){doc.moveDown(0.6).fontSize(9).fillColor('#64748b').text(`${t.example} · ${example.label}`);doc.moveDown(0.2).fontSize(10).fillColor('#172033').text(example.text,{lineGap:4});doc.moveDown(0.4).fontSize(9).fillColor('#4f46e5').text(t.question,{link:new URL(example.path,base.origin).href,underline:true});}
      const entry=JSON.stringify([card.kind,card.label.normalize('NFKC'),card.reading.normalize('NFKC'),card.pos]);
      doc.moveDown(0.4).fontSize(9).fillColor('#4f46e5').text(t.term,{link:new URL('/frequency?'+new URLSearchParams({kind:card.kind,entry}),base.origin).href,underline:true});
    }
    doc.end();return await done;
  } catch(error) {doc.destroy();throw error;}
}
