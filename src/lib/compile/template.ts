export type CompilePreset = "agent-task" | "refine" | "explore";

export interface CompileOptions {
  boardId: string;
  selectionText: string;
  preset: CompilePreset;
  mentions: { tool: string; query: string }[];
}

const PRESET_DESCRIPTIONS: Record<CompilePreset, string> = {
  "agent-task":
    "以任务说明风格输出：背景 + 目标 + 约束 + 输出格式。适合交给 Coding Agent 直接执行。",
  refine:
    "对现有选区文本做精炼整理：去重、补全、标准化格式，保持专业简洁。",
  explore:
    "以探索分析风格输出：结构化列出发现、问题、假设。适合在 Cursor 中做前期调研。",
};

// 替换提示词中的 @mention 标记（模块 3 接管前的占位展示）
function maskMentions(
  text: string,
  mentions: { tool: string; query: string }[]
): string {
  let masked = text;
  for (const { tool, query } of mentions) {
    masked = masked.replace(`@${tool}:${query}`, `[@${tool}:${query}]`);
  }
  return masked;
}

export function buildCompilePrompt(opts: CompileOptions): {
  system: string;
  user: string;
} {
  const presetDesc = PRESET_DESCRIPTIONS[opts.preset];
  const maskedText = maskMentions(opts.selectionText, opts.mentions);

  const system = `你是一个专业的 Coding Agent 提示词工程师。

用户的画布上有一组用 Excalidraw 图形组织的想法（可能是流程图、结构图、架构图）。
选区已经被结构化成 **节点列表 + 连接关系**：
  【节点】列出每个形状/文字（编号 N1、N2…，附形状类型）
  【连接】列出箭头/线条对节点的连接（形如 "N1 → N2" 或带 label "N1 → N2 （触发）"）

你的任务是**基于这些节点与关系**"翻译"成一段高质量提示词，让 Coding Agent（Claude Code、Cursor、Cline 等）能直接理解并执行。

【核心原则】
1. **理解关系**：把 "N1 → N2" 理解为 "N1 触发/流向/推导出 N2"，不要孤立看待每个节点
2. **保留事实**：不要编造画布中不存在的内容；节点信息不足时写"（需补充：xxx）"，不要瞎猜
3. **结构清晰**：使用 Markdown，分层标题 + 列表
4. **可执行**：提示词结尾明确说明输出格式或操作步骤
5. **保留 Connector**：如果节点文本含有 [\`@tool:query\`] 标记，将它们原样保留在输出中（模块 3 Connector 系统会在运行时替换）
6. **面向工具**：输出是给 AI Agent 的，不是给人看的文档

${presetDesc}

【输出格式】
直接输出改写后的提示词，不要解释你的改动。`.trim();

  const user = `【画布选区内容】
${maskedText || "（选区为空）"}

【Board ID】
${opts.boardId}

请根据以上选区内容，生成适合 Coding Agent 的提示词。`.trim();

  return { system, user };
}
