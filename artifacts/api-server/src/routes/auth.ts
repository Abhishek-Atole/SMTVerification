import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { type UserRole } from "../middleware/auth";
import { auditLog } from "../lib/auditLogger";

type AuthUser = {
  userId: number;
  username: string;
  role: UserRole;
  passwordHash: string;
};

type AuthTokenPayload = {
  userId: number;
  username: string;
  role: UserRole;
};

const LOGIN_DURATION_MS = 8 * 60 * 60 * 1000;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET must be set");
  }
  return secret;
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: LOGIN_DURATION_MS,
    path: "/",
  };
}

function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "8h",
  });
}

function readTokenFromCookie(req: { cookies?: { smt_token?: string } }): string | null {
  const token = req.cookies?.smt_token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    const userId = Number(decoded.userId);
    const username = typeof decoded.username === "string" ? decoded.username.trim() : "";
    const role = decoded.role;

    if (!Number.isFinite(userId) || !username || (role !== "operator" && role !== "qa" && role !== "engineer")) {
      return null;
    }

    return {
      userId,
      username,
      role,
    };
  } catch (error) {
    console.warn("[Auth] Invalid JWT token", error);
    return null;
  }
}

function parseLoginPayload(body: unknown): { username: string; password: string; role: UserRole } | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  const username = typeof candidate.username === "string" ? candidate.username.trim() : "";
  const password = typeof candidate.password === "string" ? candidate.password : "";
  const role = candidate.role;

  if (!username || !password || (role !== "operator" && role !== "qa" && role !== "engineer")) {
    return null;
  }

  return { username, password, role };
}

const router: IRouter = Router();

router.post("/auth/login", async (req, res) => {
  const parsed = parseLoginPayload(req.body);
  if (!parsed) {
    await auditLog({ event: "LOGIN_FAILURE", detail: "Invalid login payload", ip: req.ip });
    res.status(400).json({ error: "Invalid login payload" });
    return;
  }

  const { username, password, role } = parsed;
  const normalizedUsername = username.trim().toLowerCase();

  const userRecord = await db.query.usersTable.findFirst({
    where: and(eq(usersTable.username, normalizedUsername), eq(usersTable.role, role)),
  });

  const user: AuthUser | null = userRecord
    ? {
      userId: userRecord.id,
      username: userRecord.username,
      role: userRecord.role as UserRole,
      passwordHash: userRecord.password,
    }
    : null;

  if (!user) {
    await auditLog({ event: "LOGIN_FAILURE", detail: `Unknown user: ${username}`, ip: req.ip });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    await auditLog({ event: "LOGIN_FAILURE", operatorId: user.userId, detail: "Password mismatch", ip: req.ip });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({
    userId: user.userId,
    username: user.username,
    role: user.role,
  });

  res.cookie("smt_token", token, getCookieOptions());
  await auditLog({ event: "LOGIN_SUCCESS", operatorId: user.userId, detail: user.role, ip: req.ip });
  res.status(200).json({
    userId: user.userId,
    username: user.username,
    role: user.role,
  });
});

router.post("/auth/logout", async (req, res) => {
  res.clearCookie("smt_token", getCookieOptions());
  const actor = getAuthActorFromCookie(req);
  await auditLog({ event: "LOGOUT", operatorId: actor?.userId, detail: actor?.role, ip: req.ip });
  res.status(200).json({ success: true });
});

router.get("/auth/me", (req, res) => {
  const token = readTokenFromCookie(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(payload);
});

/**
 * POST /api/auth/verify-override
 * Verify supervisor/QA password for manual override approval
 */
router.post("/auth/verify-override", async (req, res) => {
  try {
    const { password, role } = req.body;

    if (!password || (role !== "supervisor" && role !== "qa")) {
      res.status(400).json({ error: "password and role (supervisor|qa) are required" });
      return;
    }

    // Supervisor approvals are handled by engineer-role users in this system.
    const mappedRole = role === "supervisor" ? "engineer" : "qa";

    const userRecord = await db.query.usersTable.findFirst({
      where: eq(usersTable.role, mappedRole),
    });

    if (!userRecord) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const passwordValid = await bcrypt.compare(password, userRecord.password);
    if (!passwordValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    await auditLog({
      event: "SCAN_VERIFIED",
      operatorId: userRecord.id,
      detail: `Manual override approval by ${userRecord.username} (${role})`,
      ip: req.ip,
    });

    res.json({
      valid: true,
      approverName: userRecord.username,
      approverRole: role,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Verification failed" });
  }
});

export function getAuthActorFromCookie(req: { cookies?: { smt_token?: string } }): AuthTokenPayload | null {
  const token = readTokenFromCookie(req);
  if (!token) {
    return null;
  }
  return verifyToken(token);
}

export default router;