"""Import reviewed reference supplements from local, pinned checkouts; no build-time network.
Usage: python scripts/import-frequency-supplements.py /path/to/jlpt-word-list /path/to/yomitan-jlpt-vocab /path/to/core-words.json
"""
from pathlib import Path
import collections,csv,hashlib,json,subprocess,sys,unicodedata,gzip
root=Path(__file__).resolve().parent.parent
out=root/'src/data/frequency-levels'
word_repo,waller_repo,core_path=map(Path,sys.argv[1:4])
def norm(s):return ''.join(chr(ord(c)-96)if 'ァ'<=c<='ヶ'else c for c in unicodedata.normalize('NFKC',s.strip()))
def rev(p):return subprocess.check_output(['git','-C',str(p),'rev-parse','HEAD'],text=True).strip()
word_levels=collections.defaultdict(set);original_levels=collections.defaultdict(set);fingerprint=hashlib.sha256()
for n in range(1,6):
 p=word_repo/f'src/n{n}.csv';fingerprint.update(p.read_bytes())
 for r in csv.DictReader(p.open()):word_levels[(norm(r['expression']),norm(r['reading']))].add(f'N{n}')
 for r in csv.DictReader((waller_repo/f'original_data/n{n}.csv').open()):original_levels[(r['jmdict_seq'],norm(r['kana']))].add(f'N{n}')
for word,reading,level in json.loads((out/'entries.json').read_text()):word_levels[(norm(word),norm(reading))].add(level)
core=json.loads(core_path.read_text());fingerprint.update(core_path.read_bytes());aliases=collections.defaultdict(list)
for w in core['words']:
 for rd in w['kana']:
  if any(t in rd['tags']for t in ['ok','rk','ik']):continue
  reading=norm(rd['text']);writings=[k['text']for k in w['kanji']if not any(t in k['tags']for t in ['oK','rK','ik'])and(rd['appliesToKanji']==['*']or k['text']in rd['appliesToKanji'])]
  source_keys=[(norm(k),reading)for k in writings]+[(reading,reading)]
  grades=set(original_levels.get((w['id'],reading),set()))
  for k in source_keys:grades.update(word_levels.get(k,set()))
  if not grades:continue
  for k in source_keys:aliases[k].append({'id':w['id'],'levels':sorted(grades),'sourceSpellings':writings})
corpus=json.loads(gzip.decompress((root/'src/data/bank-frequency/corpus.json.gz').read_bytes()));entries=[];seen=set()
for term,grades,basis in zip(corpus['terms'],corpus['referenceLevels'],corpus.get('referenceBasis',['reference']*len(corpus['terms']))):
 label,reading,_,kind=term
 if grades and basis=='reference' or kind not in ['word','connective']:continue
 key=(norm(label),norm(reading));exact=word_levels.get(key)
 if exact:record=dict(kind='word',label=label,reading=reading,levels=sorted(exact),method='word-list',evidence='Exact spelling and reading in the supplementary reference word list.')
 else:
  matches=aliases.get(key,[])
  if not matches or len({r['id']for r in matches})!=1:continue
  candidate_levels=sorted(set().union(*(set(m['levels'])for m in matches)))
  record=dict(kind='word',label=label,reading=reading,levels=[max(candidate_levels,key=lambda level:int(level[1]))],method='dictionary-variant',evidence=matches,selection='Introductory attested level for a shared dictionary spelling; do not inherit harder alternate orthographies.')
 k=(label,reading)
 if k not in seen:entries.append(record);seen.add(k)
(out/'supplement-entries.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
source=dict(name='补充词表交叉核对、整词表记复核与站内估级',url='https://github.com/Linkyyy/new-jlpt-pratice/tree/main/src/data/frequency-levels',revision=fingerprint.hexdigest(),license='CC BY-SA 4.0 / MIT / site-authored estimates',entries=len(entries),sources=[
 dict(name='elzup / Jamie Sinclair, open JLPT word lists; Jonathan Waller / Tanos original data',url='https://github.com/elzup/jlpt-word-list',revision=rev(word_repo),license='MIT (repository), attribution to Jonathan Waller / Tanos retained'),
 dict(name='Jonathan Waller / Tanos via Stephen Kraus',url='https://github.com/stephenmk/yomitan-jlpt-vocab',revision=rev(waller_repo),license='CC BY-SA 4.0'),{k:v for k,v in core['metadata'].items()if k in ['source','source_url','license','source_version','upstream_dict_date','generated','filter','attribution']}],
 policy='Only exact whole-word/reading matches or a unique same-reading JMdict entry may extend published grades. Existing grades are preserved. Site estimates are recorded separately and labelled in UI and exports.')
(out/'supplement-source.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
(out/'SUPPLEMENT-WORD-LICENSE.txt').write_text((word_repo/'LICENSE').read_text())
print('Imported sourced missing-word grades:',len(entries))
