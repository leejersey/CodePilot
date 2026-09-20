import {
  executionModeForLanguage,
} from "./languageRuntime.ts";

export type RuntimeTag = "browser" | "sandpack" | "web" | "judge0" | "cloud";
export type ExecutionUiMode = "pyodide" | "sandpack" | "web" | "remote" | "cloud";

const TAG_TO_MODE: Record<RuntimeTag, ExecutionUiMode> = {
  browser: "pyodide",
  sandpack: "sandpack",
  web: "web",
  judge0: "remote",
  cloud: "cloud",
};

export function looksLikeCloudFrameworkCode(code: string): boolean {
  // Match bare packages (langchain / langgraph) and namespaced ones
  // (langchain_core, langchain_deepseek) — underscore is a word char so \b alone fails.
  return /\b(langchain[\w.-]*|langgraph[\w.-]*|init_chat_model)\b/.test(code);
}

export function resolveTabExecution(input: {
  language: string;
  code: string;
  tag?: RuntimeTag | null;
}): { mode: ExecutionUiMode; tagApplied: boolean } {
  const { language, code, tag } = input;

  if (tag != null && tag in TAG_TO_MODE) {
    return { mode: TAG_TO_MODE[tag], tagApplied: true };
  }

  if (looksLikeCloudFrameworkCode(code)) {
    return { mode: "cloud", tagApplied: false };
  }

  const mode = executionModeForLanguage(language, code);
  return { mode, tagApplied: false };
}

export function pickCloudProvider(input: {
  defaultProvider: "modal" | "daytona" | null;
  modalConfigured: boolean;
  daytonaConfigured: boolean;
}): "modal" | "daytona" | null {
  const { defaultProvider, modalConfigured, daytonaConfigured } = input;

  if (defaultProvider === "modal" && modalConfigured) return "modal";
  if (defaultProvider === "daytona" && daytonaConfigured) return "daytona";

  const configured: ("modal" | "daytona")[] = [];
  if (modalConfigured) configured.push("modal");
  if (daytonaConfigured) configured.push("daytona");
  if (configured.length === 1) return configured[0];

  return null;
}
