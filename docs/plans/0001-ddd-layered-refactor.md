# Plan 0001：按 agent-kit 的 DDD 分层重构 rss-summary

状态：已评审，执行中
类型：技术重构，不改变产品行为
参照：`../agent-kit/docs/architecture/authoring.md`、`../agent-kit/infra/architecture/boundaries.ts`
基线：`main` @ `3416de6`，`pnpm verify` 通过（69 个测试文件 / 451 个用例，`check-package: ok`）

## 1. 目标与非目标

目标：

- 上层是 `app/`：CLI、Rivus 插件，以及把各模块组合成产品的流程。
- 下层是四个业务模块（acquisition、reading、editorial、delivery），每个模块内部照搬 agent-kit 的分层：`domain/<concept>/`（含 `adapters/` 防腐层）、`application/{use-cases,services,ports.ts}`、`infra/{adapters,repository,models,factories}`、`index.ts`。
- 模块按「谁拥有这类知识」划分（agent-kit 的 Choose The Owner），让现在重复实现的概念各自只有一个所有者（2.1）。
- domain 是纯 TS，不做 IO，不依赖 Effect；application、infra 和 app 使用 Effect 4；只有 `app/` 运行 Effect。
- 依赖规则照抄 agent-kit 的 `boundaries.ts`，写成清单并用测试强制执行。

非目标：

- 不改任何对外行为。CLI、环境变量、Markdown/JSON 输出、Rivus Tool/Automation、状态文件格式、发给 Agent 的错误文案都保持原样，完整清单见第 5 节。
- 不实现新宿主或新投递渠道。
- 不调整打分、文案或功能。重构中发现的缺陷单独记 issue。

## 2. 现状诊断

现在是按技术层平铺的四个目录：`domain/application/infrastructure/presentation`，共 64 个文件，约 1 万行。

### 2.1 根本问题：按产品切，同一个概念被重复实现

| 概念 | 实现份数 | 所在位置 |
| --- | --- | --- |
| 「一条信息」的模型 | 5 | `ActivityCard`、`NewsSearchResult`/`NewsSearchHit`、`XAccountPosts.posts`、`DailyAiEvidence`、`SubscriptionEvidence` |
| 同一事件去重 | 3 | `isSameTitleEvent`（news）；`isSameHeadline` 和 `isSameEntityEvent`（daily-ai）；canonical URL 分组（feeds） |
| 「已经发过」的记忆 | 4 | `seen`；`researched`；news 的 `reportedUrls`（由调用方传入）；Daily AI 回执 |
| 时间窗 | 3 | `resolveEventWindow`、`resolveNewsEditionWindow`，以及 Daily AI 自己计算的 24 小时 |
| 运行审计 | 3 | `RunAudit`、`NewsBriefAudit`、Daily AI 的 `sourceAudit` |
| Agent 编辑协议 | 2 | 订阅的 collect/select/render 和 Daily AI 的 collect/render，各有一套缓存和校验 |
| 读原文核验 | 2 | research Tool；混合检索中的 GLM 读原文和发布时间校验 |

按产品切还带来一个错误耦合：Daily AI 为了拿到官方源，调用了「行业前沿」产品的完整流程。它先把时间窗拼成 argv，交给 `loadConfig`，再调用 `Effect.runPromise`（见 `application/daily-ai-digest.ts` 的 `defaultIndustry`）。

### 2.2 application 依赖具体实现

application 层有 31 处 import 指向 18 个 infra 模块。

- `application/digest.ts` 直接调用 `loadConfig()`，自己 `new GitHubClient` / `RssClient` / `GitHubHomeClient`，读 `process.env`，并用 `console.error` 输出。
- 新闻预算的默认值在 `news-brief.ts` 和 `x-account-posts.ts` 中各写了一份。
- infra 类型泄漏到上层：`NewsSearchError`（infra 中的 class）在 `news-audit.ts` 里被 `instanceof` 判断。

### 2.3 presentation 承担编排和业务规则

- `presentation/subscription-tool.ts` 包含三阶段状态机、研究失败即取消推送的规则，以及改写 `RunAudit` 的逻辑。
- `rivus-digest.ts` 和 `rivus-industry.ts` 把 Tool 输入拼成 argv，再用 `loadConfig` 解析。
- `research-tool.ts` 实现了回退链。
- `research-cli.ts` 直接修改 `FeedState`。
- `automation-presentation.ts` 把已经渲染好的 Markdown 再解析回结构。

### 2.4 domain 不纯

- `domain/digest.ts` 里的 `normalizeEvent` 解析 GitHub 原始事件；`daysSince` 调用了 `Date.now()`。
- `infrastructure/state.ts` 中混入了纯规则；`rss.ts` 在日期缺失时用 `new Date()` 兜底。
- 规则和来源绑死：订阅打分按 GitHub 事件类型逐个写分数，并直接读 stars、`pushedAt`；新闻权威性直接读 Doubao 的 `authInfoLevel`；论文判定看 arXiv 域名；Daily AI 的角标靠判断 id 前缀。详见 3.3。

### 2.5 校验写法有四种

手写 `typeof`、lodash 谓词、effect 3 的 `Schema`（`news-search-budget.ts`、`grok-x.ts`、`x-account-posts.ts`）、宽松转换的 `asRecord`。

### 2.6 依赖方向违规

- infra 反向依赖 application：`daily-ai-diagnostics.ts` import 了 `application/daily-ai-digest.ts`。
- 两个批量采集器逻辑相同，却写了两份，而且放在 infra。
- 论文源判定写了两份。
- 回执对象被原地修改。

### 2.7 Effect 用得很浅

只有一个 `attempt` 包装，`runPromise` 散落在 5 个文件中。`docs/technology-decisions.md` 自己也写明 "deliberately shallow"：

- 没有 `Context`/`Layer`，依赖靠手传 deps 对象；
- 没有类型化错误，全部是 `Error`；
- 并发是手写的 worker pool（`settleSearchRequests`），重试是手写循环加注入的 `sleep`/`random`（`searchWithRetry`）；
- 锁、Grok 子进程、浏览器、视频临时目录都靠手写的 `try/finally` 和 `setTimeout` 管理。

另外，版本落后于生态：`@rivus/agent`、`runtime`、`gateway`、`platform` 都依赖 `effect ^4.0.0`，agent-kit 使用 `4.0.1`，只有 rss-summary 还停在 `3.22`，`node_modules` 里因此同时装了 `effect@3.22.1` 和 `effect@4.0.0` 两份。问题不在于用了 Effect，而在于只用了一层壳、版本又和生态不一致。

### 2.8 现有 lint 规则覆盖不到上述问题

`vite.config.ts` 只检查两条：domain 不 import 外层，application 不 import presentation。

### 2.9 文档漂移

`docs/architecture.md` 说 Daily AI 用的是「新闻采集 + 官方源」，代码实际是「X 账号 + 官方源」。

## 3. 目标架构

### 3.1 总体结构

```text
src/
  app/                      上层：组装和对外入口（agent-kit 所说的「使用方应用」）
    cli/                    CLI 命令
    rivus/                  Rivus 插件：Tool、Profile、Automation 注册，多阶段协议和会话缓存
    products/               subscriptions  frontier  news  daily-ai  research：调用各模块，组合成一份产品
    render/                 Markdown 和 Automation Presentation
    config/                 环境变量解析、资源定位、状态目录
    layers.ts               Effect Layer 组装（只有 app 运行 Effect）
  kernel/                   共享内核：Result、时间窗、文本和 URL 工具
  acquisition/              采集
  reading/                  阅读
  editorial/                编辑
  delivery/                 投递与记忆
```

每个业务模块的内部结构与 agent-kit 一致，只建用得到的目录：

```text
<module>/
  domain/<concept>/         值对象、聚合、策略、错误（纯 TS）
    adapters/               外部格式 → 本 concept 的模型（防腐层，纯函数）
  application/
    use-cases/              模块对外提供的操作，一个文件一个
    services/               use case 之间共用的编排
    ports.ts                端口定义（Context.Service）
  infra/
    adapters/               端口实现：HTTP、浏览器、子进程
    repository/             存储实现
    models/                 存储格式及其编解码
    factories/              Layer 组装
  index.ts                  模块对外的接口
```

### 3.2 模块边界

| 模块 | 回答的问题 | 包含 | 不包含 |
| --- | --- | --- | --- |
| **acquisition** 采集 | 信息从哪里来 | 来源无关的 `Item` 模型（3.3）；源目录规则和论文源判定；`SearchBudget` 聚合；`adapters/` 把 RSS、列表页、GitHub、Doubao、Grok、GLM 的格式翻译成 Item；infra 负责取数；检索的预算与重试装饰器 | 判断哪些值得发 |
| **reading** 阅读 | 这个 URL 的原文是什么 | `Document` 模型、URL 安全策略、正文抽取；浏览器 / HTTP / 视频 / GLM 的回退链。不依赖任何其他模块，可以给 wiki 复用（3.8） | 可信度判断、时间窗判断 |
| **editorial** 编辑 | 哪些值得发、给多少篇幅、怎么写 | 去重；订阅打分、展示深度、论文配额、AI 精选；新闻的相关性、权威性、主题配额；Daily AI 的类别；Agent 草稿校验和数字溯源；带理由的决策记录。**纯计算**，按 agent-kit 的规则没有 `application/`，直接导出 domain 函数 | IO、状态 |
| **delivery** 投递与记忆 | 发到哪里、发过什么 | 已投递账本（seen、researched、Daily AI 回执、only-new 过滤）；Notifier（stdout + 可选 webhook）；运行记录和诊断快照的存储 | 内容判断 |

每一类现有的重复，在新结构里都只有一个所有者：

| 现在的重复（2.1） | 归属 |
| --- | --- |
| 5 种「一条信息」的模型 | acquisition 的 `Item`。`DailyAiEvidence` 和 `SubscriptionEvidence` 是 editorial 给 Agent 的证据投影 |
| 3 份去重实现 | editorial 的 identity，两种判定各自保留原有语义 |
| 4 种「已投递」记忆 | delivery 的账本 |
| 3 种时间窗 | kernel |
| 3 种审计格式 | 决策记录归 editorial，存储归 delivery；对外结构不变 |
| 2 份 Agent 编辑协议 | 校验规则归 editorial 的 evidence；阶段协议和会话缓存归 `app/rivus/` |
| 2 份读原文实现 | reading |

跨模块的编排，例如「采集 → 判断 → 不够再补采 → 投递」，放在 `app/products/`。这对应 agent-kit 的规则：触发时机、重试、结果存在哪里这类策略属于使用方应用。各模块之间不调用彼此的 use case。Daily AI 不再借用「行业前沿」的整条流程，而是直接调用 acquisition 采集官方源和 X 账号。

### 3.3 来源无关的 Item

acquisition 的 domain concept 目录和整个 editorial 只认「信号」，不认「来源」。来源格式只出现在 `acquisition/domain/item/adapters/` 和 `acquisition/infra/adapters/`。

```ts
type Item = {
  id: ItemId;                     // 由 adapter 生成，规则只比较、不解析
  kind: "publication" | "paper" | "release" | "change" | "project" | "post";
  subject: { key: SubjectKey; name: string; url?: string;
             profile?: { description?: string; keywords: string[]; popularity?: number; lastActiveAt?: string } };
  content: { title?: string; excerpt?: string; url?: string };
  publishedAt: { value: string; precision: "instant" | "date" };
  provenance: { origin: string; actor?: { name: string; followed: boolean }; note?: string };
  credibility: { tier: "official" | "authoritative" | "aggregator" | "unrated"; method?: "configured-domain" | "article-read" };
  signals: ReadonlyArray<{ type: SignalType; label: string }>;   // label 是 adapter 给出的原因文案
  rank?: { position: number; score?: number };
  display: { label?: string; reference?: string; facts: string[] }; // 只给展示用，规则不读
};
```

`SignalType` 要细到能复现现有的分数表。例如现在 `trending` 是 80 分、`recommendation` 是 75 分，就需要分成两个信号。adapter 只决定「这是什么信号」，权重始终由 editorial 决定。

| 来源事实 | 中立字段 | adapter |
| --- | --- | --- |
| GitHub Watch / Release / PR（merged、opened、closed）/ Fork / Create 事件 | `signals` + `kind` | `github-event.ts` |
| GitHub Home 的 trending、recommendation、follow、announcement 卡片 | `signals` | `github-home.ts` |
| 仓库元信息、关注列表 | `subject.profile`、`provenance.actor.followed`、`display.facts`（如 `⭐ 1.2k`） | `github-repository.ts` |
| 订阅源 tags 中的 papers/academic、arXiv 域名 | `kind: "paper"` | `rss.ts`，以及 `domain/source/` 中的论文源判定 |
| Doubao `authInfoLevel`、GLM 来源核验 | `credibility` | `doubao.ts`、`glm.ts` |
| 检索排位 | `rank` | 各检索 adapter |
| Grok 整理的 X 帖子 | `credibility.tier: "unrated"`、`provenance.note`（角标文案） | `grok.ts` |

每个 adapter 文件内部的处理顺序都是：先用 `effect/Schema` 定义 DTO（只描述用到的字段），解码原始数据，再映射成 Item。解码失败时返回 `Result`。

**以下与来源相关的内容必须保留：**

| 内容 | 做法 |
| --- | --- |
| 条目 id、分组键、研究记录键（`github-pull-request:<repo>:<n>`、`publication:<url>`、`rss:<url>` 等） | 由 adapter 按原规则生成 |
| 审计中的原因文案（如 `followee starred this repository`） | 作为 `signal.label` 由 adapter 给出 |
| Markdown 中的来源字样（「GitHub Home + 个人博客」「PR #12」「⭐ 1.2k」「X（Grok 整理）」） | 由 `display` 字段和 `app/products` 的配置提供 |
| CLI `--json` 中的 `events`（原始的 `ActivityCard` 结构，skill 依赖它） | adapter 同时产出一份 `ActivityCardDto`，由采集 use case 按 item id 一并返回；editorial 看不到它，由 `app/products` 还原成原来的 JSON |

**差分测试。** 迁移期间把旧的打分和筛选实现原样保留在 `tests/oracle/` 中，要求新旧实现在全部 fixture 和随机组合上给出完全一致的候选、分数、原因、排序、展示深度，以及新闻的接受或拒绝原因。新闻权威性的映射做穷举测试。P8 删除旧实现。

### 3.4 各模块的内部布局

```text
acquisition/
  domain/
    item/            Item、SignalType、Credibility
      adapters/      rss.ts  web-page.ts  github-event.ts  github-home.ts  github-repository.ts
                     doubao.ts  grok.ts  glm.ts
    source/          源配置、源目录的增删规则、论文源判定
    search/          SearchInput、SearchPage、SearchFailure
    budget/          SearchBudget 聚合：用量、预留、缓存新鲜度、缓存键
  application/
    ports.ts         RssFeed、WebPage、GitHubActivity、GitHubCatalog、SearchProvider、SearchBudgetRepository、SourceCatalogStore
    use-cases/       collect-sources.ts  search.ts  collect-x-posts.ts  manage-source-catalog.ts
    services/        with-budget.ts  with-retry.ts
  infra/
    adapters/        rss-http.ts  web-page-http.ts  github-rest.ts  github-home-browser.ts  browser.ts
                     doubao-http.ts  grok-cli.ts  glm-search.ts
    repository/      search-budget-file.ts  source-catalog-file.ts
    models/          状态文件和配置文件的 Schema
    factories/       AcquisitionLive
  index.ts

reading/
  domain/
    document/        Document、URL 安全策略
      adapters/      html-article.ts  video-evidence.ts
  application/       ports.ts（VideoReader、BrowserReader、HttpReader、GlmReader）  use-cases/read-original.ts
  infra/adapters/    http-reader.ts  browser-reader.ts  video-reader.ts  video-frames.ts  glm-reader.ts
  index.ts

editorial/            纯计算，没有 application/ 和 infra/
  domain/
    identity/        canonical identity、同一事件判定
    subscription/    候选聚合、按信号打分、展示深度、论文配额、AI 精选、研究合并
    news/            命中拒绝原因、相关性、权威性、故事评分、主题配额、8 条上限
    daily-ai/        类别、草稿规则
    evidence/        证据投影、草稿逐条校验、数字溯源
    decision/        带理由的决策、审计中的候选记录
  index.ts

delivery/
  domain/
    ledger/          seen、researched、only-new 过滤
    receipt/         Daily AI 回执（提交时返回新值，不原地修改）
    run-audit/       运行记录的结构
  application/       ports.ts（Notifier、FeedStateStore、RunArchive、DiagnosticsStore）
                     use-cases/deliver.ts  record-research.ts  inspect-runs.ts
  infra/
    adapters/        notifier.ts（stdout + 可选 webhook）
    repository/      feed-state-file.ts  run-archive-files.ts  diagnostics-file.ts
    models/          feed-state.json 等文件格式的 Schema
  index.ts

app/
  products/          subscriptions/  frontier/  news/  daily-ai/  research/
                     每个目录包含：flow.ts（编排）  tool.ts  automation.ts  cli.ts
                     news 另有 topics.ts（解析 news-topics.json）、hybrid.ts（混合检索的回退编排）
  rivus/             plugin.ts  phases.ts（订阅三阶段、Daily AI 两阶段的协议和会话缓存）
  cli/               main.ts（bin）
  render/            markdown、automation presentation、json
  config/            env.ts（effect/Config）  assets.ts  state-root.ts
  layers.ts          AppLive
```

### 3.5 依赖规则（照抄 agent-kit 的 boundaries.ts）

模块之间：

| 模块 | 可以依赖 |
| --- | --- |
| kernel | 无 |
| acquisition | kernel |
| reading | kernel |
| editorial | kernel；acquisition、reading（只能 `import type`，对应 agent-kit 中 cost 对 sessions 的 `typesOnly`） |
| delivery | kernel |
| app | 全部模块，但只通过各模块的 `index.ts` |

模块内部（与 agent-kit 的 layer rules 一致）：

| 层 | 可以依赖 | 禁止 |
| --- | --- | --- |
| `domain/<concept>/` | 同模块的其他 concept、kernel、上游模块的类型 | 任何 `adapters/`、外部包（含 `effect`）、`node:*`、IO、无参的 `Date.now()` / `new Date()`、来源词表（github、rss、doubao、grok、glm、arxiv、x.com） |
| `domain/<concept>/adapters/` | 同模块的 domain 和 adapters、kernel、`effect/Schema`、解析库（`fast-xml-parser`、`cheerio`、`he`） | `node:*`、IO、`Effect` 类型 |
| `application/` | 同模块的 domain、adapters、application，以及 kernel、`effect` | 同模块的 infra、`node:*`、`process.env`、`console` |
| `infra/` | 同模块的 domain、application、infra，以及 kernel、`effect`、`node:*`、外部包白名单（`playwright` 只允许在 `acquisition/infra/adapters/browser.ts` 和 `reading/infra/adapters/browser-reader.ts` 中使用） | 其他模块的内部文件 |
| `app/` | 各模块的 `index.ts`、kernel、`effect`、`@rivus/agent`、`node:*` | 模块的内部文件 |

清单文件是 `scripts/architecture/boundaries.ts`，测试是 `tests/repo/architecture.test.ts`。测试用已有的 `typescript` 依赖解析每个文件的 import，并区分 `import type`，同时检查 concept 目录中不出现来源词表。正例和反例都要覆盖。

### 3.6 Effect 与校验

| 位置 | 用法 |
| --- | --- |
| `domain/`（含 adapters） | 纯 TS，不依赖 Effect。失败时返回 kernel 的 `Result`，错误是带 `_tag` 的对象。需要保留固定 message 的校验错误（`SUBSCRIPTION_SUMMARY_VALIDATION_FAILED`、`DAILY_AI_DRAFT_VALIDATION_FAILED`）用继承 `Error` 并带 `_tag` 的类，message 逐字不变。adapters 只可使用 `effect/Schema` 解码 |
| `application/` | use case 返回 `Effect`。端口是 `Context.Service`，key 为 `rss-summary/<module>/<Port>/v1`。domain 返回的 `Result` 通过一行 `fromResult` 进入错误通道。时间用 `Clock`，并发用 `Effect.forEach({ concurrency })`，逐项隔离用 `Effect.result`，重试用 `Schedule`，资源用 `Scope` |
| `infra/` | `Layer`，命名为 `<Variant><Port>Live`。HTTP 用 `HttpClient`（`FetchHttpClient`），文件用 `FileSystem`，子进程用 `ChildProcess`。playwright、锁、临时目录用 `acquireRelease` 管理；状态写入放在 `uninterruptible` 区域中 |
| `app/` | 用 `effect/Config` 解析环境变量，错误映射回原有文案。用 `Layer.provideMerge` 组装 `AppLive`。CLI 每条命令调用一次 `runPromiseExit`；Rivus 插件持有一个 `ManagedRuntime`。会话缓存用 `Ref<Map>`，保留「按插入顺序、最多 8 个」的淘汰规则 |

执行规则：

- 只重试明确可重试的失败，重试次数和退避与现在一致；永远不重试已经部分执行的写入。
- 预算预留在 provider 失败后仍然算作已消耗。
- 不使用 `effect/cli`：CLI 的帮助文本和参数语义必须保持不变。
- Tool 的 `inputSchema` 仍然手写，原样搬移。

与 agent-kit 的两处差异：

1. 校验用 `effect/Schema`，不用 zod（D2）。
2. adapters 中允许 `effect/Schema`，但不允许其他 Effect 模块。

### 3.7 端口实现与扩展点

**唯一的插件接口是 `SearchProvider`。** 原因有两个：`NEWS_SEARCH_MODE` 要在 doubao、grok、hybrid、combined 之间切换；`withBudget` 和 `withRetry` 需要能包住任意一个 provider（两者都是接收一个 provider、返回一个 provider，不使用继承）。

其余都是普通端口，用显式代码分派：

- 订阅源：`collect-sources` 中用 `switch` 区分 `rss` 和 `page`；
- 原文读取：`read-original` 中写出固定的回退顺序（视频 → 浏览器 → HTTP →（开关打开时）GLM）；
- 投递：一个 `Notifier` 端口。

不建 base class，也不建工厂函数，每个端口实现自己写完整的「取数 → adapter」。源健康状况在 `collect-sources` 中统一记录。URL 安全检查和 80 字符的正文下限在 `read-original` 中统一执行。

现有的超时和重试值逐个照搬，并用测试锁定：

| 来源 | 超时 | 重试 |
| --- | --- | --- |
| RSS | 12 秒 | 不重试 |
| 列表页 | 12 秒 | 网络瞬时错误、HTTP 429、HTTP 5xx 最多重试 3 次，退避从 250ms 起每次翻倍 |
| GitHub REST | 无 | 不重试 |
| Doubao | 15 秒 | 遇到速率限制时由 `withRetry` 重试 |
| Grok | 120 秒 | — |

以后的扩展方式：

- **新宿主**：`app/` 下新增一个目录，遍历同一张产品列表。
- **新渠道**：先让输出经过 View IR（P7），再把 `Notifier` 扩展为多渠道。
- **新来源**：新增一个 adapter 和对应的端口实现。

### 3.8 存储与 wiki

**现在不引入数据库。** 理由：单用户、数据量小，唯一有多个写入方的搜索预算已经用锁加原子写保护。各状态文件的格式保持不变。投递账本只有 CLI 一个写入方，所以不加 revision 校验。以后真的需要时，在 `infra/repository/` 下增加一个 `node:sqlite` 实现即可，端口不用改。

**与 wiki 的关系：共享接口定义，不共享代码。** wiki 的 `bin/wiki ingest` 和 reading 做的是同一件事，wiki 的 `--file` 参数已经接受包含 `content`、`title`、`author`、`publishedTime` 的 JSON。reading 只依赖 kernel，可以整体抽出。重构完成后另提 PR，增加：

- `rss-summary read <url> --json`；
- 保留原文格式的 Markdown 输出模式。

视频读取暂时不合并：wiki 对 B 站的处理更成熟，本仓库有关键帧加视觉模型，两边各有所长。

### 3.9 考虑过、但没有采用的方案

| 方案 | 不采用的原因 |
| --- | --- |
| 按产品划分模块（现状：feeds、news、daily-ai） | 同一个概念被重复实现，见 2.1 |
| 按来源类型划分模块 | 编辑规则跨来源，例如订阅打分同时作用于 GitHub 和 RSS |
| 单一 context，`domain/` 下按业务分子目录 | 四块之间的边界只能靠目录约定；按模块划分后，每个模块有自己的 `index.ts` 和依赖规则，边界更清楚 |
| domain 中使用 Effect（如 hex-effect 在 domain 里用 `Effect.gen` 调用服务） | 业务规则会绑定到 Effect，而 Effect 4 刚发布不久 |
| base class 或 `defineXxx` 工厂函数，以及四个插件接口 | 真正共用的只有几行代码；只有检索需要按配置切换 |
| 引入数据库 | 数据量小，唯一有多个写入方的场景已经加锁 |

## 4. 决定

| # | 决定 | 状态 | 内容 |
| --- | --- | --- | --- |
| D1 | Effect | **已定** | 迁移到 Effect 4；domain 以外的部分尽量使用 Effect，规则见 3.6 |
| D2 | 校验库 | **已定** | `effect/Schema`，替换 lodash 谓词和手写判断 |
| D3 | 模块划分 | **已定** | 上层 `app/`，下层 acquisition、reading、editorial、delivery 四个模块（3.2） |
| D4 | 包结构 | 推荐单包 | 只有一个部署单元、一个 Rivus 导出 |
| D5 | PR 目标仓库 | **已定** | PerfectPan/rss-summary |
| D6 | 并行功能分支 | **已定**：不做协调 | 按阶段正常提 PR |
| D7 | 数据库 | 推荐现在不引入 | 3.8 |
| D8 | 新宿主和新渠道 | **已定**：以后再做 | 3.7 |
| D9 | Rivus 下的 only-new | **已定**：有意设计，保持现状 | `docs/rivus-plugin.md` 写明 Feed Tools 只读 only-new 状态、不写 seen；重复投递由相邻运行的日历日窗口互不重叠和 Rivus 的投递账本共同防止 |
| D10 | 与 wiki 的整合 | **推后**：重构完成后再定 | 本次只保证 reading 只依赖 kernel（3.8） |
| D11 | Effect 的版本和依赖方式 | **已定**：精确固定为 dependency | 版本与 `@rivus/agent` 实际解析到的 4.x 一致，由 `package:check` 确认只安装了一份 |
| D12 | Node 平台实现 | **已定** | `@effect/platform-node` 和 `@effect/vitest` 都有 4.0.x 版本，peer 为 `effect ^4.0.0`。`effect` 精确固定为 `4.0.0`（与 `@rivus/agent@0.18.0` 实际解析到的版本一致），平台包需要时同样固定为 4.0.0 |
| D13 | domain 是否使用 Effect | **已定**：不使用 | 3.6 |
| D14 | 纵向切片 | **已定**：不做 | 按模块顺序推进（第 6 节） |

## 5. 对外接口与兼容性清单（每个阶段都必须保持不变）

| 类别 | 内容 | 验证方式 |
| --- | --- | --- |
| CLI | `digest`、`industry`、`feeds add/remove/delete/list/test`、`github-home login`、`research add/search/read`、`runs list/failures/show` 的参数、退出码、stdout/stderr | P0 黄金测试 |
| 环境变量 | `.env.example` 中的每一项，以及代码读取的 `FEED_*`、`GITHUB_*`、`GH_FEED_TOKEN`、`NOTIFY_WEBHOOK_URL`、`RSS_FEEDS*`、`INDUSTRY_*`、`NEWS_*`、`DOUBAO_*`、`GLM_CODING_API_KEY`、`DAILY_AI_X_HANDLES`、`X_ACCOUNT_POSTS_PER_FETCH`、`RSS_ARTICLE_*`、`RIVUS_DEPLOYMENT_STATE_DIR`；默认值、上下限和报错文案都不变 | `tests/composition/env.test.ts` |
| 输出 | Markdown/JSON 按字节一致；CLI `--json` 输出的 `DigestDocument` 结构不变（skill 依赖它） | 黄金测试 |
| Rivus | 5 个 Tool 的 id、digest、version、inputSchema、risk；Profile 的 systemPrompt；5 个 Automation 的 id、提示词和 presentation | `register()` 快照 |
| Agent 依赖的文案 | `SUBSCRIPTION_SUMMARY_VALIDATION_FAILED: …`、`DAILY_AI_DRAFT_VALIDATION_FAILED`、`RIVUS_AUTOMATION_SUPPRESSED…`、`AllNewsQueriesFailedError` 的中文提示、证据 id 规则 | 快照 + 常量测试 |
| 状态文件 | `feed-state.json`、`industry-state.json`、`news-search.json`（version 1、严格拒绝多余字段、sha256 缓存键）、`runs/YYYY-MM-DD/*.json|md`、`daily-ai/<sha256>-<phase>.json` | 用重构前生成的 fixture 做往返测试 |
| 包 | `bin.rss-summary`、`exports["./rivus-plugin"]`、`files`；打包后仍能定位 `industry-feeds.json` 和 `news-topics.json` | `pnpm package:check` + 在打包产物中实际运行 |

## 6. 分阶段实施

每个阶段一个 PR，开到 PerfectPan/rss-summary。合入条件：本地 `pnpm verify` 和 `pnpm test:coverage` 通过，CI 的 `Verify` 和 `Coverage` 为绿。文件移动用 `git mv`，「移动」和「修改」拆成两个 commit。P2–P5 期间新旧结构并存：旧代码通过过渡转换函数（如 `itemToActivityCard`）调用新模块，P6 删除这些函数。

### P0 安全网（不移动任何生产代码）

1. 新增 `tests/golden/`，从真实入口端到端运行：`runCliCommand`，以及 `createRssSummaryPlugin().register()` 拿到的 executor。外部依赖的替换方式：
   - `vi.stubGlobal("fetch")` 返回 RSS/Atom、列表页、GitHub REST、Doubao 的 fixture；
   - 状态目录用临时目录；
   - 设置 `GITHUB_FEED_SOURCE=events`，绕开 playwright；
   - Grok 用 fixture 可执行文件（通过 `NEWS_GROK_EXECUTABLE` 指定）输出固定的事件流；
   - 时间全部来自注入值或 fixture。

   覆盖以下场景：`digest` 的 JSON 和 Markdown（含连续两次 `--only-new`，以及 `--dry-run` 不写状态）；`industry`；订阅 Tool 三阶段（含研究失败时取消推送）；Daily AI 两阶段（含全部草稿无效）；新闻午间和晚间（含预算耗尽、全部失败、缓存复用、补采）；`research-article` 的 http 模式；`runs`；`feeds`。结果保存为 `toMatchFileSnapshot` 快照文件。**后续阶段不允许修改这些快照。**
2. 对 `register()` 的完整注册结果做快照。
3. 用当前代码生成各状态文件的 fixture。
4. 建立边界检查的骨架，此阶段只报告、不失败，记录违规数基线。

退出条件：黄金测试连续运行 3 次，结果稳定。

### P1 Effect 4 与 kernel

1. 把 `effect` 精确固定为 4.x（与 `@rivus/agent` 实际解析到的版本一致）。现有的 Effect 3 用法原地改成 Effect 4 的 API，包括 `attempt`、`Effect.gen`，以及 `news-search-budget.ts`、`grok-x.ts`、`x-account-posts.ts` 中的 `Schema`。这一步只换 API，不改行为。
2. 核实 `@effect/platform-node` 和 `@effect/vitest` 是否有与 Effect 4 匹配的版本，按 D12 记录结论。
3. 建立 `kernel/`：包含 `Result`、时间工具（来自 `domain/time.ts`）和文本工具（来自 `domain/text.ts`），报错文案不变。旧文件暂时只做 re-export，到 P8 清零。
4. 替换 `lodash-es`：domain 和 kernel 改用语言内置能力，其他层改用 `effect/Array`。
5. 搭好 `app/` 的运行骨架：CLI 用 `runPromiseExit`，Rivus 用一个 `ManagedRuntime`。现有的 `Effect.runPromise` 调用点全部改为经过这个骨架。

退出条件：`node_modules` 中只有一份 `effect`；黄金测试不变。

### P2 acquisition

1. domain：
   - `item/`：来源无关的 `Item`，见 3.3；
   - `item/adapters/`：rss、web-page、github-event、github-home、github-repository、doubao、grok、glm。每个 adapter 用 `effect/Schema` 定义 DTO，解码后映射成 Item，并同时产出 `ActivityCardDto`。id 和原因文案按原规则生成；缺失日期时使用传入的 `now`；
   - `source/`：包含论文源判定；
   - `search/`；
   - `budget/`：`SearchBudget` 聚合。
2. application：
   - `ports.ts`；
   - `use-cases/`：`collect-sources`（合并现有的两个批量采集器，在这里统一做逐源隔离和源健康记录）、`search`、`collect-x-posts`、`manage-source-catalog`；
   - `services/`：`with-budget`、`with-retry`。`with-retry` 用 `Schedule` 实现退避、jitter 和 `Retry-After`，最多 3 次；检索并发为 2；用 `TestClock` 逐项比对退避时间。
3. infra：
   - `adapters/`：rss-http、web-page-http、github-rest、github-home-browser、browser（playwright 由 Scope 管理）、doubao-http、grok-cli、glm-search。超时和重试按 3.7 照搬；
   - `repository/search-budget-file`：锁用 `acquireRelease`，写入放进 `uninterruptible`，Schema 开启 `onExcessProperty: "error"`，状态无效时保留原文件；
   - `repository/source-catalog-file`。
4. 旧的 application 代码改为通过过渡转换函数（`itemToActivityCard`、`itemToSearchResult`）调用 acquisition。预算默认值只在一处定义。

退出条件：每个 adapter 都有字段级 fixture 测试；`news-search.json` 往返测试通过；退避时间与原实现一致；黄金测试不变。

### P3 reading

1. domain：`document/`，包含 `Document` 模型和 URL 安全策略；以及 `adapters/html-article.ts`、`video-evidence.ts`。
2. application：`use-cases/read-original.ts`。先做 URL 安全检查，再按「视频 → 浏览器 → HTTP →（开关打开时）GLM」的固定顺序回退；正文少于 80 个字符算失败；资源挂在 Scope 上，超时用 `Effect.timeout`。
3. infra：四个读取器，以及 `video-frames.ts`。
4. 边界测试加一条：reading 只能依赖 kernel。

### P4 delivery

1. domain：
   - `ledger/`：承接 `filterNewCandidates`、`filterUnresearchedCandidates`、`markCandidatesSeen`、`researchKeyForCandidate`；
   - `receipt/`：提交时返回新值，不再原地修改；
   - `run-audit/`。
2. application：`use-cases/deliver`，保留「投递成功后才标记已读」的顺序，「标记并保存」放进 `uninterruptible`，`stateStatus` 的取值不变；`record-research`；`inspect-runs`。
3. infra：
   - `adapters/notifier`，行为与 `createNotifier` 一致；
   - `repository/` 下的 feed-state-file、run-archive-files、diagnostics-file，文件格式全部不变；
   - 同时消除 infra 对 application 的反向依赖。

退出条件：各状态文件往返测试通过；黄金测试不变。

### P5 editorial

1. 先在 `tests/oracle/` 中保留旧的打分和筛选实现，建立差分测试（3.3）。
2. domain：
   - `identity/`：两种同一事件判定各自保留原有语义；
   - `subscription/`：候选聚合、按信号打分（`daysSince` 改为接收 `now`）、展示深度、论文配额、AI 精选、研究合并。研究失败规则和 `applyEditorialSelectionToAudit` 从 `presentation/subscription-tool.ts` 下沉到这里；
   - `news/`：命中拒绝原因、故事、选择、新闻审计。审计改为接收纯值结果，不再依赖 `PromiseSettledResult` 和 `instanceof`；
   - `daily-ai/`；
   - `evidence/`：草稿逐条校验和数字溯源，错误文案逐字不变；
   - `decision/`。
3. 旧代码通过过渡转换函数调用 editorial。

退出条件：差分测试在全部 fixture 和随机组合上一致；editorial 中没有 IO、没有隐式时钟、没有来源词表；黄金测试不变。

### P6 app 与打包

1. `app/products/`：
   - frontier、subscriptions、news、daily-ai、research 的流程（flow）、`tool.ts`、`automation.ts`、`cli.ts`。Tool 输入直接解码为请求对象，不再拼成 argv；
   - news 的 `topics.ts` 和 `hybrid.ts`；
   - Daily AI 直接调用 `collect-sources`（官方源，排除论文）和 `collect-x-posts`，删除 `defaultIndustry` 中拼 argv 和调用 `runPromise` 的代码。
2. `app/rivus/`：`plugin.ts` 遍历产品列表完成注册；`phases.ts` 实现订阅三阶段和 Daily AI 两阶段的协议，以及会话缓存（最多 8 个，按插入顺序淘汰）。`app/cli/main.ts` 的帮助文本不变。
3. `app/config/`：
   - `env.ts` 用 `effect/Config` 一次性解析环境变量，报错文案逐项与原来一致；
   - `state-root.ts` 统一状态目录；
   - `assets.ts` 从包根目录定位资源文件；
   - `layers.ts` 组装 `AppLive`。
4. 删除过渡转换函数，以及旧的四个目录（`domain`、`application`、`infrastructure`、`presentation`）。
5. `package.json`：`bin` 改为 `./dist/app/cli/main.js`，`exports["./rivus-plugin"]` 改为 `./dist/app/rivus/plugin.js`，子路径名不变；删除 `lodash-es` 和 `@types/lodash-es`。

退出条件：`package:check` 通过；在打包后的消费者环境中实际运行 `rss-summary industry --json --dry-run`，能找到配置文件；黄金测试和注册快照都不变。

### P7 render 基于 View IR

1. 各产品先产出 View IR，再由 `app/render/markdown` 生成 Markdown，输出与原来逐字节一致。
2. `app/render/automation` 直接从 View IR 生成 Automation Presentation，删除对 Markdown 的反向解析。逐个 Automation 做快照，与旧输出比对。

### P8 强制约束与文档

1. 边界测试切换为失败模式；删除 `vite.config.ts` 中的两条 `no-restricted-imports` 覆盖；清零过渡 re-export；删除 `tests/oracle/`。
2. `scripts/check-test-layout.mjs` 改为按新目录做镜像检查。
3. 文档：
   - 重写 `docs/architecture.md`，同时修正 2.9 的漂移；
   - 更新 `docs/technology-decisions.md`；
   - 在 `AGENTS.md` 中写明「代码放在哪里」；
   - 新增 `CONTEXT.md` 术语表。
4. 把长期有效的约束迁入现状文档，然后将本计划标记为 completed。

## 7. 文件迁移映射

| 现在 | 目标 |
| --- | --- |
| `domain/record.ts` | 删除（由 `effect/Schema` 替代） |
| `domain/text.ts`、`domain/time.ts`、`domain/news-time.ts` | `kernel/`；`isSameTitleEvent` 移到 `editorial/domain/identity/` |
| `domain/attention.ts` | `editorial/domain/subscription/` |
| `domain/run-audit.ts` | `delivery/domain/run-audit/`；候选决策部分移到 `editorial/domain/decision/` |
| `domain/digest.ts` | 类型移到 `acquisition/domain/item/`；`normalizeEvent` 移到 `acquisition/domain/item/adapters/github-event.ts`；打分、identity、配额移到 `editorial/domain/{subscription,identity}/` |
| `domain/news.ts` | `editorial/domain/news/`；话题类型移到 `app/products/news/topics.ts` |
| `domain/daily-ai.ts` | `editorial/domain/{daily-ai,evidence}/` |
| `domain/subscription-editorial.ts` | `editorial/domain/{evidence,subscription}/` |
| `application/effect.ts` | 删除 |
| `application/delivery.ts` | `delivery/application/use-cases/deliver.ts` |
| `application/daily-ai-receipt.ts` | `delivery/domain/receipt/` |
| `application/digest.ts` | `app/products/subscriptions/flow.ts` |
| `application/industry-brief.ts` | `app/products/frontier/flow.ts` |
| `application/daily-ai-digest.ts` | `app/products/daily-ai/flow.ts` |
| `application/x-account-posts.ts` | `acquisition/application/use-cases/collect-x-posts.ts` |
| `application/news-brief.ts` | `app/products/news/flow.ts`；重试和并发移到 `acquisition/application/` |
| `application/hybrid-news-search.ts` | `app/products/news/hybrid.ts` |
| `application/news-audit.ts` | `editorial/domain/news/` |
| `infrastructure/config.ts` | `app/config/env.ts`；源配置规则移到 `acquisition/domain/source/` |
| `infrastructure/config-parse.ts`、`parsing.ts` | 删除（由 `effect/Schema`、`effect/Config` 替代）；`errorMessage` 移到 `kernel/` |
| `infrastructure/state.ts` | `delivery/infra/repository/feed-state-file.ts`、`delivery/domain/ledger/` |
| `infrastructure/feed-store.ts` | `acquisition/infra/repository/source-catalog-file.ts`、`acquisition/domain/source/` |
| `infrastructure/run-store.ts` | `delivery/infra/repository/run-archive-files.ts` |
| `infrastructure/notifier.ts` | `delivery/infra/adapters/notifier.ts` |
| `infrastructure/rss-batch.ts`、`industry-source-batch.ts` | `acquisition/application/use-cases/collect-sources.ts` |
| `infrastructure/rss.ts`、`web-page.ts` | `acquisition/domain/item/adapters/{rss,web-page}.ts` + `acquisition/infra/adapters/{rss-http,web-page-http}.ts` |
| `infrastructure/github.ts`、`github-home.ts` | `acquisition/domain/item/adapters/{github-repository,github-home}.ts` + `acquisition/infra/adapters/{github-rest,github-home-browser,browser}.ts` |
| `infrastructure/news-search.ts` | `acquisition/domain/search/`、`acquisition/application/ports.ts` |
| `infrastructure/news-search-budget.ts` | `acquisition/domain/budget/`、`application/services/with-budget.ts`、`infra/repository/search-budget-file.ts` |
| `infrastructure/news-topics.ts` | `app/products/news/topics.ts` |
| `infrastructure/doubao-search.ts`、`grok-search.ts`、`grok-x.ts`、`glm-research.ts` | `acquisition/domain/item/adapters/{doubao,grok,glm}.ts` + `acquisition/infra/adapters/`；GLM 的读取部分移到 `reading/infra/adapters/glm-reader.ts` |
| `infrastructure/article-research.ts`、`browser-article-research.ts`、`video-research.ts`、`video-frames.ts` | `reading/` |
| `infrastructure/daily-ai-diagnostics.ts` | `delivery/infra/repository/diagnostics-file.ts` |
| `presentation/cli.ts` 及各 `*-cli.ts` | `app/cli/main.ts`、各产品的 `cli.ts` |
| `presentation/rivus-plugin.ts` | `app/rivus/plugin.ts`；schema 和提示词移到各产品的 `tool.ts`、`automation.ts` |
| `presentation/subscription-tool.ts`、`rivus-digest.ts`、`rivus-industry.ts`、`daily-ai-tool.ts`、`research-tool.ts` | 各产品的 `tool.ts`，以及 `app/rivus/phases.ts` |
| `presentation/*-render.ts`、`render.ts`、`candidate-*.ts`、`markdown.ts`、`automation-presentation.ts` | `app/render/` |

测试随源码迁移，目录与 `src/` 对应。另外新增三个测试目录：`tests/golden/`、`tests/oracle/`（P8 删除）、`tests/repo/`。

## 8. 测试策略

- P0 的黄金测试和注册快照是判断「行为不变」的唯一依据。如果需要修改快照，说明出现了缺陷：停下来，单独记 issue。
- 各层的测试方式：
  - domain 用普通单元测试；
  - adapters 用 fixture 做字段级测试；
  - use case 和产品流程用替身 Layer 配合 `TestClock`；
  - `SearchProvider` 的每个实现跑同一套测试，再分别与 `withBudget`、`withRetry` 组合后测试。
- 新增的测试：
  - `SearchBudget` 的合法与非法状态转移；
  - 状态文件往返；
  - 差分测试；
  - 边界测试的正例和反例；
  - 环境变量解析，覆盖 `.env.example` 中的每一项。
- 不为 re-export 写测试。覆盖率阈值（85/75/90/85）保持不变。

## 9. 风险与回滚

| 风险 | 缓解措施 |
| --- | --- |
| 信号模型表达不了现有规则，或权重对不齐 | P5 差分测试；如果确实表达不了，退回为「只用 adapter 做格式隔离、不做信号中立化」 |
| Item 映射时丢失字段或改变语义（发布时间精度、id 规则） | 字段级 adapter 测试；P6 之前旧路径持续跑黄金测试 |
| Agent 依赖的文案或 Tool schema 被无意改动 | 注册快照加文案常量测试；只做原样搬移 |
| 预算状态不兼容，导致用量被清零、多花付费额度 | P2 往返测试；状态无效时保留原文件并报错 |
| Effect 3 升到 4 后错误文案或时序发生变化 | 错误在边界处映射回原文案；`TestClock` 比对退避；逐项比对环境变量的报错文案 |
| Effect 4 刚发布，API 可能调整 | 精确固定版本；domain 不依赖 Effect |
| 目录变深后资源路径失效 | `app/config/assets.ts`，并在打包产物中实际运行验证 |
| 改动量大，评审困难 | 9 个阶段分别提 PR；「移动」和「修改」分开 commit |

回滚：每个阶段都是不改变行为的独立 PR，可以从最新的开始逐个 revert。状态文件格式不变，回滚时不需要迁移数据。

## 10. 工作量估计

| 阶段 | 规模 | 主要工作 |
| --- | --- | --- |
| P0 | 中 | fixture，尤其是 Grok 事件流的 fixture 可执行文件 |
| P1 | 中 | Effect 3 升 4、平台实现核实、运行骨架、替换 lodash |
| P2 | 大 | Item 模型、8 个 adapter、端口实现、预算聚合、装饰器 |
| P3 | 中 | 原文读取链 |
| P4 | 中 | 账本、Notifier、运行记录 |
| P5 | 大 | 全部编辑规则、差分测试 |
| P6 | 大 | 五个产品流程、Rivus 和 CLI、配置、打包 |
| P7 | 中 | View IR 与输出比对 |
| P8 | 中 | 边界测试、布局脚本、文档 |
