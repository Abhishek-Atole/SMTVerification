import type { NextFunction, Request, Response } from "express";
import { db } from "@workspace/db";
import { changeoverSessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type UserRole = "operator" | "qa" | "engineer";

export interface RequestActor {
  id: number;
  role: UserRole;
}

export interface AuthRequest extends Request {
  actor?: RequestActor;
}

function normalizeRole(value: unknown): UserRole | null {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "operator" || role === "qa" || role === "engineer") {
    return role;
  }
  return null;
}

function getActorFromRequest(req: AuthRequest): RequestActor | null {
  const headerUserId = req.headers["x-user-id"];
  const headerRole = req.headers["x-user-role"];

  const fallbackUserId = req.body?.operatorId ?? req.query?.operatorId;
  const fallbackRole = req.body?.role ?? req.query?.role;

  const rawUserId = Array.isArray(headerUserId) ? headerUserId[0] : headerUserId ?? fallbackUserId;
  const rawRole = Array.isArray(headerRole) ? headerRole[0] : headerRole ?? fallbackRole;

  const id = Number(rawUserId);
  const role = normalizeRole(rawRole);

  if (!Number.isFinite(id) || !role) return null;
  return { id, role };
}

export function attachActor(req: AuthRequest, res: Response, next: NextFunction): void {
  const actor = getActorFromRequest(req);
  if (!actor) {
    res.status(401).json({ error: "Missing or invalid actor context" });
    return;
  }

  req.actor = actor;
  next();
}

export function requireQaOrEngineer(req: AuthRequest, res: Response, next: NextFunction): void {
  const actor = req.actor;
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (actor.role !== "qa" && actor.role !== "engineer") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

export async function requireOperatorSessionOwnership(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const actor = req.actor;
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (actor.role !== "operator") {
    res.status(403).json({ error: "Only operators can post scans" });
    return;
  }

  const sessionId = Number(req.body?.sessionId);
  if (!Number.isFinite(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }

  const [session] = await db
    .select({ id: changeoverSessionsTable.id, operatorId: changeoverSessionsTable.operatorId })
    .from(changeoverSessionsTable)
    .where(eq(changeoverSessionsTable.id, sessionId));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.operatorId !== actor.id) {
    res.status(403).json({ error: "Forbidden: session does not belong to operator" });
    return;
  }

  next();
}

export async function requireSessionReadAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const actor = req.actor;
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (actor.role === "qa" || actor.role === "engineer") {
    next();
    return;
  }

  const sessionId = Number(req.params.sessionId);
  if (!Number.isFinite(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }

  const [session] = await db
    .select({ id: changeoverSessionsTable.id, operatorId: changeoverSessionsTable.operatorId })
    .from(changeoverSessionsTable)
    .where(eq(changeoverSessionsTable.id, sessionId));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.operatorId !== actor.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}