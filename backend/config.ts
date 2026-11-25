import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export type AgyMode = "arg" | "stdin";

export interface AppConfig {
  port: number;
  riotApiKey: string;
  riotPlatform: string;
  riotRegional: string;
  agyBin: string;
  agyMode: AgyMode;
  agyTimeoutMs: number;
  liveClientUrl: string;
  livePollIntervalMs: number;
  liveCoachCooldownMs: number;
  paths: {
    root: string;
    frontend: string;
    data: string;
    cache: string;
    ddragon: string;
    mock: string;
    lastPrompt: string;
    lastResponse: string;
  };
}

// Quando compilado com `bun build --compile`, import.meta.dir aponta para `/$bunfs/...`.
// Nesse caso usamos process.cwd() para armazenar /data e ler .env ao lado do executável.
const isCompiledBinary =
  import.meta.dir.startsWith("/$bunfs") ||
  import.meta.dir.includes("\\$bunfs") ||
  import.meta.dir.includes("/$bunfs");

const root = isCompiledBinary ? process.cwd() : resolve(import.meta.dir, "..");
const data = resolve(root, "data");
const cache = resolve(data, "cache");
const ddragon = resolve(data, "ddragon");
const mock = resolve(data, "mock");

export function ensureDataDirs(): void {
  for (const dir of [data, cache, ddragon, mock]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  ensureDataDirs();

  const rawMode = (process.env.AGY_MODE ?? "arg").toLowerCase().trim();
  const agyMode: AgyMode = rawMode === "stdin" ? "stdin" : "arg";

  const parsedPort = Number(process.env.PORT ?? 3000);
  const parsedTimeout = Number(process.env.AGY_TIMEOUT_MS ?? 90000);
  const parsedPoll = Number(process.env.LIVE_POLL_INTERVAL_MS ?? 12000);
  const parsedCooldown = Number(process.env.LIVE_COACH_COOLDOWN_MS ?? 60000);

  return {
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000,
    riotApiKey: (process.env.RIOT_API_KEY ?? "").trim(),
    riotPlatform: (process.env.RIOT_PLATFORM ?? "br1").trim(),
    riotRegional: (process.env.RIOT_REGIONAL ?? "americas").trim(),
    agyBin: (process.env.AGY_BIN ?? "agy").trim(),
    agyMode,
    agyTimeoutMs:
      Number.isFinite(parsedTimeout) && parsedTimeout >= 5000
        ? parsedTimeout
        : 90000,
    liveClientUrl: (process.env.LIVE_CLIENT_URL ?? "https://127.0.0.1:2999")
      .trim()
      .replace(/\/+$/, ""),
    // Polling inteligente entre 10s e 15s (nunca menos que 10s para não floodar)
    livePollIntervalMs:
      Number.isFinite(parsedPoll) && parsedPoll >= 10000 ? parsedPoll : 12000,
    liveCoachCooldownMs:
      Number.isFinite(parsedCooldown) && parsedCooldown >= 15000
        ? parsedCooldown
        : 60000,
    paths: {
      root,
      frontend: resolve(root, "frontend"),
      data,
      cache,
      ddragon,
      mock,
      lastPrompt: resolve(data, "last_prompt.txt"),
      lastResponse: resolve(data, "last_response.txt"),
    },
  };
}

export const config: AppConfig = loadConfig();

export function hasConfiguredRiotKey(cfg: AppConfig = config): boolean {
  return (
    cfg.riotApiKey.length > 0 && !cfg.riotApiKey.includes("SEU-TOKEN-AQUI")
  );
}
