"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDialog } from "@/components/DialogProvider";
import { KeyRound } from "lucide-react";

export default function SettingsAccountPage() {
  const { user, changePassword } = useAuth();
  const { alert } = useDialog();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      await alert({ title: "新密码过短", message: "新密码至少需要 8 位。" });
      return;
    }
    if (newPassword !== confirmPassword) {
      await alert({ title: "密码不一致", message: "两次输入的新密码不一致。" });
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await alert({
        title: "密码已修改",
        message: "其他设备的登录状态已失效，当前设备可继续使用。",
      });
    } catch (err) {
      await alert({
        title: "修改失败",
        message: err instanceof Error ? err.message : "修改密码失败",
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-headline text-on-surface">账号与安全</h2>
        <p className="text-sm text-on-surface-variant mt-1">查看账号资料，管理登录密码。</p>
      </div>

      {user && (
        <div className="p-5 rounded-2xl bg-surface-container-high border border-white/5">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">当前账号</p>
          <p className="text-sm text-on-surface font-medium">{user.nickname}</p>
          <p className="text-xs text-slate-500 mt-1">{user.email}</p>
          {user.auth_provider && (
            <p className="text-[11px] text-slate-600 mt-3">
              登录方式：{user.auth_provider === "email" ? "邮箱密码" : user.auth_provider}
            </p>
          )}
        </div>
      )}

      {user?.auth_provider === "email" ? (
        <div className="rounded-2xl border border-white/5 bg-surface-container-high/60 p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-on-surface">修改密码</h3>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="当前密码"
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/10 bg-surface-container-low px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密码（至少 8 位）"
              autoComplete="new-password"
              className="w-full rounded-xl border border-white/10 bg-surface-container-low px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认新密码"
              autoComplete="new-password"
              className="w-full rounded-xl border border-white/10 bg-surface-container-low px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword}
              onClick={handleChangePassword}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50"
            >
              {passwordBusy ? "修改中…" : "确认修改"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          当前账号未使用邮箱密码登录，无需在此修改密码。
        </p>
      )}
    </div>
  );
}
