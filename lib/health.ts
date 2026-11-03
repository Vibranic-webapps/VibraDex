// Public health check for GET /api/health. The Pi (Nova Hub) reads it to know whether the
// app AND its database are alive. It is deliberately boring: no auth, no version, no error
// text (a public URL must not describe our internals), just ok/down and how long it took.

export type HealthBody = { ok: boolean; db: "up" | "down"; ms: number };

export type HealthResult = { status: 200 | 503; body: HealthBody };

// Longer than a Neon cold start usually takes, shorter than a serverless function timeout.
export const HEALTH_TIMEOUT_MS = 4000;

/** Runs `ping` (a cheap query like SELECT 1) and reports. Never throws, never leaks the error. */
export async function checkHealth(
  ping: () => Promise<unknown>,
  timeoutMs: number = HEALTH_TIMEOUT_MS,
  now: () => number = Date.now,
): Promise<HealthResult> {
  const start = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let up = false;
  try {
    await Promise.race([
      ping(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    up = true;
  } catch {
    up = false;
  } finally {
    if (timer) clearTimeout(timer);
  }
  return {
    status: up ? 200 : 503,
    body: { ok: up, db: up ? "up" : "down", ms: Math.max(0, Math.round(now() - start)) },
  };
}
