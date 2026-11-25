import { existsSync } from "node:fs";
import { resolve } from "node:path";
import embeddedMockAutopsy from "../../data/mock/analysis_mock_response.json";
import embeddedMockMatch from "../../data/mock/match_BR1_MOCK_001.json";
import embeddedMockTimeline from "../../data/mock/timeline_BR1_MOCK_001.json";
import { config } from "../config";
import type {
  LiveGameState,
  PostGameAutopsy,
  RiotAccount,
  RiotMatchDto,
  RiotTimelineDto,
} from "../types";

export const MOCK_ACCOUNT: RiotAccount = {
  puuid: "mock-puuid-br1-projeto-loot-001",
  gameName: "FakerDemo",
  tagLine: "BR1",
};

export const MOCK_MATCH_ID = "BR1_MOCK_001";

export async function loadMockMatch(): Promise<RiotMatchDto> {
  const path = resolve(config.paths.mock, "match_BR1_MOCK_001.json");
  if (existsSync(path)) {
    return (await Bun.file(path).json()) as RiotMatchDto;
  }
  return embeddedMockMatch as unknown as RiotMatchDto;
}

export async function loadMockTimeline(): Promise<RiotTimelineDto> {
  const path = resolve(config.paths.mock, "timeline_BR1_MOCK_001.json");
  if (existsSync(path)) {
    return (await Bun.file(path).json()) as RiotTimelineDto;
  }
  return embeddedMockTimeline as unknown as RiotTimelineDto;
}

export async function loadMockAutopsy(): Promise<PostGameAutopsy> {
  const path = resolve(config.paths.mock, "analysis_mock_response.json");
  if (existsSync(path)) {
    return (await Bun.file(path).json()) as PostGameAutopsy;
  }
  return embeddedMockAutopsy as unknown as PostGameAutopsy;
}

/**
 * Cenários realistas para testar o Live Coach (Lente 2) mesmo sem o LoL aberto.
 */
export function buildSimulatedLiveStates(scenarioIndex = 0): {
  previous: LiveGameState;
  current: LiveGameState;
} {
  const scenarios: Array<{ previous: LiveGameState; current: LiveGameState }> = [
    {
      previous: {
        gameMode: "CLASSIC",
        gameTimeSec: 810,
        gameTimeLabel: "13:30",
        activePlayer: {
          riotId: "FakerDemo#BR1",
          championName: "Orianna",
          position: "MID",
          level: 10,
          currentGold: 1120,
          isDead: false,
          kills: 1,
          deaths: 1,
          assists: 2,
          creepScore: 102,
          items: [
            { itemID: 1056, displayName: "Anel de Doran", price: 400, consumable: false },
            { itemID: 3802, displayName: "Capítulo Perdido", price: 1200, consumable: false },
          ],
        },
        laneOpponent: {
          riotId: "AhriCharm#BR1",
          championName: "Ahri",
          team: "CHAOS",
          position: "MID",
          level: 10,
          isDead: false,
          kills: 2,
          deaths: 1,
          assists: 1,
          creepScore: 110,
          wardScore: 8,
          items: [
            { itemID: 3802, displayName: "Capítulo Perdido", price: 1200, consumable: false },
          ],
        },
        allPlayersCount: 10,
        recentEvents: [],
      },
      current: {
        gameMode: "CLASSIC",
        gameTimeSec: 840,
        gameTimeLabel: "14:00",
        activePlayer: {
          riotId: "FakerDemo#BR1",
          championName: "Orianna",
          position: "MID",
          level: 10,
          currentGold: 1620,
          isDead: false,
          kills: 1,
          deaths: 1,
          assists: 2,
          creepScore: 108,
          items: [
            { itemID: 1056, displayName: "Anel de Doran", price: 400, consumable: false },
            { itemID: 3802, displayName: "Capítulo Perdido", price: 1200, consumable: false },
          ],
        },
        laneOpponent: {
          riotId: "AhriCharm#BR1",
          championName: "Ahri",
          team: "CHAOS",
          position: "MID",
          level: 10,
          isDead: false,
          kills: 2,
          deaths: 1,
          assists: 1,
          creepScore: 114,
          wardScore: 9,
          items: [
            { itemID: 6655, displayName: "Companheiro de Luden", price: 2850, consumable: false },
          ],
        },
        allPlayersCount: 10,
        recentEvents: [],
      },
    },
    {
      previous: {
        gameMode: "CLASSIC",
        gameTimeSec: 1060,
        gameTimeLabel: "17:40",
        activePlayer: {
          riotId: "FakerDemo#BR1",
          championName: "Orianna",
          position: "MID",
          level: 11,
          currentGold: 1180,
          isDead: false,
          kills: 2,
          deaths: 2,
          assists: 2,
          creepScore: 122,
          items: [
            { itemID: 6655, displayName: "Companheiro de Luden", price: 2850, consumable: false },
          ],
        },
        laneOpponent: {
          riotId: "AhriCharm#BR1",
          championName: "Ahri",
          team: "CHAOS",
          position: "MID",
          level: 12,
          isDead: false,
          kills: 4,
          deaths: 1,
          assists: 3,
          creepScore: 158,
          wardScore: 14,
          items: [
            { itemID: 6655, displayName: "Companheiro de Luden", price: 2850, consumable: false },
          ],
        },
        allPlayersCount: 10,
        recentEvents: [],
      },
      current: {
        gameMode: "CLASSIC",
        gameTimeSec: 1095,
        gameTimeLabel: "18:15",
        activePlayer: {
          riotId: "FakerDemo#BR1",
          championName: "Orianna",
          position: "MID",
          level: 11,
          currentGold: 1540,
          isDead: false,
          kills: 2,
          deaths: 2,
          assists: 2,
          creepScore: 126,
          items: [
            { itemID: 6655, displayName: "Companheiro de Luden", price: 2850, consumable: false },
          ],
        },
        laneOpponent: {
          riotId: "AhriCharm#BR1",
          championName: "Ahri",
          team: "CHAOS",
          position: "MID",
          level: 12,
          isDead: false,
          kills: 4,
          deaths: 1,
          assists: 3,
          creepScore: 168,
          wardScore: 15,
          items: [
            { itemID: 6655, displayName: "Companheiro de Luden", price: 2850, consumable: false },
          ],
        },
        allPlayersCount: 10,
        recentEvents: [],
      },
    },
  ];

  return scenarios[Math.abs(scenarioIndex) % scenarios.length]!;
}
