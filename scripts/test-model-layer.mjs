#!/usr/bin/env node
/**
 * 模型调用层诊断脚本
 *
 * 用法：
 *   1. 先启动 dev server：  npm run dev
 *   2. 另开一个终端运行本脚本，按提示输入 apiKey / baseUrl / model
 *
 *   node scripts/test-model-layer.mjs
 *
 * 也支持环境变量直接跑（跳过交互）：
 *   $env:AI_API_KEY="sk-xxx"; $env:AI_BASE_URL="https://api.openai.com/v1"; $env:AI_MODEL="gpt-4o-mini"; node scripts/test-model-layer.mjs
 *
 * 会依次跑：
 *   [1] 直接调外部 API（绕过 Next 后端，验证 apiKey/baseUrl/model 三元组本身有效）
 *   [2] /api/test-connection
 *   [3] /api/chat  (流式)
 *   [4] /api/compile (流式)
 *   [5] /api/agent  (流式)
 */

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const NEXT_ORIGIN = process.env.NEXT_ORIGIN || "http://localhost:3000";

function color(code, text) {
  return `\x1b[${code}m${text}\x1b[0m`;
}
const green = (t) => color(32, t);
const red = (t) => color(31, t);
const yellow = (t) => color(33, t);
const cyan = (t) => color(36, t);
const dim = (t) => color(2, t);

async function prompt(question, fallback) {
  if (fallback) return fallback;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(question)).trim();
  rl.close();
  return answer;
}

function stripTrailingSlash(s) {
  return s.replace(/\/+$/, "");
}

async function readSSE(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const raw of parts) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        onEvent(JSON.parse(data));
      } catch {
        // ignore
      }
    }
  }
}

// ─────────────────────────────────────────────
// Test 1: 直接调外部 API（绕开 Next 后端）
// ─────────────────────────────────────────────
async function testDirect({ apiKey, baseUrl, model }) {
  console.log(cyan("\n[1] 直接调外部 API（诊断 apiKey/baseUrl/model 三元组本身）"));
  const url = `${stripTrailingSlash(baseUrl)}/chat/completions`;
  console.log(dim(`    POST ${url}`));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.log(red(`    ✗ HTTP ${res.status}`));
      console.log(dim("    ") + text.slice(0, 500));
      return false;
    }
    let json;
    try { json = JSON.parse(text); } catch {
      console.log(red("    ✗ 非 JSON 响应")); console.log(dim(text.slice(0, 300)));
      return false;
    }
    const reply = json.choices?.[0]?.message?.content;
    console.log(green(`    ✓ 直连成功`), dim(`回复片段: ${JSON.stringify(reply)?.slice(0, 80)}`));
    return true;
  } catch (err) {
    console.log(red(`    ✗ 网络错误: ${err.message}`));
    return false;
  }
}

// ─────────────────────────────────────────────
// Test 2: /api/test-connection
// ─────────────────────────────────────────────
async function testConnectionEndpoint(cfg) {
  console.log(cyan("\n[2] /api/test-connection"));
  try {
    const res = await fetch(`${NEXT_ORIGIN}/api/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) {
      console.log(green("    ✓ success=true"));
      return true;
    }
    console.log(red(`    ✗ status=${res.status} body=${JSON.stringify(json)}`));
    return false;
  } catch (err) {
    console.log(red(`    ✗ ${err.message}`));
    console.log(yellow("    (dev server 没启动？请先 npm run dev)"));
    return false;
  }
}

// ─────────────────────────────────────────────
// Test 3: /api/chat（流式 + 工具）
// ─────────────────────────────────────────────
async function testChat(cfg) {
  console.log(cyan("\n[3] /api/chat  (draw_elements 工具)"));
  try {
    const res = await fetch(`${NEXT_ORIGIN}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "画一个红色矩形和一个蓝色圆",
        config: cfg,
        messages: [],
        currentElements: [],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.log(red(`    ✗ HTTP ${res.status}`), dim(t.slice(0, 200)));
      return false;
    }
    let thinkingLen = 0, gotElements = false, gotError = null;
    await readSSE(res, (ev) => {
      if (ev.type === "thinking") thinkingLen += (ev.content || "").length;
      if (ev.type === "elements") gotElements = Array.isArray(ev.elements) && ev.elements.length > 0;
      if (ev.type === "error") gotError = ev.error;
    });
    if (gotError) { console.log(red(`    ✗ ${gotError}`)); return false; }
    console.log(green(`    ✓ 流式结束`), dim(`thinking=${thinkingLen} chars, elements=${gotElements ? "≥1" : "0"}`));
    return true;
  } catch (err) {
    console.log(red(`    ✗ ${err.message}`)); return false;
  }
}

// ─────────────────────────────────────────────
// Test 4: /api/compile
// ─────────────────────────────────────────────
async function testCompile(cfg) {
  console.log(cyan("\n[4] /api/compile"));
  try {
    const res = await fetch(`${NEXT_ORIGIN}/api/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boardId: "diagnostic",
        selectedIds: ["a"],
        allElements: [
          { id: "a", type: "text", text: "hello world", x: 0, y: 0, width: 100, height: 30 },
        ],
        preset: "agent-task",
        config: cfg,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.log(red(`    ✗ HTTP ${res.status}`), dim(t.slice(0, 200)));
      return false;
    }
    let tokens = 0, err = null;
    await readSSE(res, (ev) => {
      if (ev.type === "token") tokens += (ev.content || "").length;
      if (ev.type === "error") err = ev.error;
    });
    if (err) { console.log(red(`    ✗ ${err}`)); return false; }
    console.log(green(`    ✓ 收到 ${tokens} 字符`));
    return true;
  } catch (e) {
    console.log(red(`    ✗ ${e.message}`)); return false;
  }
}

// ─────────────────────────────────────────────
// Test 5: /api/agent
// ─────────────────────────────────────────────
async function testAgent(cfg) {
  console.log(cyan("\n[5] /api/agent"));
  try {
    const res = await fetch(`${NEXT_ORIGIN}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boardId: "diagnostic",
        history: [],
        currentPrompt: "",
        selectionText: "",
        userInput: "你好，简单打个招呼",
        config: cfg,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.log(red(`    ✗ HTTP ${res.status}`), dim(t.slice(0, 200)));
      return false;
    }
    let textLen = 0, err = null;
    await readSSE(res, (ev) => {
      if (ev.type === "text") textLen += (ev.delta || "").length;
      if (ev.type === "error") err = ev.error;
    });
    if (err) { console.log(red(`    ✗ ${err}`)); return false; }
    console.log(green(`    ✓ 收到 ${textLen} 字符`));
    return true;
  } catch (e) {
    console.log(red(`    ✗ ${e.message}`)); return false;
  }
}

// ─────────────────────────────────────────────
async function main() {
  console.log(cyan("=== 模型调用层诊断 ==="));
  console.log(dim(`Next 服务地址: ${NEXT_ORIGIN}`));

  const apiKey = await prompt("API Key: ", process.env.AI_API_KEY);
  const baseUrl = stripTrailingSlash(
    (await prompt("Base URL (默认 https://api.openai.com/v1): ", process.env.AI_BASE_URL)) ||
      "https://api.openai.com/v1"
  );
  const model = (await prompt("Model (默认 gpt-4o-mini): ", process.env.AI_MODEL)) || "gpt-4o-mini";

  if (!apiKey) {
    console.log(red("API Key 是必填")); process.exit(1);
  }

  const cfg = { apiKey, baseUrl, model, temperature: 0.5 };

  const results = {
    direct: await testDirect(cfg),
    testConn: await testConnectionEndpoint(cfg),
    chat: await testChat(cfg),
    compile: await testCompile(cfg),
    agent: await testAgent(cfg),
  };

  console.log("\n" + cyan("=== 诊断汇总 ==="));
  const rows = [
    ["直连外部 API", results.direct],
    ["/api/test-connection", results.testConn],
    ["/api/chat", results.chat],
    ["/api/compile", results.compile],
    ["/api/agent", results.agent],
  ];
  for (const [name, ok] of rows) {
    console.log((ok ? green("  PASS ") : red("  FAIL ")) + name);
  }

  // 结论建议
  console.log("");
  if (!results.direct) {
    console.log(yellow("→ 直连都失败。问题在 apiKey / baseUrl / model 本身，Next 后端无关。"));
    console.log(yellow("  常见原因：baseUrl 路径不对（少了 /v1）、model 名字拼错、apiKey 无权限。"));
  } else if (results.direct && !results.testConn) {
    console.log(yellow("→ 直连能过但 /api/test-connection 挂了。多半是本地 https.Agent 里 SSL/代理问题。"));
  } else if (!results.chat || !results.compile || !results.agent) {
    console.log(yellow("→ 直连和 test-connection 都过，具体路由挂了。看上面对应的错误行。"));
  } else {
    console.log(green("→ 所有层都通过！模型调用层健康。"));
  }
}

main().catch((e) => {
  console.error(red("Unhandled: "), e);
  process.exit(1);
});
