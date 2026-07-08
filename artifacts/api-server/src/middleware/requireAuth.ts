import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}
const secret = new TextEncoder().encode(process.env.SESSION_SECRET);

export interface AuthRequest extends Request {
  userId: number;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, secret);
    (req as AuthRequest).userId = payload.sub as unknown as number;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
