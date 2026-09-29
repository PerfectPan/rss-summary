# 豆包与 GLM 混合搜索

`NEWS_SEARCH_MODE=hybrid` 在现有午间、晚间新闻采集和 Daily AI Digest 的新闻采集窗口中启用补查。默认仍为 `doubao`，部署时显式启用；程序不读取 ZCode 私有配置，不启动反代。

## 行为

每个查询先走豆包。通过现有时间、来源和主题校验的结果至少有一条时，不再调用 GLM。若没有合格结果，或豆包发生提供方错误，则用该查询的 `glm.query` 与 `glm.domains` 补查。查到的文章与其他查询的豆包结果一起经过原有规范化 URL 去重、主题匹配、排序和栏目限额，不额外增加推送条数。

豆包返回额度耗尽代码 `10406` 后，同一个新闻窗口的后续查询跳过豆包。其他窗口或下一次执行会重新尝试，不把临时额度状态永久缓存。已有 429 重试保留；编程错误不伪装成提供方不可用。混合模式串行执行，避免额度耗尽后已经发出整批请求。

GLM 不按每次查询无条件并行调用。默认每个新闻窗口最多补查 4 次、读取 6 篇原文；相同 URL 的读取成功或失败结果在该窗口内复用。Daily AI Digest 如果采集多个新闻窗口，每个窗口分别计算预算。预算不足、无结果及 Reader 失败不触发额外付费 API。

## 接受结果的条件

- 结果必须匹配 `news-topics.json` 中当前查询明确配置的可信域名或其子域名。域名配置代表维护者对该主题来源的选择，不是假造的豆包认证等级；审计数据保留 `configured-domain` 依据。
- 拒绝站点首页、已识别的栏目/Feed/标签页；Reader 必须返回选中文章本身的 URL、标题与正文。
- 发布时间只接受 Reader 原文元数据中的 `article:published_time` 或 `datePublished`，必须有明确时刻和时区。仅日期、相对日期、修改时间或冲突的发布时间不用于入选；缺失则舍弃，不用抓取时刻代替。
- 原文时间仍须落在本期窗口内，内容仍须满足原来的主体词、事件词及排除词规则。GLM 的 `oneDay` 只减少过期候选，不替代本地时间校验。

搜索和原文均是不可信外部材料。程序不会执行页面里的命令，Reader 结果不被当成模型指令。正文用于已有摘要/证据流程，不证明网页中的主张为真。

## 配置

通过既有私有环境注入方式提供 `GLM_CODING_API_KEY`，不要把 Key 写进命令参数或 Git。

```dotenv
NEWS_SEARCH_MODE=hybrid
NEWS_GLM_MAX_SEARCHES=4
NEWS_GLM_MAX_READS=6
RSS_ARTICLE_GLM_FALLBACK=true
```

`RSS_ARTICLE_GLM_FALLBACK` 独立控制“我的订阅”的 `research-article` Tool：仅在 `auto` 模式的浏览器与 HTTP 都失败后尝试 Reader。显式 `http` 或 `browser` 模式不会改用 GLM。不开启该选项时行为保持原样。

`news-topics.json` 的每条查询可增加：

```json
"glm": {
  "query": "site:devblogs.microsoft.com/typescript TypeScript release",
  "domains": ["devblogs.microsoft.com"]
}
```

查询最多 70 字符，域名最多 8 个；自定义查询未配置 `glm` 时不会自动放宽来源去补查。现有配置为官方技术发布、维护者通报、监管原文和企业公告指定来源，新增来源须按主题审阅。

## 手动调研与审计

```sh
rss-summary research search --query "TypeScript release" --domains devblogs.microsoft.com
rss-summary research read --url https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
```

命令输出 JSON，不投递消息、不更新已读状态。已有 `research add` 命令保留。

新闻结果的 `audit.queries` 增加可选 `provider` 与 `fallback`：记录触发原因、是否搜索、读取次数及丢弃/预算提示。最终仍有数据源告警。两家都失败时保留原有失败语义，Daily AI Digest 可继续采用其余来源；成功搜索但所有候选不合格时返回空结果，不凑数。

## 实测依据与限制

小样本测试中豆包返回免费额度耗尽，不能据此比较两家整体质量。旧查询集的两组宽泛 GLM 新闻搜索共返回 13 条站点首页链接，缺少发布时间；明确限定微软官方站点的查询找到了真实 TypeScript 发布文章。该观察支持“具体查询补查 + 原文校验”，不支持无条件替换豆包。当前主线已把旧宽泛查询改为事件型查询，不能把旧样本当作当前主线的完整效果评估。

Search 与 Reader 已使用现有套餐 Key 验证连通。MCP 调用共享套餐额度；连通性不代表服务方对所有自建应用场景的授权，使用范围见[官方 FAQ](https://docs.bigmodel.cn/cn/coding-plan/faq)。Reader 元数据不完整的站点可能全部被丢弃，这是精确新闻时间窗口的限制。部署切换与消息投递不属于此 PR。
