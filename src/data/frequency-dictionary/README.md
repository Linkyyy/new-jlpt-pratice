# 中文词典来源与许可

`entries.json.gz` 是中文维基词典日语条目的筛选派生数据，采用 **CC BY-SA 4.0**，许可证全文见 [LICENSE.txt](LICENSE.txt)。不覆盖本项目应用代码的许可。

归属：**中文维基词典贡献者**；经 **Tatu Ylonen 等的 Wiktextract / Kaikki.org** 提取，由 **Nichū Offline Dictionary** 整理快照。词头原页面及编辑历史可在 `https://zh.wiktionary.org/wiki/{词头}` 查阅。网页词条详情和导出文件保留来源。

- 上游快照：<https://github.com/Hanbin-Zhang-JPN/nichu-offline-dictionary>
- 上游数据说明：<https://kaikki.org/zhwiktionary/rawdata.html>
- 原始内容许可：<https://creativecommons.org/licenses/by-sa/4.0/>
- 来源、日期和固定 SHA-256：见 [source.json](source.json)。

本项目改动：核验原始 gzip 的 SHA-256，仅保留当前词频索引需要的词头、明确读音、词性和最多八个中文义项；按源明确的异体词与重定向建立别名；保留送假名组成读音。构建时依词头、读音和词性匹配，去除旧格式的读音标题和日文例句行，限制单条释义长度；正文不执行 HTML。压缩索引中对应的派生释义同样按 CC BY-SA 4.0 提供。

`src/lib/frequency-study-notes.mjs` 是本项目另行编写的简短语法、接续词和常用词学习说明，与词典派生数据分别标明来源。`src/lib/frequency-idioms.mjs` 另含本项目编写的惯用句含义及用法，按同一方式标明来源。这些说明不是题目在具体语境中的逐句翻译。

未有可靠数据的词显示“释义待补充”，不根据汉字外观、相近拼写或分词碎片编造含义，也不请求外部翻译或上传用户数据。

维护命令（仅更新数据时需要原始快照；日常构建和部署完全离线）：

```bash
node scripts/import-frequency-dictionary.mjs /path/to/dictionary.jsonl.gz
npm run build:frequency
```

导入器校验固定上游 SHA-256。不匹配时停止，不覆盖已有词典。升级快照须核对新的来源、许可和校验值。
