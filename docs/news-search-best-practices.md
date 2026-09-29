# 资讯简报检索：一手资料与设计建议

> 本文保留对初始提交 `80428cf` 的评审依据；后续已实现的行为和剩余限制以 [接入说明](./glm-search.md) 为准。

调研日期：2026-09-29。本文区分规范/供应商文档事实与针对 rss-summary 的设计建议；没有据此修改代码、运行配置或调用付费检索接口。实际 GLM 采样见 [效果评审](./glm-search-review.md)。

## 先明确采集目标

建议以“找回这个时间段内值得报告的独立事件”为目标，而非“每个关键词返回若干链接”。接口可用率、文章可读取率、搜索结果相关性、最终事件覆盖率是不同指标。NIST 将 precision 定义为返回集合中相关项比例，将 recall 定义为全部相关项中找回的比例；因此，没有预先标注的新闻集合时，零条入选只说明本次未产出，不能证明当天没有新闻，也不能计算完整召回率。[NIST TREC 评价指标](https://trec.nist.gov/pubs/trec14/appendices/CE.MEASURES05.pdf)

## 固定来源用订阅，搜索补充发现

**规范事实：** RSS item 可以提供文章链接、`guid` 与可选的 `pubDate`；Atom 定义永久条目 `id`、初次发布相关的 `published`、出版者认定的重要修改时间 `updated`。这些字段支持追踪已知发布者的条目；规范并未保证每个站点都有完整、正确或长期保留的 feed。[RSS 2.0](https://www.rssboard.org/rss-specification)、[Atom RFC 4287](https://datatracker.ietf.org/doc/html/rfc4287)

**建议：** 已知重点厂商、官方博客和公告站，优先使用其 RSS/Atom 或明确的发布列表；用搜索发现订阅之外的事件、查找原文和交叉核验。不能把全网搜索排名当成官网发布清单：Google 明确说明即使 URL 已收录，`site:` 查询也不保证返回，结果并不穷尽。[Google site: 限制](https://developers.google.cn/search/docs/monitor-debug/search-operators/all-search-site?hl=en)

当前工作应先盘点已有订阅覆盖哪些主题，再补缺口，避免为搜索而重复建设一个订阅采集器。

## 本地核验：我们自己的规则也有问题

本轮主任务用构造样本直接执行现有领域筛选，其他字段保持可通过：`major release` 入选，换成 `breaking changes` 得到 `intent-mismatch`，在发布内容中增加 `Please review migration guide` 则得到 `excluded-content`。这是已复现的词表边界，不能归咎于搜索提供方；发布公告本就可能包含迁移指南。应先积累正负样本，再把排除词从“出现即拒绝”改为判断文章主要意图，保留可解释理由。依据：[本地领域实现](../src/domain/news.ts)、[主题配置](../news-topics.json)。

时间窗口按发布时间分成 00:00–12:30 与 12:30–运行时刻。若上午发布的消息下午才进入搜索索引，上午没搜到、下午又因发布时间不在窗口而丢弃，可能持续漏报。增加回看与跨运行已报告状态可以补救；这项设计推断对应前述“时间精度与迟到新闻”方案。依据：[本地领域实现](../src/domain/news.ts)。

### 告警不能把正常空结果当故障

本轮主任务注入豆包成功返回空数组、GLM 也成功返回空数组，实际 `generateRivusNewsBrief` 输出 `itemCount: 0`，同时产生 `开发工具关键变更：豆包未找到可用结果，已尝试 GLM 补查` 警告。代码将所有 fallback（含 `no-eligible-results`）及 Reader 的丢弃原因加入 `warnings`，渲染层拼接全部警告。此层未找到硬编码的 ⚠ 图标，不能由此断言图标来自哪一层。依据：[生成逻辑](../src/application/news-brief.ts)、[渲染逻辑](../src/presentation/news-render.ts)。

Google SRE 主张让面向人的告警对应清楚的故障和可行动影响，减少无意义噪声。把原则用于简报，建议保留内部逐条诊断，用户侧按实际覆盖状况归类，而非出现回退就报警。[Google SRE：Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)

| 状态 | 建议的用户表现 |
| --- | --- |
| `healthy-empty`：计划内查询均成功，没有合格新事件 | 正常空态：“本轮未检出符合条件的新资讯”，不写“今天无新闻” |
| `recovered`：主源异常，备用源完成相应覆盖 | 简短说明备用采集或只留审计，不反复输出每次切换 |
| `partial`：预算耗尽、部分主题未查或关键来源失败 | 一条覆盖提示，明确哪些主题未完成；不能把未查当作无结果 |
| `unavailable`：主要采集链路均失败 | 明确说本轮未完成采集，给出需要处理的原因 |

这些名称和文案是本项目建议，SRE 文档没有规定这四个状态；“备用完成覆盖”也不等于备用质量已经合格，必须结合实际验收。

## 查询要表达一个明确意图

**文档事实：** Brave 支持 `site:`、短语及布尔操作；Tavily 提供来源域名和新闻主题/时间参数。这些能力属于各自接口，不能推断 GLM 同样解释所有操作符。[Brave 操作符](https://api-dashboard.search.brave.com/documentation/resources/search-operators)、[Tavily 参数指导](https://help.tavily.com/articles/7879881576-optimizing-your-query-parameters)

**建议：** 把“多个厂商 + 多种事件”的一条长查询拆成单实体或单来源、单事件类型的短查询。例子仅是待测试模板：`Anthropic model announcement` 与 `OpenAI model release` 分开；发布、安全、故障也分开。精确已知文章可用标题/版本号，而开放发现不应预先猜一个版本号。对中文监管消息使用中文词，对英文开发者公告使用英文词。

域名限制应尽量在服务端生效，仍在本地复核返回地址。如果提供方一次只支持一个域名，按域名发有上限的请求，并记录哪些来源未轮到；不能用全网 Top 10 后过滤来假装完成多官网检索。上述拆分属于待验证的工程假设，不能宣称换查询就能修好供应商返回错误链接的问题。[Google site: 范围语义](https://developers.google.cn/search/docs/monitor-debug/search-operators/all-search-site?hl=en)

## 时间要保留含义与精度

| 字段 | 含义与依据 | 简报处理建议 |
| --- | --- | --- |
| 发布时间 | Google 区分 `datePublished` 与 `dateModified`；页面日期也不同于正文描述的事件日期 | 记录字段来源，优先按实际发布信息分配新闻窗口 |
| 修改时间 | Atom `updated` 可表示重要修改，不能等同首次发布 | 保留为更新信号；只有核验新增事实后才作“进展”再次报告 |
| 检索时间 | 我们何时发现页面 | 用于监测延迟，不冒充发布时间 |
| 搜索 freshness | Brave 明确可依据发布或修改日期 | 只是候选发现过滤，仍核对原文 |

来源：[Google 页面日期](https://developers.google.com/search/docs/appearance/publication-dates)、[Atom updated](https://datatracker.ietf.org/doc/html/rfc4287#section-4.2.15)、[Brave freshness](https://api-dashboard.search.brave.com/api-reference/web/search/post)。

Google 明确允许只有日期，没有时间和时区。因此，把“精确到秒且有时区”作为唯一入选条件，会拒绝一些符合其文档的发布页；这是一项额外产品限制，并非文章不可信的证据。[Google 日期精度](https://developers.google.com/search/docs/appearance/publication-dates)

**建议：** 保存 `timestamp` / `date-only` / `unknown` 精度以及时间证据。只有日期时，用已知且可说明的来源时区形成日期区间；若整个区间落在窗口内可按日期入选，跨越窗口边界则待核验或归入标注日期的日级补录，未知时区继续保留不确定性。不能填一个虚构的零点来通过检查。检索回看范围可略宽于简报窗口以吸收索引延迟，例如先实验 48–72 小时，再用原文发布时间和已报告状态决定是否展示；迟到新闻明确标注补录。这是工程方案，具体范围需靠样本验证，来源并未规定 48–72 小时。

## 发现、核验、合并分别做

**事实：** Google 把重定向和 `rel=canonical` 等作为规范 URL 信号，URL 字符串变化并不必然代表另一篇文章；Elastic 的检索说明也将候选生成与较昂贵的重排分开。[Google canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、[Elastic ranking](https://www.elastic.co/docs/solutions/search/ranking)

**建议：** 保留原始结果及淘汰原因，区分供应商返回空、域名不符、首页、正文失败、日期不明、窗口外和主题不符。来源候选阶段可宽些，进入简报前再核验；官方原文优先作为证据，也可以让可靠媒体帮助发现未知事件，再寻找原始公告。首页不能当成文章，但可另作有预算的链接发现任务。

URL 去重与事件合并分开：先按已核验的最终/规范 URL、feed id 消除同文重复，再按主体、动作、产品/版本与事件日期聚合多篇报道。保留引用链与不同来源的补充事实；同一发布的十篇转载不应占十条，也不应因标题相似就合并两个版本。合法重定向应核验目标、域名及文章身份，而非要求字符串永远相等。这里是基于 canonical 语义的应用设计，不是 Google 为简报规定的规则。

若两家都返回有用结果，优先试验合并再去重。RRF 依靠各列表的名次融合，不要求原始分数可直接比较；但它不会修复错误 URL、旧文章或虚假证据，也不是置信度。[Elastic RRF](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion)

## 如何公平判断混合方案

建议先建立可人工审查的回放集，按模型发布、开发工具、安全、政策等主题选历史事件，同时保留无事件日和错误/旧日期样本。此处是评测设计；指标定义依据 [NIST TREC](https://trec.nist.gov/pubs/trec14/appendices/CE.MEASURES05.pdf)。

1. 用已知标题找原文，测提供方能否定位；用当时只能知道的实体+事件查询测开放发现。这两类成绩分开，避免拿“已经知道答案”冒充新闻发现能力。
2. 同一时点、时间参数和请求预算比较豆包、GLM、合并结果、故障回退；额度错误计入可用性，不能当作不相关结果评分。
3. 人工标注相关事件、真实日期、可定位原文和重复事件，保留无法确定的样本。有限人工参考集只能报告“参考集覆盖率”，不称全网召回率。
4. 同时报告最终 Precision@K、参考事件覆盖率、独立新增事件数、旧闻误入数、未查询主题数、每个新增事件成本和发现延迟；新指标是针对简报提出的，不是 TREC 标准清单。
5. 分别测查询拆分、服务端域名过滤、日期精度支持、候选合并的增量效果。全部一起改会无法解释改善来自哪里。

**验收建议：** 先以已标注错误链接和旧闻不得混入作为固定回归约束；再要求相同预算下有可解释的新增事件覆盖。需要多个时段、多个主题的结果，才决定日常启用。当前“豆包一有合格结果就不查 GLM”的模式可以节省预算，但只能验收故障回退，不能证明两源联合提高召回；若要评估互补性，应在小范围影子采集中让两家都跑。
