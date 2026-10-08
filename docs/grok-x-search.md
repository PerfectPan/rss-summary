# Grok 原生 X 搜索

设置 `NEWS_SEARCH_MODE=grok` 后，现有午间、晚间新闻与 Daily AI 的新闻采集使用已登录的
Grok CLI。默认仍为 Doubao；Grok 模式不会初始化 Doubao/GLM，也不会在失败后切换其他付费
来源。Daily AI 自身的官方 RSS 采集仍保留。此次接入不创建新定时任务、不修改推送目标。

## 准备与试用

1. 在运行 rss-summary / Rivus Host 的同一个系统用户下安装并登录 Grok CLI，先确认
   `grok --version` 和 `grok --help`。实现按 CLI 1.0.46 的 streaming-json 接口验证；需要支持
   `--single`、`--tools x_search`、`--no-subagents`、`--max-turns`、`--permission-mode dontAsk`。
2. 更新安装的 rss-summary 插件，然后在 Host 进程环境中设置：

   ```sh
   NEWS_SEARCH_MODE=grok
   NEWS_GROK_MAX_QUERIES=1
   NEWS_SEARCH_DAILY_LIMIT=4
   NEWS_SEARCH_MONTHLY_LIMIT=120
   NEWS_SEARCH_STATE_FILE=/persistent/private/news-search.json
   ```

   `NEWS_GROK_EXECUTABLE` 可指定可执行文件，默认 `grok`；不是 shell 命令，不接受附加参数。
   `NEWS_GROK_MODEL` 可选，省略时沿用 CLI 默认。`NEWS_GROK_TIMEOUT_MS` 默认 120000，范围
   1000..180000。使用进程环境，不会自动读取 `.env`。重载 Host 后新配置才生效。
3. 先手动调用现有 `rss-summary/generate-news-brief` Tool，传入当前带时区的 `occurrence` 与
   `edition: "noon"` 或 `"evening"`。早于 12:30 用 noon，之后用 evening。只检查采集结果，
   不调用投递工具。这会消耗一次 Grok 请求并写预算/缓存，但不写业务 seen 状态或发送消息。
4. 检查 `audit.queries` 中的 `provider: "grok"`、`grok.nativeTools`、`searchUsage` 和
   `warnings`。确认这些字段后再让现有调度使用此配置；调度 ID、时间和通知目标无需改变。

`NEWS_GROK_MAX_QUERIES` 范围为 1..4，进一步限制 `NEWS_SEARCH_MAX_QUERIES` 和
`DAILY_AI_NEWS_MAX_QUERIES`。默认只轮换执行一个主题查询，覆盖会明显少于原有多查询计划，
其余查询在审计中标为延后。若全局环境已有 14/420 等显式预算，需改成希望用于 Grok 的值；
4/120 只在对应变量未设置时生效。状态持久化、并发锁与恢复见[搜索预算](news-search-budget.md)。

## 数据与用量

- 每次调用在临时空目录运行，仅开放 `x_search`，禁用子 Agent，限制两轮并设超时和输出上限。
  使用 CLI 自身登录，不读取或复制凭据，不持久化思考流、原始流或 stderr。
- 只有流中出现后端 `XSearch` 调用及匹配的已完成 `x_keyword_search`、`x_semantic_search`
  或 `x_thread_fetch` 回执，并正常结束，才接受最终 JSON。正文声称“已搜索”不算证据。
- 链接必须是 X/Twitter 的具体 status，作者与链接 handle 必须一致；按帖子 ID 去重。
  从 Snowflake ID 推导发布时间，与模型提供的时间核对后，按本地时区及摘要窗口过滤。
  UTC 日期查询会适当放宽边界，再本地精确过滤。ID 时间一致性不证明帖子存在或正文正确。
- 标题、摘要仍经过 Grok 模型整理；回执证明调用了搜索工具，**不证明每条模型返回的帖子和
  正文均已独立核验**。来源显式标注“X（Grok 整理）”，Daily AI 证据分级为 `unverified`。
  仅支持主题的 `sourcePolicy: "news"`，不满足 `official` / `authoritative` 来源策略。
- `grok.rejectedResults` 统计被链接、日期、重复等校验剔除的条目；正常空结果也会缓存。
  搜索不是完整账号时间线或无遗漏订阅，本功能不生成 RSS XML，也不保证抓取完整线程或媒体。
- `grok.costUsd`、`totalTokens`、`inputTokens`、`cachedInputTokens`、`outputTokens`
  来自 CLI 结束事件，缺失时不猜测。这些值不是实际扣款证明，也无法换算订阅剩余额度。
  缓存复用保留原始用量；以 `searchUsage.source` 区分新调用与缓存，避免重复计费统计。
- 预算限制 CLI 调用次数，无法精确限制模型内部 X 工具调用数或美元消费。故障不自动重试；
  不可用时沿用现有采集降级，明确提示覆盖不足。

恢复原有来源时，将 `NEWS_SEARCH_MODE` 改回 `doubao`、`hybrid` 或 `combined`，保留原有
预算记录，并重载 Host。合并代码本身不会更新本机安装的插件或重启定时任务。
