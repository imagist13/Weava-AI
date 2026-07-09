# 01 · 模块 1：多画布 + 服务端持久化

## 目标

把当前"无状态单画布"升级为"多画布持久化"，允许用户在画布之间切换、自动保存画布内容。

## 不做什么

- ❌ 不做多人协作（多人光标、CRDT）
- ❌ 不做画布分享/权限
- ❌ 不做版本历史与回滚
- ❌ 不做 Connector 注入
- ❌ 不重写 ExcalidrawWrapper（只追加能力）

## 数据模型

```sql
CREATE TABLE boards (
  id           TEXT PRIMARY KEY,           -- nanoid, e.g. 'b_abc123'
  name         TEXT NOT NULL,              -- 用户可重命名
  snapshot     TEXT NOT NULL,              -- Excalidraw elements 序列化 JSON
  app_state    TEXT,                       -- Excalidraw appState 序列化（视口/网格）
  created_at   INTEGER NOT NULL,           -- unix ms
  updated_at   INTEGER NOT NULL,           -- unix ms
  version      INTEGER NOT NULL DEFAULT 1  -- 兼容字段，未来用作乐观锁
);
```

索引：`updated_at DESC`（列表默认按最近修改排序）。

## API 设计

```
GET    /api/boards
       resp 200: [{ id, name, updatedAt, createdAt }]

POST   /api/boards
       body  : { name?: string }
       resp 200: Board（自动生成的默认 name 是"未命名画布 #N"）

GET    /api/boards/[id]
       resp 200: { id, name, snapshot, appState, createdAt, updatedAt }
       resp 404: { error }

PATCH  /api/boards/[id]
       body  : Partial<{ name, snapshot, appState }>
       resp 200: Board（更新 updatedAt）
       用途  : 自动保存 + 重命名

DELETE /api/boards/[id]
       resp 204
       用途  : 画布切换器右滑菜单/列表中的删除
```

**约定**：
- `id` 用 nanoid 前缀 `b_`
- `snapshot` 存 Excalidraw `elements` 数组的 JSON；空数组视为合法
- `appState` 存 `{ viewBackgroundColor, gridSize, ... }` 子集
- 请求/响应全部 `application/json`

## 文件清单

```
src/db/
  client.ts                 better-sqlite3 + drizzle 单例
  schema.ts                 boards 表定义
drizzle.config.ts           drizzle-kit 配置（输出 ./drizzle/）
src/lib/boards/
  types.ts                  BoardRow / Board 类型 + 校验
  repo.ts                   列表/创建/读/改/删的薄封装
src/app/api/boards/
  route.ts                  GET 列表 + POST 创建
  [id]/
    route.ts                GET/PATCH/DELETE
    snapshot/
      route.ts              PATCH 单字段快速更新（自动保存）
src/components/
  BoardSwitcher.tsx         下拉/抽屉切换器
  LegacyLink.tsx            /legacy 入口（模块 1 末尾）
src/app/
  page.tsx                  主页面：BoardSwitcher + ExcalidrawWrapper
  legacy/
    page.tsx                原 page 内容（占位，可复制）
spec/
  01-canvas-boards.md       本文档
```

## 改造点（相对原代码）

- `ExcalidrawWrapper`：增加 `onSnapshotChange` 回调 + `initialSnapshot` 入参
- `page.tsx`：从 `?board=xxx` 读 boardId（缺省则 POST 创建），嵌入 BoardSwitcher
- `package.json`：新增依赖在最后执行时安装

## 前端交互细节

### BoardSwitcher

- 顶部一行：`[下拉按钮 当前画布名 ▾]  [+]  [≡]`
- 下拉项：`当前画布高亮 + 其他画布按 updatedAt 倒序 + 重命名/删除`
- 点击空白画布名 → 进入重命名 inline 编辑
- 删除走 `confirm()` + 乐观删除，失败时回滚 + toast

### 自动保存

- Excalidraw `onChange` 触发 → 200ms 防抖
- 内容相对上次无变化（哈希）→ 跳过
- 失败时 localStorage 暂存并显示 banner "离线保存中"
- 状态指示器：右上角 `● 已保存 12s 前`

### URL 行为

- `/` → 重定向到 `/?board=b_xxxx`
- `/legacy` → 不带查询参数；与新功能完全隔离
- 改 boardId 时同步 `pushState`，避免重复刷新

## 关键决策

1. **SQLite 单文件**：用户本地/单实例部署足够；文件路径 `./data/bonsai.db`，首次启动自动 `mkdirSync`
2. **不写 Drizzle migration 模板而用 `push` 在 dev 推 schema**：`drizzle-kit push` 直接同步表，避免维护大量迁移文件（仅本项目；生产应改用 `generate + migrate`）
3. **自动保存用单字段 PATCH**：把 `snapshot` 单字段拆到 `/api/boards/[id]/snapshot`，避免覆盖 `name` 等用户输入
4. **保留原 page**：原 page（含 SettingsPanel、Tooltip 引用全部依赖）整段移到 `src/app/legacy/page.tsx`，`/legacy` 路由提供服务
5. **不在 Excalidraw 内做多画布标签**：用 BoardSwitcher 切换，单页单画布，简单

## 验收

- [ ] `npm run dev` 启动后，浏览器打开 `/` 自动创建并进入一个默认画布
- [ ] 在画布上画一个矩形后等待 3s，刷新页面，矩形仍存在
- [ ] BoardSwitcher 可创建新画布，旧画布自动保存
- [ ] 重命名某画布后刷新仍保留名称
- [ ] 删除画布后该 ID 不可访问（404）
- [ ] `/legacy` 仍可访问并保留原 AI 聊天绘图全部能力
- [ ] `npm run lint` 无新增错误
