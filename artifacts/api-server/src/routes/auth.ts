import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { type UserRole } from "../middleware/auth";

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

const demoUsers: AuthUser[] = [
  {
    userId: 1,
    username: "Umesh Nagile",
    role: "engineer",
    passwordHash: bcrypt.hashSync("Engineer@SMT2026", 12),
  },
  {
    userId: 2,
    username: "Dhupchand Bhardwaj",
    role: "engineer",
    passwordHash: bcrypt.hashSync("Engineer@SMT2026", 12),
  },
  {
    userId: 3,
    username: "Maruti Birader",
    role: "engineer",
    passwordHash: bcrypt.hashSync("Engineer@SMT2026", 12),
  },
  {
    userId: 4,
    username: "Abhishek Atole",
    role: "qa",
    passwordHash: bcrypt.hashSync("QA@SMT2026", 12),
  },
  {
    userId: 5,
    username: "Viswajit",
    role: "qa",
    passwordHash: bcrypt.hashSync("QA@SMT2026", 12),
  },
  {
    userId: 6,
    username: "Aarti",
    role: "operator",
    passwordHash: bcrypt.hashSync("Operator@SMT2026", 12),
  },
  {
    userId: 7,
    username: "Aniket",
    role: "operator",
    passwordHash: bcrypt.hashSync("Operator@SMT2026", 12),
  },
  {
    userId: 8,
    username: "Suraj",
    role: "operator",
    passwordHash: bcrypt.hashSync("Operator@SMT2026", 12),
  },
];

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
  } catch {
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
    res.status(400).json({ error: "Invalid login payload" });
    return;
  }

  const { username, password, role } = parsed;
  const normalizedUsername = username.trim().toLowerCase();
  const user = demoUsers.find(
    (candidate) => candidate.role === role && candidate.username.toLowerCase() === normalizedUsername,
  );

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({
    userId: user.userId,
    username: user.username,
    role: user.role,
  });

  res.cookie("smt_token", token, getCookieOptions());
  res.status(200).json({
    userId: user.userId,
    username: user.username,
    role: user.role,
  });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("smt_token", getCookieOptions());
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

export function getAuthActorFromCookie(req: { cookies?: { smt_token?: string } }): AuthTokenPayload | null {
  const token = readTokenFromCookie(req);
  if (!token) {
    return null;
  }
  return verifyToken(token);
}

export default router;