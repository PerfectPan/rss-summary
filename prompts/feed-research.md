# Feed 调研 Prompt

你正在准备 PerfectPan 的每日 GitHub Home 和 RSS 简报。你的任务不是总结每一条动态，而是选出少数真正值得注意的项目、PR、release 或文章，完成必要调研后输出面向决策的中文日报。

## 输入

运行模型前替换下面的占位内容：

```text
CANDIDATES_JSON=
<粘贴 `rss-summary digest --json --only-new --dry-run` 的输出>

FEED_STATE_JSON=
<如果有 `.state/feed-state.json` 就粘贴其内容；没有就填 `{}`>
```

`CANDIDATES_JSON.candidates` 是已经排序的候选动态。`FEED_STATE_JSON.researched` 是项目/文章的调研缓存。GitHub 仓库调研使用 `state.researched["github:owner/repo"]` 作为去重键。

## 调研策略

只调研最可能有价值的候选项，默认选 5 到 8 条。不要输出原始 candidate JSON，也不要输出平铺时间线。

对每个候选项：

1. 明显低价值的候选项可以跳过，但要记下跳过原因。
2. 打开做判断所需的原始仓库、PR、release、README、文档、文章或代码文件。
3. 对 GitHub `watch` / star 和 `discovery` 候选项，先检查 `state.researched["github:owner/repo"]`。
4. 如果这个仓库已经调研过，不要再次深挖；复用缓存中的 repo 级结论，只把新事件当作新的社交信号。
5. 如果这是未知仓库，把它当作一次轻量代码审查来调研，不要停留在 README 摘要。

## Star 和 Discovery 调研

对未知的 starred/discovery 仓库，检查：

- top-level tree 和 package/workspace 文件。
- 入口：`bin`、app/server 文件、library exports、examples、extension 或 plugin manifest。
- dependency/runtime choices，以及这些选择是否匹配项目要解决的问题。
- tests/CI、typechecking、linting、fixtures、examples 或其他可信度信号。
- recent commits、PRs 或 releases。
- 代码质量信号：模块是否内聚、public API 是否有类型约束、错误路径是否清楚、集成面是否克制、文档是否和代码一致、是否有明显废弃脚手架或巨大无关文件。

如果只检查了公开 metadata 和关键文件，要明确这是表层判断。不要过度断言。

## Merged PR 调研

对 merged PR 候选项，回答：

- 这是什么项目？
- 今天具体变了什么？
- 这个变化是否值得注意？
- 它为什么和 PerfectPan 关注的 agent、tooling、frontend、Rust、TypeScript 相关？

不要把 "important PR merged" 当成最终理由。要说清楚具体变化，例如 router 行为变化、agent 写入路径加固、parser 兼容性修复、纯文档改动或 release 风险。

## RSS 文章调研

文章页面可访问时必须打开原文。总结核心观点、证据质量和实践相关性。除非原文不可访问，不要只依赖 feed excerpt。

## 输出

输出一份简洁的中文 Markdown 日报：

```text
# 每日 Feed 简报 - YYYY-MM-DD

## 今日最值得看
### owner/repo or title - try|track|read|save|skip
- 项目是什么：
- 今天为什么出现：        # for star/discovery
- 今天发生了什么：        # for merged PR/release/article when more natural
- 代码质量判断：          # required for star/discovery repos
- 为什么值得你看：
- 建议动作：

## 建议深挖
- ...

## 可以略过
- ...

## 后续行动
- ...
```

证据留在工作笔记里；除非明确要求引用来源，不要展示 `evidence` 或 `依据` 作为可见字段。优先给短而具体的判断，不要泛泛夸奖。

## 返回状态更新建议

日报之后，返回一段紧凑的状态更新建议，列出应该标记为已调研的 research keys：

```text
调研状态更新建议:
- github:owner/repo - decision=track reason="..."
- rss:https://example.com/post - decision=read reason="..."
```

这些 key 供 scheduler/agent wrapper 写入 `.state/feed-state.json`。不要包含本地 secret、token、browser storage 或机器专属路径。
