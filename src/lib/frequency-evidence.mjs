import {frequencyText, listeningTranscript, frequencyImageSources} from './bank-frequency.mjs';

/** Plain-text offsets only: React renders the marks without injecting question HTML. */
export function frequencyExcerpt(input, forms, limit = 240) {
  const text = frequencyText(input), candidates = [...new Set(forms.map(frequencyText).filter(form=>form && (form.length>=2 || form===forms[0])))].sort((a,b) => b.length-a.length);
  const matches = [];
  for (const form of candidates) {
    let at = 0;
    while ((at = text.indexOf(form, at)) !== -1) {
      const end = at + form.length;
      if (!matches.some(m => at < m.end && end > m.start)) matches.push({start: at, end});
      at = end;
    }
  }
  matches.sort((a,b) => a.start-b.start);
  if (!matches.length) return null;
  const first = matches[0];
  let start = Math.max(0, first.start-70), end = Math.min(text.length, Math.max(start+limit,first.end));
  // Prefer a complete source sentence, within the bounded context window.
  const prior = text.slice(start,first.start).search(/[^。！？!?\n]*$/);
  start += Math.max(0,prior);
  const stop = text.slice(first.end,end).search(/[。！？!?\n]/);
  if (stop >= 0) end = first.end+stop+1;
  const prefix = start ? '…' : '', suffix = end < text.length ? '…' : '';
  return {text: prefix+text.slice(start,end).trimEnd()+suffix, matches: matches.filter(m => m.start >= start && m.end <= end).map(m => ({start:m.start-start+prefix.length,end:m.end-start+prefix.length}))};
}

export function frequencyExamplePreview(question, fields, forms) {
  const prompt = frequencyText(question.prompt), passage = fields.includes('transcript') ? listeningTranscript([...question.explanation]) : frequencyText(question.passage ?? '');
  const options = question.options.map(option => frequencyText(option.text));
  const sources = [
    ...(fields.includes('passage') || fields.includes('transcript') ? [{field: fields.includes('transcript') ? 'transcript' : 'passage', text:passage}] : []),
    ...(fields.includes('prompt') ? [{field:'prompt',text:prompt}] : []),
    ...(fields.includes('options') ? options.map((text,i) => ({field:'options',text,option:i+1})) : []),
    ...frequencyImageSources(question).filter(image => fields.includes(image.field)),
  ];
  const excerpts = sources.flatMap(source => {const excerpt=frequencyExcerpt(source.text,forms);return excerpt?[{field:source.field,...(source.option?{option:source.option}:{}),...excerpt}]:[];}).slice(0,3);
  return {prompt:prompt.slice(0,200), ...(passage ? {passage:frequencyExcerpt(passage,forms)?.text ?? passage.slice(0,240)} : {}), options: options.map(option => option.slice(0,180)), excerpts};
}
