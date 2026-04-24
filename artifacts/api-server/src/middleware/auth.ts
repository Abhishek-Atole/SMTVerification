import type { NextFunction, Request, Response } from "express";
import { db } from "@workspace/db";
import { changeoverSessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getAuthActorFromCookie } from "../routes/auth";

export type UserRole = "operator" | "qa" | "engineer";

export interface RequestActor {
  userId: number;
  id: number;
  username: string;
  name: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  actor?: RequestActor;
}

export function attachActor(req: AuthRequest, res: Response, next: NextFunction): void {
  const actor = getAuthActorFromCookie(req);
  if (!actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.actor = {
    userId: actor.userId,
    id: actor.userId,
    username: actor.username,
    name: actor.username,
    role: actor.role,
  };
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