/**
 * 匿名签名会话是"未登录"的一种，不是账号。
 *
 * init() 在没有 token 时会自动签发匿名会话，因此 `user` 几乎总是非空；
 * 路由守卫若直接判断 `user`，重定向和登录入口都会变成死代码。
 */

export interface AccountLike {
  auth_provider?: string | null;
}

/** 需要真实账号的路由：匿名会话在这些页面上只会撞到 403。 */
const ACCOUNT_SCOPED_ROUTES = [
  "/dashboard",
  "/settings",
  "/history",
  "/learn",
  "/creator",
  "/admin",
];

export function needsRealAccount(pathname: string): boolean {
  return ACCOUNT_SCOPED_ROUTES.some(
    (route) =>
      // /learn 需要账号，但 /learn/{pathId} 保留给匿名试用的旧路径。
      pathname === route || (route !== "/learn" && pathname.startsWith(`${route}/`))
  );
}

export function isRealAccount(user: AccountLike | null | undefined): boolean {
  return Boolean(user) && user?.auth_provider !== "anonymous";
}

export function shouldOfferSignIn(user: AccountLike | null | undefined): boolean {
  return !isRealAccount(user);
}
