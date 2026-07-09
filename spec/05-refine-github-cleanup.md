# 05 · 模块 5：Refine + GitHub Connector + 清理（占位）

> 本次实施**不在范围内**。本文档作为后续待办清单。

## 目标

1. 实现模块 1 中的"Refine 选区"：右键选区工具栏新增 "Refine this" 按钮，由 LLM 直接改写选中文本并回写到画布
2. 实现模块 3 的 GitHub Connector：`@gh:owner/repo#path/to/file:line-range`
3. 删除/降级旧的"自然语言→绘图"链路，确认 `/legacy` 可作 fallback

## 待办

- [ ] Refine API + UI（与 compile 共用 LLM 调用）
- [ ] GitHub Octokit + PAT 加密存储
- [ ] 删除原 `convertSimpleElementsToExcalidraw`、`ToolCallCard` 等运行时引用
- [ ] `README.md` 重写为 BonsAI 定位
- [ ] `README_zh-CN.md` 同步
- [ ] 关闭 `/legacy` 时配套文档说明

## 验收

- [ ] Refine 一次选区后，元素 in-place 文字变更，无新元素产生
- [ ] `@gh:facebook/react#packages/react/src/React.js` 注入提示词后真实出现 React 源码片段
- [ ] README 顶部明确"提示词工程白板"定位，介绍与原 AI Excalidraw 的差异
