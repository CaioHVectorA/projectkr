// ============================================================================
// Tipos da Riot API (Account-v1, Match-v5, Timeline-v5)
// ============================================================================

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface RiotParticipant {
  puuid: string;
  participantId: number;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerName?: string;
  teamId: number;
  teamPosition: string;
  individualPosition?: string;
  championName: string;
  championId: number;
  champLevel: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  detectorWardsPlaced?: number;
  visionWardsBoughtInGame?: number;
  summoner1Id: number;
  summoner2Id: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  perks?: {
    styles?: Array<{
      description: string;
      style: number;
      selections: Array<{ perk: number }>;
    }>;
  };
}

export interface RiotMatchDto {
  metadata: {
    dataVersion: string;
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp?: number;
    gameMode: string;
    gameVersion: string;
    queueId: number;
    participants: RiotParticipant[];
  };
}

export interface TimelineParticipantFrame {
  participantId: number;
  totalGold: number;
  currentGold: number;
  xp: number;
  level: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  position?: { x: number; y: number };
}

export interface TimelineEvent {
  type: string;
  timestamp: number;
  participantId?: number;
  killerId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
  itemId?: number;
  wardType?: string;
  creatorId?: number;
  monsterType?: string;
  monsterSubType?: string;
  buildingType?: string;
  laneType?: string;
  towerType?: string;
  teamId?: number;
  killerTeamId?: number;
  position?: { x: number; y: number };
  bounty?: number;
  shutdownBounty?: number;
}

export interface TimelineFrame {
  timestamp: number;
  participantFrames: Record<string, TimelineParticipantFrame>;
  events: TimelineEvent[];
}

export interface RiotTimelineDto {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    frameInterval: number;
    frames: TimelineFrame[];
  };
}

// ============================================================================
// Resumo de Histórico (Lente 1 - lista das últimas 10 partidas)
// ============================================================================

export type QueueFilter = "all" | "soloq" | "flex" | "normal";

export interface MatchSummaryItem {
  matchId: string;
  queueId: number;
  queueName: string;
  queueCategory: Exclude<QueueFilter, "all">;
  gameCreation: number;
  durationSec: number;
  durationLabel: string;
  patch: string;
  win: boolean;
  champion: string;
  championIconUrl: string;
  role: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  csPerMin: number;
  goldEarned: number;
  opponentChampion: string | null;
  items: Array<{ id: number; name: string; iconUrl: string }>;
}

// ============================================================================
// Telemetria Condensada (Payload Determinístico < 6KB enviado ao AGY)
// ============================================================================

export interface CondensedDeathEvent {
  t: string; // MM:SS
  killer: string;
  assists: number;
  unspentGold: number;
  zone: string;
  nearbyObjective: string | null;
  xpLossNote: string | null;
}

export interface CondensedObjectiveEvent {
  t: string;
  obj: string;
  by: "ALIADO" | "INIMIGO";
  playerAlive: boolean;
  playerInvolved: boolean;
}

export interface CondensedItemSpike {
  t: string;
  item: string;
}

export interface CondensedMatchTelemetry {
  matchId: string;
  patch: string;
  queue: string;
  duration: string;
  result: "VITORIA" | "DERROTA";
  player: {
    riotId: string;
    champ: string;
    role: string;
    kda: string;
    cs: number;
    csMin: number;
    gold: number;
    dmg: number;
    vision: number;
    wardsPlaced: number;
    pinkWards: number;
    spells: string[];
    keystone: string;
    finalItems: string[];
  };
  laneOpponent: {
    champ: string;
    kda: string;
    cs: number;
    gold: number;
    finalItems: string[];
  } | null;
  lanePhase0to15: {
    csAt10: number;
    csAt15: number;
    goldDiffAt10: number | null;
    goldDiffAt15: number | null;
    xpDiffAt10: number | null;
    xpDiffAt15: number | null;
    lvlAt15: number;
    oppLvlAt15: number | null;
    kills0to15: number;
    deaths0to15: number;
    assists0to15: number;
    wards0to15: number;
  };
  midGame15to25: {
    kills15to25: number;
    deaths15to25: number;
    assists15to25: number;
    goldDiffAt20: number | null;
    goldDiffAt25: number | null;
    objParticipations: number;
    totalObjectives15to25: number;
  };
  itemSpikes: CondensedItemSpike[];
  deaths: CondensedDeathEvent[];
  objectives: CondensedObjectiveEvent[];
  towersLostAfterPlayerDeath: Array<{
    deathAt: string;
    towerAt: string;
    lane: string;
  }>;
}

// ============================================================================
// Resposta Estruturada da Lente 1 (Autópsia Pós-Jogo)
// ============================================================================

export interface AutopsySection {
  nota: number; // 0 a 10
  resumo: string;
  metricas_chave: string[];
  analise: string;
}

export interface InflectionPointSection {
  timestamp: string;
  titulo: string;
  custo_estimado: string;
  analise: string;
}

export interface PrescriptionStep {
  prioridade: number;
  foco: string;
  acao_pratica: string;
}

export interface PostGameAutopsy {
  veredito_geral: string;
  fase_de_rotas: AutopsySection;
  transicao_macro: AutopsySection;
  ponto_de_inflexao: InflectionPointSection;
  prescricao: PrescriptionStep[];
  rawFallback?: string;
  parseMode: "json" | "fallback";
}

// ============================================================================
// NÍVEL 2: Live Client Data API & LENTE 2: Live Coach
// ============================================================================

export interface LiveItemInfo {
  itemID: number;
  displayName: string;
  price: number;
  consumable: boolean;
}

export interface LivePlayerState {
  riotId: string;
  championName: string;
  team: "ORDER" | "CHAOS" | string;
  position: string;
  level: number;
  isDead: boolean;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  wardScore: number;
  items: LiveItemInfo[];
}

export interface LiveEventInfo {
  eventId: number;
  eventName: string;
  eventTime: number;
  killerName?: string;
  victimName?: string;
  dragonType?: string;
}

export interface LiveGameState {
  gameMode: string;
  gameTimeSec: number;
  gameTimeLabel: string;
  activePlayer: {
    riotId: string;
    championName: string;
    position: string;
    level: number;
    currentGold: number;
    isDead: boolean;
    kills: number;
    deaths: number;
    assists: number;
    creepScore: number;
    items: LiveItemInfo[];
  };
  laneOpponent: LivePlayerState | null;
  allPlayersCount: number;
  recentEvents: LiveEventInfo[];
}

export interface LiveClientTestResult {
  status: "IN_GAME" | "WAITING_FOR_MATCH";
  message: string;
  checkedAt: string;
  summary?: {
    gameMode: string;
    gameTimeSec: number;
    gameTimeLabel: string;
    activePlayerName: string;
    activeChampion: string;
    level: number;
    currentGold: number;
    playerCount: number;
    eventCount: number;
  };
  state?: LiveGameState;
  raw?: unknown;
}

export type LiveDeltaKind =
  | "FLOATING_GOLD"
  | "OPPONENT_ITEM_SPIKE"
  | "CS_DEFICIT"
  | "LEVEL_DISADVANTAGE"
  | "RECENT_DEATHS"
  | "OBJECTIVE_EVENT";

export type LiveSeverity = "CRITICO" | "ATENCAO" | "OPORTUNIDADE";

export interface LiveDeltaTrigger {
  kind: LiveDeltaKind;
  severity: LiveSeverity;
  headline: string;
  details: string;
  fingerprint: string;
}

export interface LiveCoachAdvice {
  id: string;
  createdAt: string;
  gameTimeLabel: string;
  severity: LiveSeverity;
  triggerKind: LiveDeltaKind;
  triggerHeadline: string;
  lines: [string] | [string, string]; // UX estrita: máximo de 2 linhas
  source: "agy" | "mock";
  durationMs: number;
}

export interface LiveCoachStatus {
  running: boolean;
  muted: boolean;
  connectionStatus: "IN_GAME" | "WAITING_FOR_MATCH" | "STOPPED";
  statusMessage: string;
  pollIntervalMs: number;
  cooldownMs: number;
  cooldownRemainingSec: number;
  lastPolledAt: string | null;
  analyzingNow: boolean;
  activeSummary: LiveClientTestResult["summary"] | null;
  latestAdvice: LiveCoachAdvice | null;
  history: LiveCoachAdvice[];
  lastError: string | null;
}
