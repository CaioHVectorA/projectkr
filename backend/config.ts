import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type AgyMode = "arg" | "stdin";

export interface PersistedSettings {
  riotApiKey?: string;
  defaultRiotId?: string;
  riotPlatform?: string;
  riotRegional?: string;
  agyBin?: string;
  agyMode?: AgyMode;
  agyTimeoutMs?: number;
  liveClientUrl?: string;
  livePollIntervalMs?: number;
  liveCoachCooldownMs?: number;
}

export interface PublicSettings {
  riotKeyConfigured: boolean;
  riotKeyMasked: string;
  defaultRiotId: string;
  riotPlatform: string;
  riotRegional: string;
  agyBin: string;
  agyMode: AgyMode;
  agyTimeoutSec: number;
  liveClientUrl: string;
  livePollIntervalSec: number;
  liveCoachCooldownSec: number;
  settingsFilePath: string;
}

export interface AppConfig {
  port: number;
  riotApiKey: string;
  defaultRiotId: string;
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
    settings: string;
    lastPrompt: string;
    lastResponse: string;
  };
}

// Quando compilado com `bun build --compile`, import.meta.dir aponta para `/$bunfs/...`.
// Nesse caso usamos process.cwd() para armazenar /data ao lado do executável.
const isCompiledBinary =
  import.meta.dir.startsWith("/$bunfs") ||
  import.meta.dir.includes("\\$bunfs") ||
  import.meta.dir.includes("/$bunfs");

const root = isCompiledBinary ? process.cwd() : resolve(import.meta.dir, "..");
const data = resolve(root, "data");
const cache = resolve(data, "cache");
const ddragon = resolve(data, "ddragon");
const mock = resolve(data, "mock");
const settingsPath = resolve(data, "settings.json");

export function ensureDataDirs(): void {
  for (const dir of [data, cache, ddragon, mock]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function inferRegionalRouting(platform: string): string {
  const p = platform.toLowerCase().trim();
  if (["br1", "na1", "la1", "la2", "oc1"].includes(p)) return "americas";
  if (["euw1", "eun1", "tr1", "ru", "me1"].includes(p)) return "europe";
  if (["kr", "jp1", "ph2", "sg2", "th2", "tw2", "vn2"].includes(p)) return "asia";
  return "americas";
}

function readPersistedSettings(): PersistedSettings {
  if (!existsSync(settingsPath)) return {};
  try {
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as PersistedSettings)
      : {};
  } catch {
    return {};
  }
}

export function loadConfig(): AppConfig {
  ensureDataDirs();
  const saved = readPersistedSettings();

  const rawMode = (saved.agyMode ?? process.env.AGY_MODE ?? "arg")
    .toLowerCase()
    .trim();
  const agyMode: AgyMode = rawMode === "stdin" ? "stdin" : "arg";

  const parsedPort = Number(process.env.PORT ?? 3000);
  const parsedTimeout = Number(
    saved.agyTimeoutMs ?? process.env.AGY_TIMEOUT_MS ?? 90000
  );
  const parsedPoll = Number(
    saved.livePollIntervalMs ?? process.env.LIVE_POLL_INTERVAL_MS ?? 12000
  );
  const parsedCooldown = Number(
    saved.liveCoachCooldownMs ?? process.env.LIVE_COACH_COOLDOWN_MS ?? 60000
  );

  const riotPlatform = (
    saved.riotPlatform ??
    process.env.RIOT_PLATFORM ??
    "br1"
  )
    .toLowerCase()
    .trim();
  const riotRegional = (
    saved.riotRegional ??
    process.env.RIOT_REGIONAL ??
    inferRegionalRouting(riotPlatform)
  )
    .toLowerCase()
    .trim();

  return {
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000,
    riotApiKey: (saved.riotApiKey ?? process.env.RIOT_API_KEY ?? "").trim(),
    defaultRiotId: (saved.defaultRiotId ?? "").trim(),
    riotPlatform,
    riotRegional,
    agyBin: (saved.agyBin ?? process.env.AGY_BIN ?? "agy").trim() || "agy",
    agyMode,
    agyTimeoutMs:
      Number.isFinite(parsedTimeout) && parsedTimeout >= 5000
        ? parsedTimeout
        : 90000,
    liveClientUrl: (
      saved.liveClientUrl ??
      process.env.LIVE_CLIENT_URL ??
      "https://127.0.0.1:2999"
    )
      .trim()
      .replace(/\/+$/, ""),
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
      settings: settingsPath,
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

export function maskApiKey(key: string): string {
  const clean = key.trim();
  if (!clean || clean.includes("SEU-TOKEN-AQUI")) return "";
  if (clean.length <= 10) return "••••••";
  return `${clean.slice(0, 6)}••••••${clean.slice(-4)}`;
}

export function getPublicSettings(cfg: AppConfig = config): PublicSettings {
  return {
    riotKeyConfigured: hasConfiguredRiotKey(cfg),
    riotKeyMasked: maskApiKey(cfg.riotApiKey),
    defaultRiotId: cfg.defaultRiotId,
    riotPlatform: cfg.riotPlatform,
    riotRegional: cfg.riotRegional,
    agyBin: cfg.agyBin,
    agyMode: cfg.agyMode,
    agyTimeoutSec: Math.round(cfg.agyTimeoutMs / 1000),
    liveClientUrl: cfg.liveClientUrl,
    livePollIntervalSec: Math.round(cfg.livePollIntervalMs / 1000),
    liveCoachCooldownSec: Math.round(cfg.liveCoachCooldownMs / 1000),
    settingsFilePath: cfg.paths.settings,
  };
}

export interface SettingsUpdateInput {
  riotApiKey?: string; // se undefined, mantém atual; se "", limpa
  clearRiotApiKey?: boolean;
  defaultRiotId?: string;
  riotPlatform?: string;
  agyBin?: string;
  agyMode?: AgyMode;
  agyTimeoutSec?: number;
  livePollIntervalSec?: number;
  liveCoachCooldownSec?: number;
}

/**
 * Atualiza a configuração em memória em tempo real e persiste em data/settings.json.
 * Dispensa completamente qualquer edição manual de arquivo .env.
 */
export function updateRuntimeSettings(
  patch: SettingsUpdateInput,
  cfg: AppConfig = config
): PublicSettings {
  ensureDataDirs();

  if (patch.clearRiotApiKey) {
    cfg.riotApiKey = "";
  } else if (typeof patch.riotApiKey === "string") {
    const trimmed = patch.riotApiKey.trim();
    if (trimmed.length > 0) {
      cfg.riotApiKey = trimmed;
    }
  }

  if (typeof patch.defaultRiotId === "string") {
    cfg.defaultRiotId = patch.defaultRiotId.trim();
  }

  if (typeof patch.riotPlatform === "string" && patch.riotPlatform.trim()) {
    cfg.riotPlatform = patch.riotPlatform.toLowerCase().trim();
    cfg.riotRegional = inferRegionalRouting(cfg.riotPlatform);
  }

  if (typeof patch.agyBin === "string" && patch.agyBin.trim()) {
    cfg.agyBin = patch.agyBin.trim();
  }

  if (patch.agyMode === "arg" || patch.agyMode === "stdin") {
    cfg.agyMode = patch.agyMode;
  }

  if (typeof patch.agyTimeoutSec === "number" && Number.isFinite(patch.agyTimeoutSec)) {
    const clamped = Math.max(15, Math.min(300, Math.round(patch.agyTimeoutSec)));
    cfg.agyTimeoutMs = clamped * 1000;
  }

  if (
    typeof patch.livePollIntervalSec === "number" &&
    Number.isFinite(patch.livePollIntervalSec)
  ) {
    // Nunca menor que 10s para não floodar a porta 2999
    const clamped = Math.max(
      10,
      Math.min(60, Math.round(patch.livePollIntervalSec))
    );
    cfg.livePollIntervalMs = clamped * 1000;
  }

  if (
    typeof patch.liveCoachCooldownSec === "number" &&
    Number.isFinite(patch.liveCoachCooldownSec)
  ) {
    const clamped = Math.max(
      15,
      Math.min(300, Math.round(patch.liveCoachCooldownSec))
    );
    cfg.liveCoachCooldownMs = clamped * 1000;
  }

  const persisted: PersistedSettings = {
    riotApiKey: cfg.riotApiKey,
    defaultRiotId: cfg.defaultRiotId,
    riotPlatform: cfg.riotPlatform,
    riotRegional: cfg.riotRegional,
    agyBin: cfg.agyBin,
    agyMode: cfg.agyMode,
    agyTimeoutMs: cfg.agyTimeoutMs,
    liveClientUrl: cfg.liveClientUrl,
    livePollIntervalMs: cfg.livePollIntervalMs,
    liveCoachCooldownMs: cfg.liveCoachCooldownMs,
  };

  writeFileSync(cfg.paths.settings, JSON.stringify(persisted, null, 2), "utf8");
  return getPublicSettings(cfg);
}
