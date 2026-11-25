import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config, hasConfiguredRiotKey } from "../config";
import type {
  MatchSummaryItem,
  QueueFilter,
  RiotAccount,
  RiotMatchDto,
  RiotParticipant,
  RiotTimelineDto,
} from "../types";
import {
  getChampionIconUrl,
  getDDragonCatalog,
  getItemIconUrl,
  getItemName,
} from "./ddragon";

export class RiotApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code:
      | "RIOT_KEY_MISSING"
      | "RIOT_AUTH_ERROR"
      | "RIOT_NOT_FOUND"
      | "RIOT_RATE_LIMIT"
      | "RIOT_BAD_REQUEST"
      | "RIOT_NETWORK_ERROR"
  ) {
    super(message);
    this.name = "RiotApiError";
  }
}

export function parseRiotId(input: string): { gameName: string; tagLine: string } {
  const cleaned = input.trim();
  const hashIdx = cleaned.lastIndexOf("#");
  if (hashIdx <= 0 || hashIdx === cleaned.length - 1) {
    throw new RiotApiError(
      'Formato de Riot ID inválido. Use "Nome#TAG" (ex: Faker#BR1).',
      400,
      "RIOT_BAD_REQUEST"
    );
  }
  const gameName = cleaned.slice(0, hashIdx).trim();
  const tagLine = cleaned.slice(hashIdx + 1).trim();
  if (!gameName || !tagLine) {
    throw new RiotApiError(
      'Formato de Riot ID inválido. Use "Nome#TAG" (ex: Faker#BR1).',
      400,
      "RIOT_BAD_REQUEST"
    );
  }
  return { gameName, tagLine };
}

export function getQueueInfo(queueId: number): {
  name: string;
  category: Exclude<QueueFilter, "all">;
} {
  switch (queueId) {
    case 420:
      return { name: "Ranked Solo/Duo", category: "soloq" };
    case 440:
      return { name: "Ranked Flex", category: "flex" };
    case 400:
      return { name: "Normal Draft", category: "normal" };
    case 430:
      return { name: "Normal Blind", category: "normal" };
    case 490:
      return { name: "Jogo Rápido", category: "normal" };
    case 450:
      return { name: "ARAM", category: "normal" };
    case 700:
      return { name: "Clash", category: "flex" };
    default:
      return { name: `Fila #${queueId}`, category: "normal" };
  }
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function normalizeRole(pos?: string): string {
  switch ((pos ?? "").toUpperCase()) {
    case "TOP":
      return "TOP";
    case "JUNGLE":
      return "JUNGLE";
    case "MIDDLE":
      return "MID";
    case "BOTTOM":
      return "ADC";
    case "UTILITY":
      return "SUP";
    default:
      return pos || "FLEX";
  }
}

async function riotFetch<T>(url: string): Promise<T> {
  if (!hasConfiguredRiotKey()) {
    throw new RiotApiError(
      "RIOT_API_KEY não configurada no arquivo .env. Configure sua chave de desenvolvedor ou ative o Modo Demo (Mock).",
      401,
      "RIOT_KEY_MISSING"
    );
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "X-Riot-Token": config.riotApiKey,
      },
    });
  } catch (err) {
    throw new RiotApiError(
      `Falha de rede ao conectar na Riot API: ${(err as Error).message}`,
      502,
      "RIOT_NETWORK_ERROR"
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new RiotApiError(
      "Riot API Key inválida ou expirada (chaves Developer expiram a cada 24h). Renove no portal da Riot ou ative o Modo Demo (Mock).",
      res.status,
      "RIOT_AUTH_ERROR"
    );
  }
  if (res.status === 404) {
    throw new RiotApiError(
      "Conta ou partida não encontrada na Riot API (verifique Nome#TAG e região BR1/americas).",
      404,
      "RIOT_NOT_FOUND"
    );
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After") ?? "alguns";
    throw new RiotApiError(
      `Rate limit da Riot API atingido. Aguarde ${retryAfter}s e tente novamente.`,
      429,
      "RIOT_RATE_LIMIT"
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new RiotApiError(
      `Erro HTTP ${res.status} na Riot API: ${body.slice(0, 180)}`,
      res.status,
      "RIOT_NETWORK_ERROR"
    );
  }

  return (await res.json()) as T;
}

export async function getAccountByRiotId(riotId: string): Promise<RiotAccount> {
  const { gameName, tagLine } = parseRiotId(riotId);
  const slug = `${gameName}_${tagLine}`
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .toLowerCase();
  const cacheFile = resolve(config.paths.cache, `account_${slug}.json`);

  if (existsSync(cacheFile)) {
    try {
      const cached = (await Bun.file(cacheFile).json()) as {
        savedAt: number;
        data: RiotAccount;
      };
      if (Date.now() - cached.savedAt < 24 * 60 * 60 * 1000) {
        return cached.data;
      }
    } catch {
      // Ignora cache corrompido
    }
  }

  const url = `https://${config.riotRegional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    gameName
  )}/${encodeURIComponent(tagLine)}`;
  const account = await riotFetch<RiotAccount>(url);
  await Bun.write(
    cacheFile,
    JSON.stringify({ savedAt: Date.now(), data: account }, null, 2)
  );
  return account;
}

export async function getRecentMatchIds(
  puuid: string,
  count = 10,
  queueFilter: QueueFilter = "all"
): Promise<string[]> {
  const params = new URLSearchParams({
    start: "0",
    count: String(Math.min(Math.max(count, 1), 20)),
  });

  if (queueFilter === "soloq") params.set("queue", "420");
  else if (queueFilter === "flex") params.set("queue", "440");

  const url = `https://${config.riotRegional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(
    puuid
  )}/ids?${params.toString()}`;
  return riotFetch<string[]>(url);
}

export async function getMatchById(matchId: string): Promise<RiotMatchDto> {
  const safeId = matchId.replace(/[^a-zA-Z0-9_-]/g, "");
  const cacheFile = resolve(config.paths.cache, `match_${safeId}.json`);

  if (existsSync(cacheFile)) {
    try {
      return (await Bun.file(cacheFile).json()) as RiotMatchDto;
    } catch {
      // Refaz fetch se corrompido
    }
  }

  const url = `https://${config.riotRegional}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(
    matchId
  )}`;
  const match = await riotFetch<RiotMatchDto>(url);
  await Bun.write(cacheFile, JSON.stringify(match));
  return match;
}

export async function getMatchTimeline(matchId: string): Promise<RiotTimelineDto> {
  const safeId = matchId.replace(/[^a-zA-Z0-9_-]/g, "");
  const cacheFile = resolve(config.paths.cache, `timeline_${safeId}.json`);

  if (existsSync(cacheFile)) {
    try {
      return (await Bun.file(cacheFile).json()) as RiotTimelineDto;
    } catch {
      // Refaz fetch se corrompido
    }
  }

  const url = `https://${config.riotRegional}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(
    matchId
  )}/timeline`;
  const timeline = await riotFetch<RiotTimelineDto>(url);
  await Bun.write(cacheFile, JSON.stringify(timeline));
  return timeline;
}

export function findLaneOpponent(
  match: RiotMatchDto,
  player: RiotParticipant
): RiotParticipant | null {
  const enemies = match.info.participants.filter(
    (p) => p.teamId !== player.teamId
  );
  if (player.teamPosition) {
    const direct = enemies.find((e) => e.teamPosition === player.teamPosition);
    if (direct) return direct;
  }
  return enemies[0] ?? null;
}

export async function buildMatchSummary(
  match: RiotMatchDto,
  puuid: string
): Promise<MatchSummaryItem | null> {
  const player = match.info.participants.find((p) => p.puuid === puuid);
  if (!player) return null;

  const catalog = await getDDragonCatalog();
  const queueInfo = getQueueInfo(match.info.queueId);
  const opponent = findLaneOpponent(match, player);
  const cs = player.totalMinionsKilled + player.neutralMinionsKilled;
  const durationMin = Math.max(match.info.gameDuration / 60, 1);

  const rawItemIds = [
    player.item0,
    player.item1,
    player.item2,
    player.item3,
    player.item4,
    player.item5,
  ].filter((id) => id > 0);

  const patchParts = (match.info.gameVersion || "").split(".");
  const patch =
    patchParts.length >= 2 ? `${patchParts[0]}.${patchParts[1]}` : catalog.version;

  return {
    matchId: match.metadata.matchId,
    queueId: match.info.queueId,
    queueName: queueInfo.name,
    queueCategory: queueInfo.category,
    gameCreation: match.info.gameCreation,
    durationSec: match.info.gameDuration,
    durationLabel: formatDuration(match.info.gameDuration),
    patch,
    win: player.win,
    champion: player.championName,
    championIconUrl: getChampionIconUrl(catalog.version, player.championName),
    role: normalizeRole(player.teamPosition),
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    cs,
    csPerMin: Number((cs / durationMin).toFixed(1)),
    goldEarned: player.goldEarned,
    opponentChampion: opponent?.championName ?? null,
    items: rawItemIds.map((id) => ({
      id,
      name: getItemName(catalog, id),
      iconUrl: getItemIconUrl(catalog.version, id),
    })),
  };
}
