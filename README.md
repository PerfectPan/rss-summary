# rss-summary

[![CI](https://github.com/PerfectPan/rss-summary/actions/workflows/ci.yml/badge.svg)](https://github.com/PerfectPan/rss-summary/actions/workflows/ci.yml)

一个定时信息简报 CLI：把“我明确订阅的内容”和“我应该知道的行业变化”分成两条链路。个人订阅合并 GitHub Home 与 `feeds.json`；行业前沿只跟踪厂商官方 Blog、News、Changelog、Release 和研究源。普通内容用一句话加链接；命中个人兴趣或明确涉及重大版本、GA、破坏性变更、弃用、安全事件的内容才展开摘要。CLI 可挂 webhook，也可作为 Rivus 插件被调度。

## 示例输出

**我的订阅**（`rss-summary digest`）

```markdown
# 我的订阅 · 2026-08-09

12 条更新 · GitHub Home + 个人博客 · 2026-08-08 +08:00

**重点摘要**

**[owner/useful-tool](https://github.com/owner/useful-tool)**

从订阅动态里发现的高关注项目，解决开发工具链中的具体问题。
来源：followee-a

**其他更新**

- Example Blog 发布了「A useful post」。[查看原文](https://example.com/post)
```

**行业前沿**（`rss-summary industry`）

```markdown
# 行业前沿 · 2026-08-09

6 条动态 · 2026-08-09 +08:00

**值得展开**

**[New agent release](https://example.com/release)**

新增可靠工具调用与可审计执行产物。
来源：Vendor Changelog

**动态速览**

- Vendor Blog 发布了「API update」。[查看原文](https://example.com/update)
```

## Quick Start

```bash
pnpm install --frozen-lockfile && pnpm build
pnpm link --global
cp .env.example .env
rss-summary github-home login            # 浏览器登录 GitHub 后回车，会话存到 .state/
GITHUB_USERNAME=<your-username> FEED_DAY="$(TZ=Asia/Shanghai date +%F)" \
  rss-summary digest --dry-run           # 打印今日早报到终端
```

## 目录

[Setup](#setup) · [Commands](#commands) · [Configuration](#configuration) · [Scheduling](#scheduling) · [Rivus Plugin](#rivus-plugin) · [Architecture](#architecture) · [Development](#development) · [License](#license)

## Setup

```bash
pnpm install --frozen-lockfile && pnpm build && pnpm link --global
cp .env.example .env
rss-summary github-home login
```

`rss-summary github-home login` 打开浏览器，登录 GitHub、确认 `github.com` 显示 Home 后回车，登录态存入 `.state/github-home-storage.json`（不入 git）。默认用本机 Chrome；机器没有 Chrome 时跑 `pnpm exec playwright install chromium` 并取消 `GITHUB_HOME_BROWSER_CHANNEL`。

可选：从你的 GitHub 账号建一个细粒度 token 放 `GH_FEED_TOKEN`，用于 API 补全 PR 详情或 `GITHUB_FEED_SOURCE=events` 回退。最小权限 `Events: Read-only`，仓库访问按需（默认公开仓库）。

RSS 源维护在受版本控制的 `feeds.json`，用 `rss-summary feeds ...` 改动并通过 PR 提交。

## Commands

```bash
# 我的订阅：当日 GitHub Home + 明确订阅的个人 RSS
GITHUB_USERNAME=<your-username> FEED_DAY="$(TZ=Asia/Shanghai date +%F)" \
  rss-summary digest --only-new

# 行业前沿：官方 RSS；论文只进入研究队列，不直接发布
rss-summary industry --day "$(TZ=Asia/Shanghai date +%F)" --only-new --dry-run

# 给 feed-research skill 的行业候选 JSON（含最多 8 篇 abstract 匹配论文）
rss-summary industry --json --day "$(TZ=Asia/Shanghai date +%F)" --only-new --dry-run

# 管理 RSS 源
rss-summary feeds add --url "https://github.blog/feed" --name "GitHub Blog" --tags "github,ai"
rss-summary feeds list

# 检查每次 CLI 抓取、筛选和投递产物
rss-summary runs list
rss-summary runs failures
rss-summary runs show <run-label>
```

更多选项 `rss-summary <command> --help`。深度研究流水线：加 `--json --only-new --dry-run` 输出候选 JSON，配合 [prompts/feed-research.md](prompts/feed-research.md) 或 [skills/feed-research-digest](skills/feed-research-digest/SKILL.md) 生成最终简报。

## Configuration

| 变量                    | 作用                                           | 默认                         |
| ----------------------- | ---------------------------------------------- | ---------------------------- |
| `GITHUB_FEED_SOURCE`    | `home`（精确，默认）或 `events`（REST 回退）   | `home`                       |
| `GITHUB_USERNAME`       | 要抓 Home feed 的账号                          | —                            |
| `FEED_DAY`              | 日报日 `YYYY-MM-DD`（本地日历）                | 滚动窗口                     |
| `FEED_TIMEZONE_OFFSET`  | 时区偏移                                       | `+00:00`                     |
| `FEED_WINDOW_HOURS`     | 滚动窗口小时（`FEED_DAY` 未设时）              | `36`                         |
| `GITHUB_HOME_FETCH`     | `conduit`（默认）或 `browser`                  | `conduit`                    |
| `GH_FEED_TOKEN`         | GitHub token（API 补全 PR 详情 / events 回退） | —                            |
| `DOUBAO_SEARCH_API_KEY` | 午/晚间新闻搜索                                | —                            |
| `NOTIFY_WEBHOOK_URL`    | 推送 webhook（POST `{ "text": markdown }`）    | —                            |
| `RSS_FEEDS_FILE`        | RSS 订阅文件                                   | `feeds.json`                 |
| `INDUSTRY_FEEDS_FILE`   | 行业 RSS 订阅文件                              | `industry-feeds.json`        |
| `INDUSTRY_STATE_FILE`   | 行业简报去重/调研状态                          | `.state/industry-state.json` |
| `FEED_MAX_PAPERS`       | 每次进入深度调研队列的论文硬上限               | `8`                          |
| `FEED_RUN_LOG_DIR`      | CLI 运行审计产物目录                           | `.state/runs`                |

完整列表与默认值见 [.env.example](.env.example)。GitHub Home 的 conduit / 浏览器回退机制见 [docs/architecture.md](docs/architecture.md)。

## Scheduling

```cron
0 9 * * * cd /path/to/rss-summary && FEED_DAY="$(TZ=Asia/Shanghai date +\%F)" \
  GITHUB_FEED_SOURCE=home GITHUB_USERNAME=<your-username> RSS_FEEDS_FILE=feeds.json \
  rss-summary digest --only-new >> /tmp/feed-digest.log 2>&1
```

机器身份无关，使用其 Home feed 的那个 GitHub 账号的浏览器登录态决定可见性。

## Rivus Plugin

本仓库导出 `rss-summary/rivus-plugin`：一个 Agent profile（`rss-digest`）+ 三个只读 Tool（`generate-digest` / `generate-news-brief` / `generate-industry-brief`）及对应调度模板。订阅和行业 Tool 的结果都携带 source/candidate audit；Rivus 自己的 trace 与投递 ledger 记录后续卡片投递。行业 Tool 不直接发布未研究论文，只报告待调研数量。安装、manifest 绑定、环境契约见 [docs/rivus-plugin.md](docs/rivus-plugin.md)。

## Architecture

分层 DDD 结构 `domain → application → infrastructure → presentation`：domain 是纯规则（无 IO、无 Effect）；application 用 [Effect](https://effect.website) 返回 `Effect<Result, Error>` 编排用例；infrastructure 跑适配器；presentation 是入口与渲染。完整数据流、审计产物和扩展点见 [docs/architecture.md](docs/architecture.md)，技术选型与取舍见 [docs/technology-decisions.md](docs/technology-decisions.md)。

## Development

```bash
pnpm verify   # test:layout + check + test + build + package:check
```

`main` 受保护。在功能分支上改，开 PR，等 `Verify` + `Coverage` 通过后再合并。

便携 agent skills（跨 Codex / Claude Code 等）在 [skills/](skills/)：`$github-feed-digest`（配置/运行）、`$feed-research-digest`（深度研究）、`$rss-feed-management`（源管理）。

## License

个人项目（`private: true`），暂未授予公开许可证。`.state/`、`.env`、token 等本地机密不入 git。
