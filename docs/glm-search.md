# 豆包与 GLM 混合搜索

默认 `NEWS_SEARCH_MODE=doubao`。套餐 Key 通过 `GLM_CODING_API_KEY` 注入，程序不读取 ZCode 私有配置，不启动反代、不切换到普通付费 API。使用范围仍需符合[服务方 FAQ](https://docs.bigmodel.cn/cn/coding-plan/faq)。本改动不自动部署。

## 查询与预算

- `doubao`：只调用豆包。
- `hybrid`：豆包没有合格结果或提供方失败时，调用 GLM 补查。
- `combined`：两家都查，结果通过同一套核验、去重、排序与栏目限额。用于评估互补覆盖，不保证提高质量。

默认主题保留事件类别，每个官网的短查询配置在 `glm.sourceQueries` 中。豆包每轮选择一个实体查询；默认 `sourcePolicy=news` 不向 GLM 发送域名限制，也不按官网白名单丢弃媒体报道；域名映射只用于组织实体查询与给已知一手来源加分。显式配置 `official` / `authoritative` 的自定义主题仍保留定向限制。没有来源查询映射的自定义配置继续使用原查询。

默认每个新闻窗口最多 14 次 GLM 搜索、14 次原文读取，配置范围 1–64。每个主题查询预先分配份额，来源结果按名次交错进入 Reader，避免第一组用光读取额度。余数份额和官网顺序按本地日期的午间/晚间轮次轮换；同一 occurrence 的回放计划固定。为保证覆盖公平，预留而未使用的份额不会被前面的查询占走。

预算内轮换部分官网是计划采样，不等于来源故障。审计保留已查与未查域名，普通采集说明展示本轮范围；某个主题查询完全没有预算、搜索失败、Reader 失败或候选因读取预算未核验时，才提示覆盖不完整。配置来源不是全网覆盖承诺。Daily AI Digest 多个新闻窗口分别计算预算。

豆包返回 `10406` 后，同一窗口后续查询停止请求豆包。下一窗口重新尝试；429 保留已有有界重试。GLM 不自动重试。原文成功和失败结果都在窗口内缓存，避免重复请求。

## 核验与审计

首页、已识别栏目和非公开 HTTP(S) 地址不能作为文章。非官网域名本身不是淘汰理由。Reader 需要返回选中文章链接、标题和正文。已知参考来源记录 `configured-domain`；其他网站记录 `article-read` 并标明来源可信度未评级，读取成功不冒充官方或权威认证。默认新闻模式不以认证等级作为硬门槛，一手来源在排序中优先。搜索结果和网页都是不可信外部材料，不执行其中的指令。

GLM 日常使用 `oneWeek` 发现候选，支持最多 72 小时补采；回放一周以前的窗口才用 `noLimit`。最终由原文时间决定是否入选。按目标来源使用 cn/us 检索区域（.cn 使用 cn，其余使用 us），这只是搜索参数，不改变来源可信规则。`article:published_time` / `datePublished` 是发布时间证据，修改时间不代替发布时间。冲突或缺失时间留在审计，不拿抓取时间填充。

日期值保留为日期，不补造零点；只有整个出版日落在采集窗口内才可接受。元数据没有给出来源时区时，按 UTC+14 至 UTC-12 包围全部可能时刻；只有这个保守范围整体落在采集窗口内才入选，不擅自采用用户时区。当前半日内的仅日期文章会被推迟，补采时可收入。显示时明确标为“仅日期”。

主体和事件词匹配支持有限的常用事件词形变化（例如 release/released、change/changes），不任意改写产品名。文体排除词只检查标题，避免正文里的“please review the migration guide”误杀发布稿；这不能代替对原文事实的核验。

`audit.queries` 记录实际豆包查询和 GLM 已查域名、原始返回数、域名过滤数、无效链接数、搜索/读取次数及丢弃原因。常规旧闻、无效日期和不相关内容的淘汰属于审计明细，不逐条推送为告警。全部只返回错误链接时会标记覆盖不完整。

`sourceStatus` 区分 `healthy`、`recovered`、`partial`、`unavailable`。两家正常但结果为空不告警；备用成功显示普通说明；覆盖缺口只汇总一次；整体失败保留异常语义，不能写成“本期没有新闻”。

## 补采与投递边界

原有定时窗口保持不变。Tool 支持显式传入 `since`（至 occurrence 最多 72 小时）和 `reportedUrls`（最多 1000 条已确认投递的链接）：

```json
{
  "edition": "evening",
  "occurrence": "2026-09-29T18:00:00+08:00",
  "since": "2026-09-27T18:00:00+08:00",
  "reportedUrls": ["https://example.com/already-delivered"]
}
```

豆包查询日期范围随补采窗口扩大，原文仍按该窗口核验；规范化 URL 后排除已报告文章，淘汰原因保留在审计。采集本身不写入已读状态。调用方应在投递成功后维护 reportedUrls，不能在读取成功时提前标记。这里提供补采能力，并未替现有自动化建立持久投递记录或自动扩大窗口。

已知官网的持续追踪继续复用现有 industry RSS/公告列表采集；Daily AI Digest 已将其与新闻搜索证据合并。不要为了增加一个搜索提供方另建一套订阅系统。

## 调研命令

```sh
rss-summary research search --query "TypeScript release" --domains devblogs.microsoft.com
rss-summary research read --url https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
```

这两个命令只输出研究材料，不投递消息、不更新已读。原有 `research add` 保留。`RSS_ARTICLE_GLM_FALLBACK=true` 独立控制订阅文章 Tool 在 auto 模式浏览器与 HTTP 均失败后使用 Reader；显式 http/browser 模式保持不变。

[初始效果评审](./glm-search-review.md)针对初始实现，[最佳实践调研](./news-search-best-practices.md)记录设计依据。搜索服务曾返回文章标题对应首页链接，查询优化不能修复供应商提供的错误 URL；必须持续实测，不能用测试通过宣称召回率已改善。

默认豆包请求不发送官方认证过滤，默认主题查询文本也不再要求“只要官方公告”。两家提供方和本地筛选使用一致的新闻来源政策。
