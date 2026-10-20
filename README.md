# JLPT 词汇与语法复习工具 · 宣传资料

本组宣传单独介绍**考试词汇和语法整理、筛选复习、中文释义、接续用法与原题跳转**。

## 下载

- [手机轻量包：6 张 JPG＋发布文案](jlpt-revision-jpg.zip)
- [高清宣传资料包：JPG、PNG、PDF 合集、真实截图、示例 Excel/PDF、排版 HTML 与文案](jlpt-revision-materials.zip)
- [项目源码 ZIP（与当前修改对应）](jlpt-revision-source.zip)
- [单独下载发布文案](copy.txt)
- [PDF 宣传图合集](posters.pdf)

项目代码已提交到 [main 分支](https://github.com/Linkyyy/new-jlpt-pratice/tree/main)，对应提交 [023db0f](https://github.com/Linkyyy/new-jlpt-pratice/commit/023db0f3c700fe810e3d9323c0602156ea232e84)。源码 ZIP 由该提交的 Git 跟踪文件生成，不包含本地密钥、node_modules 或 .next。源码的构建与部署步骤见 ZIP 内项目 README。

工具入口：<https://new-jlpt-pratice.vercel.app/frequency>

## 图片预览

所有宣传图为 **1080×1440**，可按以下顺序发布。独立 JPG 可打开后保存。

### 1. 考试词汇、语法，整理好再复习

![考试词汇、语法，整理好再复习](posters/01.jpg)

[下载 JPG](posters/01.jpg) · [下载 PNG](posters/01.png)

### 2. 等级独有范围，缩小复习清单

![等级独有范围，缩小复习清单](posters/02.jpg)

[下载 JPG](posters/02.jpg) · [下载 PNG](posters/02.png)

### 3. 语法含义、接续与用法

![语法含义、接续与用法](posters/03.jpg)

[下载 JPG](posters/03.jpg) · [下载 PNG](posters/03.png)

### 4. 词条出处与原题跳转

![词条出处与原题跳转](posters/04.jpg)

[下载 JPG](posters/04.jpg) · [下载 PNG](posters/04.png)

### 5. 官方子题型与组合筛选

![官方子题型与组合筛选](posters/05.jpg)

[下载 JPG](posters/05.jpg) · [下载 PNG](posters/05.png)

### 6. 导出 Excel／PDF 复习清单

![导出 Excel／PDF 复习清单](posters/06.jpg)

[下载 JPG](posters/06.jpg) · [下载 PNG](posters/06.png)

## 文件说明

- `posters/`：6 张 JPG 与 6 张 PNG。
- `screenshots/`：这次更新后的真实网页截图；无个人学习账号数据。
- `examples/`：页面实际下载的语法 Excel 与 PDF 示例。
- `source/posters.html`：可编辑的排版文件，图片以相对路径引用；`illustration.png` 为新生成的装饰插画。
- `copy.txt`：推荐标题、正文、短版、备选标题、标签、网址与发布顺序。
- `posters.pdf`：6 页宣传图合集。

截图按现有题库展示。文本出现频次不等于实际考点频率；等级独有范围是题库差集，并非官方词汇分级。未收录的中文释义会标注待补充。

部分截图中的词典释义来自中文维基词典贡献者，经 Wiktextract / Kaikki.org、Nichū 整理，采用 CC BY-SA 4.0。完整归属、许可和改动记录见项目 `src/data/frequency-dictionary/`；语法用法为项目另行编写的学习说明。宣传插画和排版为本次新制作。

此资料分支独立于网站生产代码；部署更新从 main 分支获取。
