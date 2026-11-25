import { config } from "../config";
import {
  extractPatchFromGameVersion,
  getDDragonCatalog,
} from "../data/ddragon";
import {
  loadMockAutopsy,
  loadMockMatch,
  loadMockTimeline,
  MOCK_ACCOUNT,
} from "../data/mockRepository";
import {
  buildMatchSummary,
  getAccountByRiotId,
  getMatchById,
  getMatchTimeline,
  getRecentMatchIds,
  RiotApiError,
} from "../data/riotApi";
import { condenseMatchTimeline } from "../domain/timelineParser";
import type {
  CondensedMatchTelemetry,
  MatchSummaryItem,
  PostGameAutopsy,
  QueueFilter,
} from "../types";
import { agyClient } from "./agyClient";
import { buildPostGameAutopsyPrompt, parseAutopsyResponse } from "./prompts";

export interface PostGameAnalysisInput {
  riotId?: string;
  matchId?: string;
  queue?: QueueFilter;
  mockData?: boolean;
  mockAgy?: boolean;
}

export interface PostGameAnalysisOutput {
  matchSummary: MatchSummaryItem | null;
  telemetry: CondensedMatchTelemetry;
  autopsy: PostGameAutopsy;
  meta: {
    promptBytes: number;
    agyDurationMs: number;
    agyMode: string;
    usedMockData: boolean;
    usedMockAgy: boolean;
  };
}

/**
 * Camada de IA — Caso de Uso da Lente 1 (Autópsia Pós-Jogo).
 * Consome dados da Camada de Dados, condensa na Camada de Domínio e
 * invoca o motor cognitivo local (`agyClient`).
 */
export async function runPostGameAutopsy(
  input: PostGameAnalysisInput
): Promise<PostGameAnalysisOutput> {
  const useMockData = Boolean(input.mockData);
  const useMockAgy = Boolean(input.mockAgy);
  const queue: QueueFilter = input.queue ?? "all";

  let puuid: string;
  let match;
  let timeline;

  if (useMockData) {
    puuid = MOCK_ACCOUNT.puuid;
    [match, timeline] = await Promise.all([loadMockMatch(), loadMockTimeline()]);
  } else {
    const riotId = (input.riotId ?? "").trim();
    if (!riotId) {
      throw new RiotApiError(
        'Informe um Riot ID no formato "Nome#TAG" (ex: Faker#BR1).',
        400,
        "RIOT_BAD_REQUEST"
      );
    }

    const account = await getAccountByRiotId(riotId);
    puuid = account.puuid;

    let targetMatchId = (input.matchId ?? "").trim();
    if (!targetMatchId) {
      const ids = await getRecentMatchIds(puuid, 1, queue);
      if (ids.length === 0) {
        throw new RiotApiError(
          "Nenhuma partida recente encontrada para esta conta e filtro de fila.",
          404,
          "RIOT_NOT_FOUND"
        );
      }
      targetMatchId = ids[0]!;
    }

    [match, timeline] = await Promise.all([
      getMatchById(targetMatchId),
      getMatchTimeline(targetMatchId),
    ]);
  }

  const patchVersion = extractPatchFromGameVersion(match.info.gameVersion);
  const catalog = await getDDragonCatalog(patchVersion);
  const matchSummary = await buildMatchSummary(match, puuid);
  const telemetry = condenseMatchTimeline(match, timeline, puuid, catalog);
  const prompt = buildPostGameAutopsyPrompt(telemetry);
  const promptBytes = Buffer.byteLength(prompt, "utf8");

  if (useMockAgy) {
    await Bun.write(config.paths.lastPrompt, prompt);
    const mockAutopsy = await loadMockAutopsy();
    await Bun.write(
      config.paths.lastResponse,
      `# MOCK AGY RESPONSE\n${JSON.stringify(mockAutopsy, null, 2)}`
    );
    return {
      matchSummary,
      telemetry,
      autopsy: mockAutopsy,
      meta: {
        promptBytes,
        agyDurationMs: 120,
        agyMode: "mock",
        usedMockData: useMockData,
        usedMockAgy: true,
      },
    };
  }

  const agyResult = await agyClient.enqueue(prompt);
  const autopsy = parseAutopsyResponse(agyResult.stdout);

  return {
    matchSummary,
    telemetry,
    autopsy,
    meta: {
      promptBytes: agyResult.promptBytes,
      agyDurationMs: agyResult.durationMs,
      agyMode: agyResult.mode,
      usedMockData: useMockData,
      usedMockAgy: false,
    },
  };
}
