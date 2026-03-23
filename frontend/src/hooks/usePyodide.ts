"use client";

import { useState, useRef, useCallback } from "react";

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.5/full/";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
  }
}

function loadPyodideScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.loadPyodide) { resolve(); return; }
    const script = document.createElement("script");
    script.src = `${PYODIDE_CDN}pyodide.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Pyodide CDN 加载失败"));
    document.head.appendChild(script);
  });
}

export function usePyodide() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const pyodideRef = useRef<any>(null);

  const init = useCallback(async () => {
    if (pyodideRef.current) return pyodideRef.current;
    if (loading) return null;

    setLoading(true);
    try {
      await loadPyodideScript();
      const pyodide = await window.loadPyodide!({ indexURL: PYODIDE_CDN });
      pyodideRef.current = pyodide;
      setReady(true);
      return pyodide;
    } catch (err) {
      console.error("Pyodide 加载失败:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const runPython = useCallback(async (code: string): Promise<{ output: string; error: boolean }> => {
    let pyodide = pyodideRef.current;
    if (!pyodide) {
      pyodide = await init();
      if (!pyodide) return { output: "Error: Python 环境加载失败，请检查网络连接", error: true };
    }

    try {
      // 重定向 stdout/stderr
      pyodide.runPython(`
import sys, io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
`);

      // 执行用户代码
      pyodide.runPython(code);

      // 获取输出
      const stdout = pyodide.runPython("sys.stdout.getvalue()") as string;
      const stderr = pyodide.runPython("sys.stderr.getvalue()") as string;

      // 重置
      pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);

      const output = (stdout + stderr).trim();
      return { output: output || "(无输出)", error: !!stderr.trim() };
    } catch (err: unknown) {
      try {
        pyodide.runPython(`
import sys
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);
      } catch { /* ignore */ }

      const errMsg = err instanceof Error ? err.message : String(err);
      // 提取 Python traceback 的最后有用部分
      const lines = errMsg.split("\n");
      const useful = lines.filter(l =>
        !l.includes("at Module") &&
        !l.includes("wasm://") &&
        l.trim().length > 0
      );
      return { output: useful.join("\n") || errMsg, error: true };
    }
  }, [init]);

  return { ready, loading, init, runPython };
}
