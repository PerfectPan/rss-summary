# Grok 原生 X 搜索

午间、晚间新闻独立按主题广搜：未设置 `NEWS_SEARCH_MODE` 时默认使用已登录的 Grok CLI，
显式 `doubao`、`hybrid`、`combined` 配置仍有效。Grok 失败不会切换其他付费来源。

Daily AI 使用官方 RSS／官网和订阅 X 账号，**不调用新闻搜索**。默认账号为 ClaudeDevs；
`DAILY_AI_X_HANDLES` 支持逗号分隔的 handle（可带 @），显式空字符串关闭 X。
账号采集固定使用 Grok，不受 `NEWS_SEARCH_MODE` 或新闻主题、新闻查询数影响。
本次不新建定时任务、不修改推送目标，也不改变“我的订阅”的 feeds.json。

## 账号订阅与复用

`src/acquisition/application/use-cases/collect-x-posts.ts` 接收账号列表与精确的 `[since, until)` 时间窗口，返回帖子
和逐账号审计；不依赖 Daily AI 栏目或新闻主题。Daily AI 传入运行时刻之前 24 小时，未来
RSS／“我的订阅”可传入自己的自然日窗口。`src/acquisition/infra/adapters/grok-cli.ts` 统一处理 CLI 调用、
原生工具回执、链接／作者／时间校验；新闻适配器与账号采集器各自生成查询策略。

账号查询使用 `from:handle`，本地再拒绝其他作者的帖子。采集原创与带作者评论的引用帖，
保留经验、观点和教程，不预先做新闻筛选；提示模型排除纯转推和回复。先一次关键词搜索，
仅正文必要信息缺失时再补一次线程读取，不默认逐条读取。新闻主题采用相同检索步骤，不反复
改写关键词凑条数；没有合适证据时允许空结果。CLI 使用 low effort，禁用计划与子 Agent。
CLI 两轮上限不等于内部 X 工具调用次数上限；收到第三个原生调用事件时立即终止进程并
记录 `grok_call_limit`。事件到达时后端可能已经开始执行，因此这不是严格的计费次数上限。
抓取不保证完整时间线、完整线程或媒体。

`X_ACCOUNT_POSTS_PER_FETCH` 默认 30，范围 1..50，是单次抓取响应上限，不是日报筛选条数。
`sourceAudit.xAccounts` 记录账号、状态、接收数、`limitReached`、错误码、Grok 用量和缓存来源；
达到上限提示可能截断，未达到也不代表没有遗漏。每个去重后的账号最多发起一次 CLI 请求，
不自动重试。失败留在审计，不在正文增加“当前不可用”条目；官方 RSS／官网继续采集。

账号和新闻共用 `NEWS_GROK_EXECUTABLE`、`NEWS_GROK_MODEL`、`NEWS_GROK_TIMEOUT_MS`，以及
`NEWS_SEARCH_STATE_FILE` 的预算账本。账号抓取的默认额度同 Grok（4/120）；与其他新闻模式
混用时显式配置共同额度。精确时间窗口写入账号缓存键，同窗口回放可复用，结束时间推进会
重新采集。新闻同样传递精确的摘要窗口：午报从当日 00:00 开始，晚报从 12:30 开始，到
occurrence 为止；补采使用请求指定的窗口。窗口参与缓存匹配，旧的整日缓存与其他窗口不
替代当前采集。新闻和账号缓存互不替代。Daily AI 的 render 阶段复用 collect 快照，不再次搜索。

## 查询语言

给 Grok 的操作指令使用英文，主题采用 `news-topics.json` 中的 `queries[].text` 原文，内置
主题多数是中文与产品名混排。账号订阅查询只限定作者与时间，不限定语言。不会替换成 `glm.query` 的英文官网查询，也没有 `lang:en`
限制。具体原生 X 检索词由 Grok 生成，程序不保证其使用英文；最终标题和摘要要求使用中文。

## 准备与试用

1. 在运行 rss-summary / Rivus Host 的同一个系统用户下安装并登录 Grok CLI，先确认
   `grok --version` 和 `grok --help`。实现按 CLI 1.0.46 的 streaming-json 接口验证；需要支持
   `--single`、`--tools x_search`、`--no-subagents`、`--no-plan`、`--reasoning-effort low`、
   `--max-turns`、`--permission-mode dontAsk`。
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

`NEWS_GROK_MAX_QUERIES` 范围为 1..4，进一步限制独立新闻的 `NEWS_SEARCH_MAX_QUERIES`。
旧的 `DAILY_AI_NEWS_MAX_QUERIES` 不再使用。默认只轮换执行一个主题查询，覆盖会明显少于原有多查询计划，
其余查询在审计中标为延后。若全局环境已有 14/420 等显式预算，需改成希望用于 Grok 的值；
4/120 只在对应变量未设置时生效。状态持久化、并发锁与恢复见[搜索预算](news-search-budget.md)。

试跑 Daily AI 时，调用 `rss-summary/generate-daily-ai-digest` 的 `phase: "collect"`，检查
`sourceAudit.xAccounts` 与 `evidence` 中的 `x:` 引用，然后用这些引用编写 draft 并调用
同一 occurrence 的 `phase: "render"`。只检查结果，不调用投递工具；这仍会消耗共享请求额度。

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
  新闻主题仅支持 `sourcePolicy: "news"`，不满足 `official` / `authoritative` 来源策略。
- `grok.rejectedResults` 统计被链接、日期、重复等校验剔除的条目；正常空结果也会缓存。
  `nativeCallCount` 记录去重后的原生调用次数，`elapsedMs` 记录本次 CLI 总耗时；进程异常结束也保留
  已观察到的调用次数与耗时。`grok_timeout`、`grok_call_limit`、`grok_output_limit`、
  `grok_not_found` 分别标识超时、追加搜索超限、输出超限和程序缺失；其他执行错误为
  `grok_cli_failed`。新闻全部失败时对外返回具体的中文原因，不把失败伪装为空新闻。
  搜索不是完整账号时间线或无遗漏订阅，本功能不生成 RSS XML，也不保证抓取完整线程或媒体。
- `grok.costUsd`、`totalTokens`、`inputTokens`、`cachedInputTokens`、`outputTokens`
  来自 CLI 结束事件，缺失时不猜测。这些值不是实际扣款证明，也无法换算订阅剩余额度。
  缓存复用保留原始用量；以 `searchUsage.source` 区分新调用与缓存，避免重复计费统计。
- 预算限制 CLI 调用次数，无法精确限制模型内部 X 工具调用数或美元消费。故障不自动重试；
  新闻不可用时沿用现有采集降级；账号不可用记录在 Daily AI 的来源审计。

只恢复新闻原有来源时，将 `NEWS_SEARCH_MODE` 改回 `doubao`、`hybrid` 或 `combined`，保留原有
预算记录，并重载 Host。关闭 Daily AI 的 X 采集需另设 `DAILY_AI_X_HANDLES=`。合并代码本身不会更新本机安装的插件或重启定时任务。
