import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getUserById, getMembership, listAgencies } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-kronicle-secret-change-me";
export const COOKIE = "kronicleToken";

export interface SessionUser {
  id: string;
  user_id: number;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      agencyId?: string;
      role?: "admin" | "editor" | "viewer";
    }
  }
}

export function signToken(user: SessionUser) {
  return jwt.sign({ id: user.id, userId: user.user_id, name: user.name }, JWT_SECRET, {
    expiresIn: "2h",
  });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 2 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE];
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ message: "Token not provided" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string };
    const user = getUserById(payload.id);
    if (!user) return res.status(401).json({ message: "Invalid token" });
    req.user = user;

    const headerAgency = String(req.headers["x-agency-id"] ?? "").trim();
    const agencies = listAgencies(user.id);
    if (!agencies.length) return next();

    const chosen = headerAgency || agencies[0].id;
    const membership = getMembership(chosen, user.id);
    if (!membership) return res.status(403).json({ message: "You are not a member of this organisation" });
    req.agencyId = chosen;
    req.role = membership.role;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Forbidden — your role does not include this action" });
  }
  return next();
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.role;
    const admin = role === "admin";
    const editor = role === "editor";
    const allowed =
      admin ||
      (editor && ["generate.run", "project.create", "project.edit", "project.move", "project.view"].includes(permission)) ||
      (role === "viewer" && permission === "project.view");
    if (!allowed) {
      return res.status(403).json({ message: `Forbidden — your role does not include ${permission}` });
    }
    return next();
  };
}
