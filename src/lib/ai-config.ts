// AI 配置类型定义
export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

// 默认配置 —— 只使用 TokenDance 网关
export const DEFAULT_AI_CONFIG: AIConfig = {
  apiKey: "",
  baseUrl: "https://tokendance.space/gateway/v1",
  model: "deepseek-v3.2",
  temperature: 0.7,
};

// API 提供商预设 —— 仅保留词元跳动（TokenDance）网关
// 支持的模型列表见 https://tokendance.space （/gateway/v1/models）
export const API_PRESETS = [
  {
    name: "词元跳动",
    baseUrl: "https://tokendance.space/gateway/v1",
    models: ["deepseek-v3.2", "minimax-m2.5"],
  },
];

// localStorage key
const STORAGE_KEY = "weaveai-config";

// 保存配置到 localStorage
export function saveAIConfig(config: AIConfig): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}

// 从 localStorage 加载配置
// ★ 兼容旧数据：如果 localStorage 里存的是旧的 openai / deepseek / ollama 等 baseUrl，
//   自动迁移到 TokenDance 网关，避免历史配置导致的 400/401。
export function loadAIConfig(): AIConfig {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<AIConfig>;
        const merged: AIConfig = { ...DEFAULT_AI_CONFIG, ...parsed };
        // 强制迁移：只允许 TokenDance 网关
        if (!merged.baseUrl || !merged.baseUrl.includes("tokendance.space")) {
          merged.baseUrl = DEFAULT_AI_CONFIG.baseUrl;
          // baseUrl 变了，模型如果不在支持列表里也回落到默认
          if (!API_PRESETS[0].models.includes(merged.model)) {
            merged.model = DEFAULT_AI_CONFIG.model;
          }
        }
        return merged;
      } catch {
        return DEFAULT_AI_CONFIG;
      }
    }
  }
  return DEFAULT_AI_CONFIG;
}

// 检查配置是否有效
export function isConfigValid(config: AIConfig): boolean {
  return !!(config.apiKey && config.baseUrl && config.model);
}
