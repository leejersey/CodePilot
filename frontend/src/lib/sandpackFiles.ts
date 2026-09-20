import {
  normalizeLanguage,
  type SandpackTemplate,
} from "./languageRuntime.ts";

export interface EditorFileInput {
  label: string;
  language: string;
  code: string;
}

export type SandpackFiles = Record<string, string>;

function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function entryPath(template: SandpackTemplate): string {
  return template === "vue" ? "/src/App.vue" : "/App.js";
}

function guessCompanionPath(
  label: string,
  language: string,
  template: SandpackTemplate,
  entry: string
): string | null {
  const trimmed = label.trim().replace(/\\/g, "/");
  if (!trimmed) return null;
  const lang = normalizeLanguage(language);

  if (template === "vue") {
    if (/\.vue$/i.test(trimmed)) {
      const path = trimmed.includes("/") ? ensureLeadingSlash(trimmed) : `/src/${trimmed}`;
      return path === entry ? null : path;
    }
    if (/\.(css|scss)$/i.test(trimmed)) {
      return trimmed.includes("/") ? ensureLeadingSlash(trimmed) : `/src/${trimmed}`;
    }
    if (/\.(js|ts|jsx|tsx)$/i.test(trimmed)) {
      return trimmed.includes("/") ? ensureLeadingSlash(trimmed) : `/src/${trimmed}`;
    }
    if (lang === "css") return "/src/styles.css";
    return null;
  }

  // react companions
  if (/\.(css|scss)$/i.test(trimmed)) return ensureLeadingSlash(trimmed);
  if (/index\.(js|jsx|ts|tsx)$/i.test(trimmed)) return ensureLeadingSlash(trimmed);
  if (/\.(js|jsx|ts|tsx)$/i.test(trimmed)) {
    const path = ensureLeadingSlash(trimmed);
    return path === entry || path === "/App.jsx" || path === "/App.tsx" ? null : path;
  }
  if (lang === "css") return "/styles.css";
  return null;
}

const REACT_APP_FALLBACK = `export default function App() {
  return <h1>Hello React</h1>;
}
`;

const VUE_APP_FALLBACK = `<template>
  <h1>Hello Vue</h1>
</template>

<script setup>
</script>
`;

/**
 * Map Monaco editor tabs into Sandpack `files`.
 * files[0] is the active tab and ALWAYS becomes the template entry
 * (`/App.js` or `/src/App.vue`), so Preview matches what the learner is editing.
 */
export function buildSandpackFiles(
  files: EditorFileInput[],
  template: SandpackTemplate
): SandpackFiles {
  const out: SandpackFiles = {};
  const entry = entryPath(template);
  const primary = files[0];

  if (primary?.code?.trim()) {
    out[entry] = primary.code;
  } else {
    out[entry] = template === "vue" ? VUE_APP_FALLBACK : REACT_APP_FALLBACK;
  }

  for (const file of files.slice(1)) {
    const path = guessCompanionPath(file.label, file.language, template, entry);
    if (!path || path in out) continue;
    out[path] = file.code;
  }

  return out;
}
