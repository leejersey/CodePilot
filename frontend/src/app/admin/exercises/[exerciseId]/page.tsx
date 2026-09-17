"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Editor from "@monaco-editor/react";
import { useTheme } from "@/components/ThemeProvider";
import { ArrowLeft, CheckCircle2, Loader2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { useDialog } from "@/components/DialogProvider";
import {
  adminGetExercise,
  adminUpdateExercise,
  adminValidateExercise,
  updateExerciseStatus,
  type Exercise,
  type TestCase,
} from "@/lib/api";

export default function ExerciseEditorPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const router = useRouter();
  const { alert } = useDialog();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("python");
  const [difficulty, setDifficulty] = useState("medium");
  const [tags, setTags] = useState("");
  const [starterCode, setStarterCode] = useState("");
  const [referenceSolution, setReferenceSolution] = useState("");
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "validate" | "publish" | null>(null);

  useEffect(() => {
    adminGetExercise(exerciseId)
      .then((data) => {
        setExercise(data);
        setTitle(data.title);
        setDescription(data.description);
        setLanguage(data.language);
        setDifficulty(data.difficulty);
        setTags((data.tags || []).join(", "));
        setStarterCode(data.starter_code || "");
        setReferenceSolution(data.reference_solution || "");
        setTestCases(data.test_cases || []);
      })
      .catch((error) => alert({ title: "加载失败", message: error instanceof Error ? error.message : "练习不存在" }))
      .finally(() => setLoading(false));
  }, [alert, exerciseId]);

  const save = async () => {
    setBusy("save");
    try {
      const updated = await adminUpdateExercise(exerciseId, {
        title: title.trim(),
        description,
        language,
        difficulty,
        tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
        starter_code: starterCode,
        reference_solution: referenceSolution,
        test_cases: testCases,
      });
      setExercise(updated);
      await alert({ title: "已保存", message: "内容变更后需要重新验证参考答案。" });
      return true;
    } catch (error) {
      await alert({ title: "保存失败", message: error instanceof Error ? error.message : "请检查必填项" });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const validate = async () => {
    if (!(await save())) return;
    setBusy("validate");
    try {
      const result = await adminValidateExercise(exerciseId);
      setExercise((current) => current ? {
        ...current,
        validation_status: result.valid ? "verified" : "failed",
      } : current);
      await alert({
        title: result.valid ? "验证通过" : "验证未通过",
        message: result.valid ? "参考答案已通过全部真实测试用例，可以发布。" : `得分 ${result.score}，请检查参考答案或测试数据。`,
      });
    } catch (error) {
      await alert({ title: "验证失败", message: error instanceof Error ? error.message : "Judge0 暂不可用" });
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (exercise?.validation_status !== "verified") {
      await alert({ title: "尚未验证", message: "请先保存并让参考答案通过全部测试。" });
      return;
    }
    setBusy("publish");
    try {
      const updated = await updateExerciseStatus(exerciseId, "published");
      setExercise(updated);
      await alert({ title: "发布成功", message: "学员现在可以看到并作答此题。" });
    } catch (error) {
      await alert({ title: "发布失败", message: error instanceof Error ? error.message : "请稍后重试" });
    } finally {
      setBusy(null);
    }
  };

  const updateCase = (index: number, patch: Partial<TestCase>) => {
    setTestCases((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" />加载编辑器…</div>;
  }
  if (!exercise) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <button onClick={() => router.push("/admin/exercises")} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary">
            <ArrowLeft size={13} />返回练习管理
          </button>
          <h1 className="font-headline text-2xl font-bold text-slate-900 dark:text-white">编辑练习</h1>
          <p className="mt-1 text-xs text-slate-500">stdin / stdout 契约 · Judge0 真实验证</p>
        </div>
        <div className="flex gap-2">
          <button disabled={busy !== null} onClick={save} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/10 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50">
            <Save size={15} />保存
          </button>
          <button disabled={busy !== null} onClick={validate} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 px-4 py-2 text-sm text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 font-medium disabled:opacity-50">
            <ShieldCheck size={15} />验证参考答案
          </button>
          <button disabled={busy !== null || exercise.validation_status !== "verified"} onClick={publish} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40 shadow-xs">
            <CheckCircle2 size={15} />发布
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-surface-container-low/50 p-5 shadow-xs dark:shadow-none">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 text-xs text-slate-600 dark:text-slate-400 font-medium">标题<input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#081126] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-primary" /></label>
            <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">语言<select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#081126] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none"><option value="python">Python</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="go">Go</option><option value="rust">Rust</option><option value="java">Java</option><option value="cpp">C++</option><option value="c">C</option><option value="csharp">C#</option><option value="kotlin">Kotlin</option><option value="swift">Swift</option><option value="ruby">Ruby</option><option value="php">PHP</option><option value="bash">Bash</option></select></label>
            <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">难度<select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#081126] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none"><option value="easy">初级</option><option value="medium">中级</option><option value="hard">高级</option></select></label>
            <label className="sm:col-span-2 text-xs text-slate-600 dark:text-slate-400 font-medium">标签（逗号分隔）<input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#081126] px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-primary" /></label>
          </div>
          <label className="block text-xs text-slate-600 dark:text-slate-400 font-medium">Markdown 题面<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={14} className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-[#081126] p-3 font-mono text-sm text-slate-900 dark:text-white outline-none focus:border-primary" /></label>
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-[#081126] p-4"><MarkdownRenderer content={description} /></div>
        </section>

        <section className="space-y-5 rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-surface-container-low/50 p-5 shadow-xs dark:shadow-none">
          <CodeEditor label="初始代码" value={starterCode} onChange={setStarterCode} language={language} />
          <CodeEditor label="参考答案（不会返回学员端）" value={referenceSolution} onChange={setReferenceSolution} language={language} />
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-surface-container-low/50 p-5 shadow-xs dark:shadow-none">
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="font-headline font-bold text-slate-900 dark:text-white">测试用例</h2><p className="mt-1 text-xs text-slate-500">输入和期望输出将原样传给 Judge0，比较时忽略行尾空格。</p></div>
          <button onClick={() => setTestCases((items) => [...items, { input: "", expected: "", hidden: false }])} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-3 py-1.5 text-xs text-primary font-medium hover:bg-primary/10"><Plus size={13} />添加</button>
        </div>
        <div className="space-y-3">
          {testCases.map((testCase, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#081126] p-4 md:grid-cols-2">
              <div className="md:col-span-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-medium"><input type="checkbox" checked={testCase.hidden} onChange={(e) => updateCase(index, { hidden: e.target.checked })} />隐藏用例</label>
                <button onClick={() => setTestCases((items) => items.filter((_, i) => i !== index))} className="text-rose-500 hover:text-rose-600 p-1"><Trash2 size={14} /></button>
              </div>
              <label className="text-xs text-slate-500">stdin<textarea rows={5} value={testCase.input} onChange={(e) => updateCase(index, { input: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-black/20 p-2 font-mono text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-primary" /></label>
              <label className="text-xs text-slate-500">expected stdout<textarea rows={5} value={testCase.expected} onChange={(e) => updateCase(index, { expected: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-black/20 p-2 font-mono text-xs text-slate-900 dark:text-slate-200 outline-none focus:border-primary" /></label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CodeEditor({ label, value, onChange, language }: { label: string; value: string; onChange: (value: string) => void; language: string }) {
  const { theme } = useTheme();
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</p>
      <div className="h-72 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
        <Editor value={value} onChange={(next) => onChange(next || "")} language={language === "bash" ? "shell" : language} theme={theme === "light" ? "vs" : "vs-dark"} options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true, scrollBeyondLastLine: false }} />
      </div>
    </div>
  );
}
