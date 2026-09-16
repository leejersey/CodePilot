"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  Search,
  ShieldCheck,
  UserCheck,
  UserRound,
  UserX,
  X,
} from "lucide-react";
import { SuperAdminGuard } from "@/components/SuperAdminGuard";
import { useDialog } from "@/components/DialogProvider";
import { useAuth } from "@/hooks/useAuth";
import {
  listAdminUsers,
  resetAdminUserPassword,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AccountRole,
  type AccountStatus,
  type AdminUser,
  type AdminUserList,
} from "@/lib/api";

const ROLE_LABELS: Record<AccountRole, string> = {
  super_admin: "超级管理员",
  admin: "管理员",
  learner: "学员",
};

const emptyData: AdminUserList = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
  stats: { total: 0, super_admin: 0, admin: 0, learner: 0, active: 0, disabled: 0 },
};

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { alert, confirm } = useDialog();
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [role, setRole] = useState<AccountRole | "">("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await listAdminUsers({ page, pageSize: 20, keyword: appliedKeyword, role, status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "账号列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, page, role, status]);

  useEffect(() => {
    load();
  }, [load]);

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedKeyword(keyword.trim());
  };

  const changeRole = async (target: AdminUser, nextRole: AccountRole) => {
    if (target.role === nextRole) return;
    const ok = await confirm({
      title: "修改账号角色",
      message: `确认将 ${target.nickname} 的角色改为“${ROLE_LABELS[nextRole]}”吗？该账号现有登录会立即失效。`,
      confirmText: "确认修改",
      tone: "default",
    });
    if (!ok) return;
    setBusyId(target.id);
    try {
      await updateAdminUserRole(target.id, nextRole);
      await load();
    } catch (err) {
      await alert({ title: "修改失败", message: err instanceof Error ? err.message : "请稍后重试" });
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = async (target: AdminUser) => {
    const nextStatus: AccountStatus = target.status === "active" ? "disabled" : "active";
    const ok = await confirm({
      title: nextStatus === "disabled" ? "禁用账号" : "启用账号",
      message:
        nextStatus === "disabled"
          ? `禁用后 ${target.nickname} 将立即退出且无法登录。`
          : `启用后 ${target.nickname} 可以重新登录平台。`,
      confirmText: nextStatus === "disabled" ? "确认禁用" : "确认启用",
      tone: nextStatus === "disabled" ? "danger" : "default",
    });
    if (!ok) return;
    setBusyId(target.id);
    try {
      await updateAdminUserStatus(target.id, nextStatus);
      await load();
    } catch (err) {
      await alert({ title: "操作失败", message: err instanceof Error ? err.message : "请稍后重试" });
    } finally {
      setBusyId(null);
    }
  };

  const submitPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTarget || temporaryPassword.length < 8) return;
    setBusyId(resetTarget.id);
    try {
      await resetAdminUserPassword(resetTarget.id, temporaryPassword);
      setResetTarget(null);
      setTemporaryPassword("");
      await alert({ title: "密码已重置", message: "临时密码已生效，该账号的旧登录状态已失效。" });
    } catch (err) {
      await alert({ title: "重置失败", message: err instanceof Error ? err.message : "请稍后重试" });
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  const stats = [
    { label: "全部账号", value: data.stats.total, icon: UserRound },
    { label: "管理员", value: data.stats.admin + data.stats.super_admin, icon: ShieldCheck },
    { label: "正常使用", value: data.stats.active, icon: UserCheck },
    { label: "已禁用", value: data.stats.disabled, icon: UserX },
  ];

  return (
    <SuperAdminGuard>
      <div className="mx-auto max-w-7xl space-y-6">
        <section>
          <p className="mb-2 text-xs font-mono text-primary">ACCOUNT ACCESS</p>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-white">账号管理</h1>
          <p className="mt-2 text-sm text-slate-400">管理平台账号状态、角色与登录凭据。</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/[0.07] bg-surface-container-low/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-1 font-headline text-2xl font-bold text-white">{item.value}</p>
                </div>
                <item.icon size={19} className="text-primary" />
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-surface-container-low/45">
          <form onSubmit={applySearch} className="flex flex-col gap-3 border-b border-white/[0.07] p-4 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索邮箱或昵称"
                className="w-full rounded-xl border border-white/10 bg-[#081126] py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-primary/40"
              />
            </div>
            <select
              value={role}
              onChange={(event) => { setRole(event.target.value as AccountRole | ""); setPage(1); }}
              className="rounded-xl border border-white/10 bg-[#081126] px-3 py-2.5 text-sm text-slate-300"
            >
              <option value="">全部角色</option>
              <option value="super_admin">超级管理员</option>
              <option value="admin">管理员</option>
              <option value="learner">学员</option>
            </select>
            <select
              value={status}
              onChange={(event) => { setStatus(event.target.value as AccountStatus | ""); setPage(1); }}
              className="rounded-xl border border-white/10 bg-[#081126] px-3 py-2.5 text-sm text-slate-300"
            >
              <option value="">全部状态</option>
              <option value="active">正常</option>
              <option value="disabled">已禁用</option>
            </select>
            <button className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-slate-950">查询</button>
          </form>

          {error && <div className="m-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
          {loading ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 animate-spin" size={18} />加载账号…
            </div>
          ) : data.items.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">没有符合条件的账号</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-white/[0.07] text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">用户</th>
                    <th className="px-5 py-3 font-medium">角色</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">注册时间</th>
                    <th className="px-5 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {data.items.map((item) => {
                    const isSelf = item.id === currentUser?.id;
                    const busy = busyId === item.id;
                    return (
                      <tr key={item.id} className="text-slate-300">
                        <td className="px-5 py-4">
                          <p className="font-medium text-white">{item.nickname}{isSelf && <span className="ml-2 text-[10px] text-primary">当前账号</span>}</p>
                          <p className="mt-0.5 text-xs text-slate-600">{item.email || `匿名账号 · ${item.id.slice(0, 8)}`}</p>
                        </td>
                        <td className="px-5 py-4">
                          <select
                            value={item.role}
                            disabled={busy || isSelf}
                            onChange={(event) => changeRole(item, event.target.value as AccountRole)}
                            className="rounded-lg border border-white/10 bg-[#081126] px-2.5 py-1.5 text-xs disabled:opacity-50"
                          >
                            <option value="learner">学员</option>
                            <option value="admin">管理员</option>
                            <option value="super_admin">超级管理员</option>
                          </select>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs ${item.status === "active" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                            {item.status === "active" ? "正常" : "已禁用"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">{new Date(item.created_at).toLocaleDateString("zh-CN")}</td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            {item.auth_provider !== "anonymous" && (
                              <button
                                disabled={busy}
                                onClick={() => { setResetTarget(item); setTemporaryPassword(""); }}
                                className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-primary disabled:opacity-50"
                                title="重置密码"
                              >
                                <KeyRound size={15} />
                              </button>
                            )}
                            <button
                              disabled={busy || isSelf}
                              onClick={() => toggleStatus(item)}
                              className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 ${item.status === "active" ? "border-rose-500/20 text-rose-300" : "border-emerald-500/20 text-emerald-300"}`}
                            >
                              {busy ? "处理中" : item.status === "active" ? "禁用" : "启用"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-4 text-xs text-slate-500">
            <span>共 {data.total} 个结果</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-30">上一页</button>
              <span>{page} / {totalPages}</span>
              <button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-30">下一页</button>
            </div>
          </div>
        </section>
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form onSubmit={submitPasswordReset} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1428] p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-headline text-lg font-bold text-white">重置临时密码</h2>
                <p className="mt-1 text-xs text-slate-500">{resetTarget.email}</p>
              </div>
              <button type="button" onClick={() => setResetTarget(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <label className="mt-6 block text-xs text-slate-400">临时密码（至少 8 位）</label>
            <input
              autoFocus
              type="password"
              minLength={8}
              maxLength={100}
              required
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#081126] px-3 py-2.5 text-sm text-white outline-none focus:border-primary/40"
            />
            <p className="mt-2 text-xs leading-relaxed text-amber-300/80">保存后该账号的所有旧登录状态会立即失效。</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setResetTarget(null)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400">取消</button>
              <button disabled={temporaryPassword.length < 8 || busyId === resetTarget.id} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">
                {busyId === resetTarget.id ? "保存中…" : "确认重置"}
              </button>
            </div>
          </form>
        </div>
      )}
    </SuperAdminGuard>
  );
}
