# 题库资源检查

题库原有路径保持不变，多个小题共用音频或文章图时只检查一次；报告列出受影响题目 ID。检查只在管理员执行脚本时运行，不会让用户答题前扫描整个 R2。

```sh
# 只验证题库引用是否合法、本地兼容图片是否存在，不请求远端。
npm run check:resources -- --output /tmp/jlpt-resources.json

# 检查最多100个公开URL，最多4个并发；不会下载整段MP3。
npm run check:resources -- --remote --limit 100 --output /tmp/jlpt-resources-remote.json

# 完整检查时自行提高limit；每个请求也会消耗R2操作额度。
npm run check:resources -- --remote --limit 5000 --concurrency 4 --output /tmp/jlpt-resources-full.json
```

脚本读取 `NEXT_PUBLIC_AUDIO_BASE_URL`，未设置时沿用网站默认公开媒体域名。建议本地使用与Vercel相同的配置；也可用 Node 的 `--env-file-if-exists=.env.local` 运行脚本。无需上传密钥，不能把私有Token放进公开资源URL。

输出含统计、资源URL、题目ID和以下状态：

| 状态 | 含义 |
| --- | --- |
| available | 请求成功，或本地文件存在 |
| missing | HTTP 404，或本地文件不存在 |
| invalid-reference | 不安全或不支持的资源引用 |
| unreachable | 超时、网络错误、权限拒绝或其他非成功响应；不能据此认定文件不存在 |
| unchecked | 未请求远端，或超过本次检查limit |

远端优先使用HEAD；不支持HEAD时只请求 `Range: bytes=0-0`，并取消响应体。不会把音频保存进Vercel部署资源。检查成功不等于音频内容、图片内容或答案一定正确，内容问题仍通过答题设置反馈。存在missing、invalid-reference或unreachable时，脚本返回非零状态，便于上传后检查或在管理员工作流中使用。

测试：`node --test scripts/test-bank-resources.mjs`。
