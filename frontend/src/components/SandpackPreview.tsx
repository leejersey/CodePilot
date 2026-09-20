"use client";

import {
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
} from "@codesandbox/sandpack-react";
import type { SandpackTemplate } from "@/lib/languageRuntime";

export interface FrameworkPreviewProps {
  template: SandpackTemplate;
  files: Record<string, string>;
  theme: "light" | "dark";
  /** Remount key when files change on Run */
  runKey: string;
}

/**
 * Preview-only Sandpack shell. Monaco remains the editor; this pane only renders.
 */
export function FrameworkPreview({
  template,
  files,
  theme,
  runKey,
}: FrameworkPreviewProps) {
  return (
    <div className="flex-1 min-h-0 w-full [&_.sp-layout]:h-full [&_.sp-stack]:h-full [&_.sp-preview-container]:h-full">
      <SandpackProvider
        key={runKey}
        template={template}
        files={files}
        theme={theme === "light" ? "light" : "dark"}
        options={{ autorun: true, recompileMode: "delayed", recompileDelay: 300 }}
        style={{ height: "100%" }}
      >
        <SandpackLayout style={{ height: "100%", border: "none", borderRadius: 0 }}>
          <SandpackPreview
            showNavigator={false}
            showOpenInCodeSandbox={false}
            showRefreshButton
            style={{ height: "100%", flex: 1 }}
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
