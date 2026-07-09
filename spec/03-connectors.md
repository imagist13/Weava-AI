# 03 · 模块 3：Connector 系统（占位 + 接口预留）

> 本次实施**不在范围内**。本文档定义接口边界与第一阶段目标，避免后续返工。

## 目标

把"画布选区里写的 `@xxx:query`"在编译/Agent 调用时，由服务端展开成**外部上下文**（文档、文件、网页、代码片段），注入给 LLM。

## 不做什么（v1）

- ❌ 不实现多人/付费/配额系统
- ❌ 不缓存到磁盘（仅 in-memory LRU）
- ❌ 不支持 OAuth/PAT 之外的认证
- ❌ 不支持流式注入（一次性 fetch 后再交给 LLM 调用）

## 第一批 Connector（目标）

| Connector | 触发语法 | 数据来源 |
|---|---|---|
| `@context7:xxx` | 用户文本 | Context7 Docs API（占位，可后续替换） |
| `@finder:<path>` | 画布元素文本 | 本地文件系统（开发机） |
| `@browser:url` | 用户文本 | 服务端 puppeteer 抓 HTML 摘要 |

## 接口预留

模块 2、模块 4 已经为 Connector 留口：

```
src/lib/connectors/
  types.ts                    ConnectorRegistry / Connector 接口
  index.ts                    空实现，本次不引入函数
```

```ts
// 仅供后续，模块 2/4 不引用此类型
export interface Connector {
  readonly name: string;
  resolve(query: string, opts: ResolverOpts): Promise<ConnectorChunk>;
}

export interface ConnectorChunk {
  source: string;             // "context7", "finder"...
  title: string;
  content: string;            // 已经按字数限制截断
  ttl: number;                // 秒，0=不缓存
}
```

模块 4 的 Agent 系统提示词预留 mention 提醒：

> "When the user uses `[@context7:xxx]` style mentions in the selected text, treat them as available authoritative references — do not invent library APIs."

## 待办

- [ ] 实现 `@context7` 的 Context7 OpenAPI 客户端
- [ ] 实现 `@finder` 的本地 fs 读取（带沙箱白名单）
- [ ] 实现 `@browser` 的 cheerio 抓取
- [ ] 在 `/api/agent` route 中调用 ConnectorRegistry
- [ ] LRU 缓存（5 分钟）
- [ ] 失败时降级（保留 mention 文本，让 LLM 自行推断）

## 验收（模块 3 自身）

- [ ] `@context7:next.js` 提示词编译后真实出现 Next.js 文档片段
- [ ] 单个 Connector 报错不影响其他 Connector
- [ ] 缓存命中时 P95 < 50ms
