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
