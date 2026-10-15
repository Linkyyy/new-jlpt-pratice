# 原创题库 JSON

题库内容统一维护在 `question-bank.json`，不包含官方真题。年份是内容版本，不是官方考试年份。

- `schemaVersion`：当前为 `1`。
- `papers`：按等级（N1–N5）和年份（2025、2026）组织。
- `vocabulary` / `grammar`：词汇、语法题。
- `reading.passage`：阅读文章；`reading.questions`：配套题目。
- 每道题是五项数组：`[id, prompt, options, correctOptionId, explanation]`。
- `options` 恰好四项，依次对应 A、B、C、D。
- `explanation` 可以是中文字符串或中文段落数组。

题目 ID 必须全局唯一，前缀为对应等级和年份。**不要修改现有题目的 ID**：收藏以 ID 关联题目，而不是以数组位置关联。

目前每卷每题型各 3 题，共 9 题。`practice-papers.ts` 负责格式检查、类型转换和题型筛选；页面和交互组件不维护题目正文。

收藏内容单独存储在浏览器 localStorage 的 `jlpt-practice.favorites.v1` 中，只记录题目 ID、收藏夹和收藏时间，不复制题库或保存作答记录。每道题属于一个收藏夹，删除自定义收藏夹时题目会移到默认收藏夹。

## 用户提供题库

`imported-bank/index.json` 是可用于首页的轻量索引；`imported-bank/questions/` 保留逐场次、等级、题型的标准化数据。原始来源目录不会被修改，也不是应用运行时依赖。

```powershell
npm run import:bank -- --source "题库 JSON 目录"
npm run check:bank
```

文件格式为 `time_201007_level_n2_type_1.json`。数字题型 1/2/3/4 分别映射为词汇/语法/阅读/听力。

- 子题从 `extending` 展开，继承父题阅读文章、题型说明、音频和图片；空的场次/等级使用文件元数据补全。
- `option1`–`option4` 与答案 1–4 对应；内部继续使用 A–D 作答 ID，界面保留原数字选项。
- 优先使用 `assistantNew`，缺失时回退 `assistant`。可识别的整组解析按当前子题号截取，避免练习反馈暴露后续题答案。
- HTML 只通过白名单 React 元素展示，不注入原始 HTML；下划线、表格、段落等保留，外部链接、脚本、事件和样式不执行。
- 导入题 ID 使用独立的 `imported:` 命名空间，不影响原 90 道题及原收藏。
- 音频、图片缺失或数据无效的题目保存在 `unavailable` 和索引报告中，不进入作答、题数及评分。听力原文不会替代缺失音频提前展示。

要补充媒体，提供与 JSON 引用一致的本地目录结构，例如 `audio/201007n2/1.mp3` 和 `pic/120100770.jpg`：

```powershell
npm run import:bank -- --source "题库 JSON 目录" --media "含 pic 的资源根目录" --audio-manifest "R2 已上传对象清单.json"
```

图片复制为本地静态资源。音频上传至 Cloudflare R2，导入器按已上传清单保留原始相对路径，不复制 MP3、不猜测题号对应文件，也不在导入时请求外站。父子题继续继承已有音频引用。配置 `NEXT_PUBLIC_AUDIO_BASE_URL` 后由浏览器按需直连播放；完整 HTTPS 音频字段和旧本地音频引用也兼容。

具体上传、域名、环境变量与部署步骤见 [R2 听力说明](../../docs/r2-audio.md)。补充媒体后需重新检查并构建；重新导入请使用全量原始 JSON 目录及原有图片资源，避免丢失其他题型。

服务端按选定题型读取 JSON，收藏页面只通过本站只读接口查询已收藏的题目，避免把整份题库传入浏览器。Next.js 文件追踪配置会将标准化 JSON 包含在部署产物中。

这些内容标为“用户提供题库”，不宣称原创或已获得官方授权。公开部署前请自行核实使用权限。
