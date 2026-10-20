import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import metadata from '@/data/bank-frequency/manifest.json';
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
