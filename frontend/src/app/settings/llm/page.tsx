"use client";

import { useEffect, useMemo, useState } from "react";
import { useDialog } from "@/components/DialogProvider";
import { Plus, X } from "lucide-react";
import {
  getLlmSettings,
  setActiveLlmProfile,
  createLlmProfile,
  updateLlmProfile,
  deleteLlmProfile,
  testLlmSettings,
  type LlmSettings,
  type LlmProfile,
} from "@/lib/api";

type FormMode = "closed" | "create" | "edit";

export default function SettingsLlmPage() {
  const { alert, confirm } = useDialog();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<LlmSettings | null>(null);
  const [formMode, setFormMode] = useState<FormMode>("closed");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [setActiveOnCreate, setSetActiveOnCreate] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setData(await getLlmSettings());
      } catch (err) {
        await alert({
          title: "加载失败",
          message: err instanceof Error ? err.message : "无法加载模型配置",
        });
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preset = useMemo(
    () => data?.presets.find((p) => p.id === provider),
    [data, provider]
  );

  const openCreate = () => {
    const first = data?.presets[0];
    setFormMode("create");
    setEditingId(null);
    setName("");
    setProvider(first?.id || "deepseek");
    setApiKey("");
    setBaseUrl(first?.base_url || "");
    setModel(first?.default_model || "");
    setSetActiveOnCreate(true);
  };

  const openEdit = (p: LlmProfile) => {
    setFormMode("edit");
    setEditingId(p.id);
    setName(p.name);
    setProvider(p.provider);
    setApiKey("");
    setBaseUrl(p.base_url);
    setModel(p.model);
  };

  const onProviderChange = (id: string) => {
    setProvider(id);
    const p = data?.presets.find((x) => x.id === id);
    if (!p || id === "custom") return;
    setBaseUrl(p.base_url);
    setModel(p.default_model);
  };

  const handleSelect = async (id: string | null) => {
    setBusy(true);
    try {
      setData(await setActiveLlmProfile(id));
    } catch (err) {
      await alert({
        title: "切换失败",
        message: err instanceof Error ? err.message : "切换失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveForm = async () => {
    if (!name.trim()) {
      await alert({ title: "请填写名称", message: "给这条配置起个名字，例如「Gemini 工作用」。" });
      return;
    }
    if (formMode === "create" && !apiKey.trim()) {
      await alert({ title: "请填写 API Key", message: "新增配置必须填写 API Key。" });
      return;
    }
    setBusy(true);
    try {
      let s: LlmSettings;
      if (formMode === "create") {
        s = await createLlmProfile({
          name: name.trim(),
          provider,
          api_key: apiKey.trim(),
          base_url: baseUrl.trim(),
          model: model.trim(),
          set_active: setActiveOnCreate,
        });
      } else if (editingId) {
        s = await updateLlmProfile(editingId, {
          name: name.trim(),
          provider,
          api_key: apiKey.trim() || undefined,
          base_url: baseUrl.trim(),
          model: model.trim(),
          keep_api_key: !apiKey.trim(),
        });
      } else {
        return;
      }
      setData(s);
      setFormMode("closed");
      await alert({ title: "已保存", message: "模型配置已更新。" });
    } catch (err) {
      await alert({
        title: "保存失败",
        message: err instanceof Error ? err.message : "保存失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (p: LlmProfile) => {
    const ok = await confirm({
      title: "删除配置",
      message: `确定删除「${p.name}」？`,
      confirmText: "删除",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setData(await deleteLlmProfile(p.id));
      if (editingId === p.id) setFormMode("closed");
    } catch (err) {
      await alert({
        title: "删除失败",
        message: err instanceof Error ? err.message : "删除失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const r = await testLlmSettings();
      await alert({
        title: "连通成功",
        message: `来源：${r.source}\n模型：${r.model}\n回复：${r.reply || "(空)"}`,
      });
    } catch (err) {
      await alert({
        title: "连通失败",
        message: err instanceof Error ? err.message : "测试失败",
      });
    } finally {
      setBusy(false);
    }
  };

  const providerLabel = (id: string) =>
    data?.presets.find((p) => p.id === id)?.label || id;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-headline text-on-surface">模型配置</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          可新增多条模型配置，选择一条启用；不选则使用平台默认。
        </p>
      </div>

      {loading || !data ? (
        <div className="h-64 rounded-2xl bg-surface-container-high animate-pulse" />
      ) : (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-surface-container-high/60 border border-white/5">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">当前生效</p>
            <p className="text-sm text-on-surface">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full mr-2 ${
                  data.active_source === "user"
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                    : "bg-slate-500/20 text-slate-300 border border-slate-500/30"
                }`}
              >
                {data.active_source === "user" ? "个人配置" : "平台默认"}
              </span>
              {data.active_model}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-mono break-all">{data.active_base_url}</p>
            <button
              type="button"
              disabled={busy}
              onClick={handleTest}
              className="mt-3 text-xs text-primary hover:underline disabled:opacity-50"
            >
              测试当前连通性
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-on-surface">我的模型配置</h3>
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25"
              >
                <Plus className="w-3.5 h-3.5" />
                新增配置
              </button>
            </div>

            <label
              className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                !data.active_id
                  ? "border-primary/40 bg-primary/5"
                  : "border-white/10 bg-surface-container-low hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="llm-active"
                checked={!data.active_id}
                disabled={busy}
                onChange={() => handleSelect(null)}
                className="mt-1 accent-cyan-400"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-on-surface">平台默认</p>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {data.platform_model} · {data.platform_base_url}
                </p>
              </div>
            </label>

            {data.profiles.length === 0 && (
              <p className="text-xs text-slate-500 px-1">
                还没有个人配置。点击「新增配置」添加 Gemini / Claude（OpenRouter）等。
              </p>
            )}

            {data.profiles.map((p) => {
              const selected = data.active_id === p.id;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border transition-colors ${
                    selected
                      ? "border-primary/40 bg-primary/5"
                      : "border-white/10 bg-surface-container-low"
                  }`}
                >
                  <label className="flex items-start gap-3 p-4 cursor-pointer">
                    <input
                      type="radio"
                      name="llm-active"
                      checked={selected}
                      disabled={busy}
                      onChange={() => handleSelect(p.id)}
                      className="mt-1 accent-cyan-400"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-on-surface">{p.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {providerLabel(p.provider)} · {p.model}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1 font-mono truncate">
                        {p.api_key_masked || "无 Key"} · {p.base_url}
                      </p>
                    </div>
                  </label>
                  <div className="flex gap-2 px-4 pb-3 pl-11">
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-primary"
                      onClick={() => openEdit(p)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-red-400"
                      onClick={() => handleDelete(p)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {formMode !== "closed" && (
            <div className="p-5 rounded-2xl border border-primary/25 bg-[#0c1528] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-on-surface">
                  {formMode === "create" ? "新增模型配置" : "编辑模型配置"}
                </h3>
                <button
                  type="button"
                  className="text-slate-500 hover:text-slate-300 p-1 transition-colors"
                  onClick={() => setFormMode("closed")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">名称</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：Gemini 学习 / Claude 写作"
                  className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">提供商</label>
                <select
                  value={provider}
                  onChange={(e) => onProviderChange(e.target.value)}
                  className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary"
                >
                  {(data.presets || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {preset?.hint && (
                  <p className="text-[11px] text-slate-500 mt-1.5">{preset.hint}</p>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">
                  API Key
                  {formMode === "edit" ? "（留空则保留原 Key）" : ""}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={formMode === "edit" ? "••••••••" : "sk-..."}
                  className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary font-mono"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Base URL</label>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">模型名</label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary font-mono"
                />
              </div>

              {formMode === "create" && (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={setActiveOnCreate}
                    onChange={(e) => setSetActiveOnCreate(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  创建后立即启用此配置
                </label>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveForm}
                  className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:brightness-110 disabled:opacity-50"
                >
                  {busy ? "保存中…" : "保存"}
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode("closed")}
                  className="px-5 py-2.5 rounded-xl border border-white/10 text-sm text-on-surface-variant hover:bg-white/5"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-600 leading-relaxed">
            Claude 建议用 OpenRouter，模型填{" "}
            <code className="text-slate-400">anthropic/claude-3.5-sonnet</code>。 Gemini
            用 Google 官方 OpenAI 兼容端点。选中「平台默认」即回退到 backend/.env。
          </p>
        </div>
      )}
    </div>
  );
}
