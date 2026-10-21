import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import metadata from '@/data/bank-frequency/manifest.json';
import type { TermIdentity } from './term-study-data';
import type { FrequencyCorpus } from './bank-frequency.mjs';

let pending: Promise<FrequencyCorpus> | undefined;
export function loadFrequencyCorpus(): Promise<FrequencyCorpus> {
  if (!pending) pending = fs.readFile(path.join(process.cwd(), 'src/data/bank-frequency/corpus.json.gz')).then(bytes => {
    const corpus: FrequencyCorpus = JSON.parse(gunzipSync(bytes).toString('utf8'));
    if (corpus.version !== 1 || corpus.revision !== metadata.revision) throw new Error('Statistics index does not match its manifest');
    return corpus;
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}

export function findFrequencyTerm(corpus: FrequencyCorpus, term: TermIdentity): number {
  const normalize = (value: string) => value.normalize('NFKC');
  return corpus.terms.findIndex(([label, reading, pos, kind], id) => (kind === 'connective' ? 'word' : kind) === term.kind && (corpus.partsOfSpeech?.[id] ?? [pos]).includes(term.pos) && normalize(reading) === normalize(term.reading)
    && [label, ...(corpus.aliases?.[id] ?? [])].some(form => normalize(form) === normalize(term.label)));
}
