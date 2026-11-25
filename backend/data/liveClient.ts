import { config } from "../config";
import type {
  LiveClientTestResult,
  LiveEventInfo,
  LiveGameState,
  LiveItemInfo,
  LivePlayerState,
} from "../types";
import { formatDuration, normalizeRole } from "./riotApi";

interface LiveAllGameDataRaw {
  activePlayer?: {
    summonerName?: string;
    riotId?: string;
    level?: number;
    currentGold?: number;
  };
  allPlayers?: Array<{
    summonerName?: string;
    riotId?: string;
    championName?: string;
    team?: string;
    position?: string;
    level?: number;
    isDead?: boolean;
    scores?: {
      kills?: number;
      deaths?: number;
      assists?: number;
      creepScore?: number;
      wardScore?: number;
    };
    items?: Array<{
      itemID?: number;
      displayName?: string;
      price?: number;
      consumable?: boolean;
    }>;
  }>;
  events?: {
    Events?: Array<{
      EventID?: number;
      EventName?: string;
      EventTime?: number;
      KillerName?: string;
      VictimName?: string;
      DragonType?: string;
    }>;
  };
  gameData?: {
    gameMode?: string;
    gameTime?: number;
  };
}

function mapLiveItems(
  items?: Array<{
    itemID?: number;
    displayName?: string;
    price?: number;
    consumable?: boolean;
  }>
): LiveItemInfo[] {
  return (items ?? [])
    .filter((i) => (i.itemID ?? 0) > 0)
    .map((i) => ({
      itemID: i.itemID ?? 0,
      displayName: i.displayName ?? `Item #${i.itemID}`,
      price: i.price ?? 0,
      consumable: Boolean(i.consumable),
    }));
}

export function normalizeLiveGameState(data: LiveAllGameDataRaw): LiveGameState {
  const activeName =
    data.activePlayer?.riotId ||
    data.activePlayer?.summonerName ||
    "Jogador Ativo";

  const players: LivePlayerState[] = (data.allPlayers ?? []).map((p) => ({
    riotId: p.riotId || p.summonerName || "Desconhecido",
    championName: p.championName || "Desconhecido",
    team: p.team || "ORDER",
    position: normalizeRole(p.position),
    level: p.level ?? 1,
    isDead: Boolean(p.isDead),
    kills: p.scores?.kills ?? 0,
    deaths: p.scores?.deaths ?? 0,
    assists: p.scores?.assists ?? 0,
    creepScore: p.scores?.creepScore ?? 0,
    wardScore: p.scores?.wardScore ?? 0,
    items: mapLiveItems(p.items),
  }));

  const activeEntry =
    players.find((p) => p.riotId === activeName) ??
    players.find((p) =>
      p.riotId.toLowerCase().startsWith(activeName.toLowerCase().split("#")[0] || "")
    ) ??
    players[0];

  const enemies = players.filter((p) =>
    activeEntry ? p.team !== activeEntry.team : false
  );
  const laneOpponent =
    (activeEntry?.position
      ? enemies.find((e) => e.position === activeEntry.position)
      : null) ??
    enemies[0] ??
    null;

  const gameTimeSec = Math.floor(data.gameData?.gameTime ?? 0);

  const recentEvents: LiveEventInfo[] = (data.events?.Events ?? [])
    .slice(-15)
    .map((e) => ({
      eventId: e.EventID ?? 0,
      eventName: e.EventName ?? "Unknown",
      eventTime: Math.floor(e.EventTime ?? 0),
      killerName: e.KillerName,
      victimName: e.VictimName,
      dragonType: e.DragonType,
    }));

  return {
    gameMode: data.gameData?.gameMode ?? "CLASSIC",
    gameTimeSec,
    gameTimeLabel: formatDuration(gameTimeSec),
    activePlayer: {
      riotId: activeName,
      championName: activeEntry?.championName ?? "Desconhecido",
      position: activeEntry?.position ?? "FLEX",
      level: data.activePlayer?.level ?? activeEntry?.level ?? 1,
      currentGold: Math.floor(data.activePlayer?.currentGold ?? 0),
      isDead: activeEntry?.isDead ?? false,
      kills: activeEntry?.kills ?? 0,
      deaths: activeEntry?.deaths ?? 0,
      assists: activeEntry?.assists ?? 0,
      creepScore: activeEntry?.creepScore ?? 0,
      items: activeEntry?.items ?? [],
    },
    laneOpponent,
    allPlayersCount: players.length,
    recentEvents,
  };
}

/**
 * NÍVEL 2 (Camada de Dados): Live Client Data API — estritamente Read-Only.
 * Sem leitura de memória RAM, sem input de teclado/mouse.
 * Ignora certificado autoassinado apenas nesta requisição local em 127.0.0.1:2999.
 */
export async function fetchLiveClientSnapshot(
  includeRaw = true
): Promise<LiveClientTestResult> {
  const checkedAt = new Date().toISOString();
  const url = `${config.liveClientUrl}/liveclientdata/allgamedata`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      tls: {
        rejectUnauthorized: false,
      },
    } as RequestInit);

    if (!res.ok) {
      return {
        status: "WAITING_FOR_MATCH",
        message: `Aguardando Partida (Live Client respondeu HTTP ${res.status}).`,
        checkedAt,
      };
    }

    const data = (await res.json()) as LiveAllGameDataRaw;
    const state = normalizeLiveGameState(data);

    return {
      status: "IN_GAME",
      message: "Partida ativa detectada no cliente local do League of Legends.",
      checkedAt,
      summary: {
        gameMode: state.gameMode,
        gameTimeSec: state.gameTimeSec,
        gameTimeLabel: state.gameTimeLabel,
        activePlayerName: state.activePlayer.riotId,
        activeChampion: state.activePlayer.championName,
        level: state.activePlayer.level,
        currentGold: state.activePlayer.currentGold,
        playerCount: state.allPlayersCount,
        eventCount: data.events?.Events?.length ?? 0,
      },
      state,
      raw: includeRaw ? data : undefined,
    };
  } catch {
    return {
      status: "WAITING_FOR_MATCH",
      message:
        "Aguardando Partida — Cliente do League of Legends fechado ou fora de jogo (127.0.0.1:2999 indisponível).",
      checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
