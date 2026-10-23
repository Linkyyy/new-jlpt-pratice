# 图片文字与词频统计

图片使用独立文字数据，避免修改显示中的原题、选项、答案和图片。`entries.json` 当前为空，表示真实图片尚未提取、校对，不表示已经完成 OCR。代码已支持校对后的图片文字参与统计。

## 离线处理

开发机器需要 Node.js 24、Tesseract 5 和日文 `jpn.traineddata`。识别引擎、语言模型及图片缓存只用于离线处理，不进入 Vercel 部署，也不会在用户查询时请求 R2 或 OCR 服务。

本环境已有 `/usr/bin/tesseract`。日文模型可从 [Tesseract 官方模型仓库](https://github.com/tesseract-ocr/tessdata_best/blob/main/jpn.traineddata) 下载，保存在 `/tmp/jlpt-tessdata/jpn.traineddata`。语言模型具有其仓库所示的 Apache-2.0 许可，不将模型文件提交到本站仓库。

图片本地目录保留 `pic/` 结构，例如 `/tmp/jlpt-image-ocr/images/pic/120250765.jpg`。所有题库当前引用 158 张独立图片，其中 97 张用于阅读、61 张用于听力；同一图片被多个小题使用时只下载、识别一次。

```sh
# 先处理这批新上传的 11 张图片；省略 --checklist 则扫描全部题库图片。
npm run ocr:images -- \
  --checklist docs/exam-bank-missing-images-2026-10-22.json \
  --image-dir /tmp/jlpt-image-ocr/images \
  --tessdata-dir /tmp/jlpt-tessdata \
  --output /tmp/jlpt-image-ocr/draft.json
```

需要从公开 R2 下载时加 `--download`，可通过 `--base-url` 更换公开域名。下载沿用环境代理、CA 和网络白名单，不读取 R2 密钥。网络不允许访问时可以直接提供本地图片目录；不能用上传确认代替实际图片进行识别。下载验证报告与识别草稿分别保留，缺图和识别失败会记录错误并返回非零退出码。

## 校对与入库

识别草稿包含图片路径、原文件 SHA-256、OCR 文字、引擎和加权置信度，默认 `reviewed:false`。将文字与原图核对，修正假名、汉字、表格列顺序、词内换行及空格；排除页码、广告、水印和已经完整转录的内容，然后将对应条目设置为 `reviewed:true`。不要根据题目解析或中文译文反推日文原文。

```sh
npm run ocr:images -- --import /tmp/jlpt-image-ocr/draft.json
npm run build:frequency
npm run test:image-ocr
npm run test:frequency
npm run build
```

入库仅合并已校对、包含有效日文且有图片校验值的条目；未校对或识别失败的文字不进入榜单。重新运行时保留其他已经校对的图片文字。图片被覆盖后需重新识别并校对，原文件 SHA-256 用于追踪版本。

文章图片归入“文章”字段，小题附图及听力配图归入“题干”字段。同一试卷中，同一图片的文字只计一次，保留所有关联小题；不同试卷分别计数。已转录的相同段落及完整重复行不重复计数。表格部分转录等复杂重叠应在校对时移除重复部分；OCR 和已有文字仍以独立文本单元统计，避免拼接出不存在的词语和表达。

榜单、筛选、排序、词条释义、等级、Excel/PDF 等复用现有索引。点击词条后，“原题例句”能显示图片识别的原文及命中位置，并通过原题 ID 跳转回图文题。图像文字不会自动覆盖原题的题干或答案。

原生引擎测试：`OCR_TESSDATA_DIR=/tmp/jlpt-tessdata npm run test:image-ocr`。它使用实际渲染的日文测试图，不作为真实题库 OCR 已完成的证明。
