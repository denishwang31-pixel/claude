import type { Request } from "express";
import { ENV } from "./env";

export function getSessionCookieOptions(req: Request) {
  const secure = ENV.isProd;
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("lax" as const) : ("lax" as const),
    path: "/",
  };
}
