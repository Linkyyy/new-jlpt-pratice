# JLPT 参考词汇等级

这些是公开参考分级，**不是 JLPT 官方词汇大纲**。JLPT 未公开逐词的官方 N1–N5 分级列表；参考 N2 词也可能出现在 N1、N3 等试卷中。

- 原始参考词表：Jonathan Waller / [Tanos JLPT Resources](https://www.tanos.co.uk/jlpt/)。
- 表记校正与格式整理：Stephen Kraus，[yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab)。
- 上游快照：`b062d4e38c4bdd0950ae1d4ec55f04b176182e03`，词典版本 `2025.08.01.0`。
- 授权：CC BY-SA 4.0，完整条款见 [LICENSE.txt](LICENSE.txt)。出处、校验和见 [source.json](source.json)。词表的再分发和派生数据遵守相同许可；代码另按仓库许可。

`entries.json` 保留上游的 `[日语表记, 假名读音, 参考等级]`，不生成翻译、不自行升降等级。统计构建时按表记与读音精确匹配；若上游同一词有多个等级则保留多个。不因汉字相同或读音相似给未命中词推断等级。

页面筛选“词条参考等级”只收录用户提供真题题库中的词；“试卷等级”是另一项独立条件。“等级独有范围”依然表示本库上下级试卷的差集，不能当成词汇参考等级。

复现：

```sh
git clone https://github.com/stephenmk/yomitan-jlpt-vocab /tmp/yomitan-jlpt-vocab
git -C /tmp/yomitan-jlpt-vocab checkout b062d4e38c4bdd0950ae1d4ec55f04b176182e03
node scripts/import-frequency-levels.mjs /tmp/yomitan-jlpt-vocab
npm run build:frequency
```

构建与运行均使用仓库内快照，不依赖在线词表接口。首次导入对上游数据唯一的修改是抽取表记、读音和等级到紧凑数组；页面只显示其中在现有真题中出现的词。

## 语法与惯用句

语法新增参考来源：Justin Kindrix 及贡献者的 [Japanese Language Data](https://github.com/jkindrix/japanese-language-data)，快照 `04014e06019fc9d4af76e6dbb64ec709fe863c4d`，`data/grammar/grammar.json`。上游为社区整理的 **draft**，尚未经母语专家审核，等级只作复习参考。只抽取站内表达对应的 pattern / level / id / review_status，不引入上游例句、词典、翻译或其他数据集。许可见 [EXPRESSION-LICENSE.txt](EXPRESSION-LICENSE.txt)，哈希和出处见 [expression-source.json](expression-source.json)。本地的修改是建立站内表达到上游完整语法结构的显式映射，统一显示原样的等级；不把语法片段或组成词的等级当成整条表达的等级。

[expression-entries.json](expression-entries.json) 记录 180 条语法及「気がする」的参考分类，每条保留上游 id 和完整结构。复核时从指定快照打开相应 id，核对 pattern、level 与 review_status；需要修改映射时同时更新此文件和来源说明，然后运行 `npm run build:frequency`。

惯用句还可按**整条表达**及已确认的表记变体，精确匹配原有 Waller 词表。例如「気に入る」「気を付ける」。不拆成「気」「入る」「付ける」来推断等级。未在这两份基础资料中找到的表达由下述补充复核单独处理；没有可靠来源且未通过完整表达复核的仍保持未分级，不按组成词或试卷等级强行分配 N1–N5。

## 2026-10-21 补充复核

基础两份快照及已有词条等级保持原样。新增结果分开保存：

- `supplement-entries.json`：补充词表的**词形＋读音精确匹配**，或 JMdict 同一条目中**相同读音**的可靠表记。多义假名词对应多个 JMdict 条目时不自动转移；同条目多个表记提供不同等级时，新增共用写法只保留其中最基础的已见等级，避免把难写法等级套给常见假名；不把同一词的其他读音等级直接套用。来源、固定版本及原始文件指纹见 `supplement-source.json`，补充词表许可见 `SUPPLEMENT-WORD-LICENSE.txt`。
- 补充词表来自 elzup / Jamie Sinclair 的 `jlpt-word-list`，保留其 Jonathan Waller / Tanos 归属。整词表记核对使用 Japanese Language Data 中的 JMdict 常用词快照（JMdict / EDRDG，CC BY-SA 4.0）；只使用词形、读音和同条目关系，不复制英文例句或翻译。
- `reviewed-entries.json`：逐条复核的完整词汇、语法和惯用表达。能与现有完整语法结构对应的记录保留上游 id、pattern、level；其余为站内学习估级，记录 `method: editorial`，在列表、详情、Excel 和 PDF 中均附“估级”，不冒称公开词表或官方评级。
- 估级参考完整表达的含义、构词、语域和学习前置知识；不会按出现在哪一级试卷、出现频次、组成单词等级自动分配。基础词表优先，已分级的词不会被补充估级覆盖。
- 未能确认的专名、混合读音、多义假名词、资料未覆盖项继续保留未分级，不为提高覆盖率批量按 N1/N2 填充。

统计构建会生成 `src/data/bank-frequency/level-review-report.json`，列明新增等级的依据、仍未确认条目及分类汇总。分级只改变派生检索索引，不改原题题干、答案、评分或做题记录。

补充导入可复现命令（均使用本地快照；构建和部署无需联网）：

```sh
python scripts/import-frequency-supplements.py /path/to/jlpt-word-list /path/to/yomitan-jlpt-vocab /path/to/core-words.json
npm run build:frequency
```

`core-words.json` 为 `jkindrix/japanese-language-data` 指定快照中的 `data/core/words.json`，版本和日期见来源记录。新增题库或参考来源后可重新导入；原有补充分级不会因已经命中而在再次导入时丢失。

惯用表达重扫的候选范围、入库清单与完整表达对应的 JMdict id 见 [idiom-rescan-review.json](idiom-rescan-review.json)。候选发现只用于人工筛选，不直接视作可靠匹配或原题最终频次。
