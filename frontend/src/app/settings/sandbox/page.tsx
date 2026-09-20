"use client";

import { useEffect, useState } from "react";
import { useDialog } from "@/components/DialogProvider";
import {
  getSandboxSettings,
  updateSandboxSettings,
  type SandboxSettings,
} from "@/lib/api";

export default function SettingsSandboxPage() {
  const { alert } = useDialog();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<SandboxSettings | null>(null);
  const [tokenId, setTokenId] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const s = await getSandboxSettings();
        setData(s);
        setTokenId("");
        setTokenSecret("");
      } catch (err) {
        await alert({
          title: "加载失败",
          message: err instanceof Error ? err.message : "无法加载沙箱配置",
        });
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    const id = tokenId.trim();
    const secret = tokenSecret.trim();
    if (!data?.has_modal_credentials && (!id || !secret)) {
      await alert({
        title: "请填写凭证",
        message: "首次配置需要同时填写 Modal Token ID 与 Token Secret。",
      });
      return;
    }

    setBusy(true);
    try {
      const keepSecret = !secret;
      const next = await updateSandboxSettings({
        default_provider: "modal",
        ...(id ? { modal_token_id: id } : {}),
        modal_token_secret: keepSecret ? null : secret,
        keep_modal_secret: keepSecret,
      });
      setData(next);
      setTokenId("");
      setTokenSecret("");
      await alert({ title: "已保存", message: "沙箱配置已更新。" });
    } catch (err) {
      await alert({
        title: "保存失败",
        message: err instanceof Error ? err.message : "保存失败",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-headline text-on-surface">沙箱配置</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          配置个人 Modal 凭证，用于学习页云端运行（BYOK）。
        </p>
      </div>

      {loading || !data ? (
        <div className="h-64 rounded-2xl bg-surface-container-high animate-pulse" />
      ) : (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-surface-container-high/60 border border-white/5">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">默认云端提供商</p>
            <p className="text-sm text-on-surface">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mr-2 bg-violet-500/20 text-violet-300 border border-violet-500/30">
                Phase A
              </span>
              Modal
            </p>
            <p className="text-xs text-slate-500 mt-2">
              当前阶段仅支持 Modal；凭证保存在个人设置中，不会使用平台密钥。
            </p>
          </div>

          <div className="p-5 rounded-2xl border border-white/5 bg-surface-container-high/60 space-y-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">凭证状态</p>
              {data.has_modal_credentials ? (
                <p className="text-sm text-on-surface">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mr-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    已配置
                  </span>
                  {data.modal_token_id_masked || "••••"}
                  <span className="text-xs text-slate-500 ml-2">· 已保存密钥</span>
                </p>
              ) : (
                <p className="text-sm text-on-surface-variant">尚未配置 Modal 凭证</p>
              )}
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">
                Modal Token ID
                {data.has_modal_credentials ? "（留空则保留原 ID）" : ""}
              </label>
              <input
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                placeholder={data.modal_token_id_masked || "ak-..."}
                className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary font-mono"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">
                Token Secret
                {data.has_modal_credentials ? "（留空则保留原密钥）" : ""}
              </label>
              <input
                type="password"
                value={tokenSecret}
                onChange={(e) => setTokenSecret(e.target.value)}
                placeholder={data.has_modal_credentials ? "已保存密钥 · 留空不修改" : "as-..."}
                className="w-full bg-surface-container-low border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary font-mono"
                autoComplete="off"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            Token 可在 Modal 控制台创建。章节代码内的 API Key（如 DeepSeek）仍通过学习页 .env
            配置，与此处沙箱凭证分开。
          </p>
        </div>
      )}
    </div>
  );
}
