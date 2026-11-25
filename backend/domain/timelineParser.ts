import {
  getItemName,
  getRuneName,
  getSpellName,
  isCompletedItem,
  type DDragonCatalog,
} from "../data/ddragon";
import {
  findLaneOpponent,
  formatDuration,
  getQueueInfo,
  normalizeRole,
} from "../data/riotApi";
import type {
  CondensedDeathEvent,
  CondensedItemSpike,
  CondensedMatchTelemetry,
  CondensedObjectiveEvent,
  RiotMatchDto,
  RiotTimelineDto,
  TimelineFrame,
} from "../types";

function msToClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function classifyMapZone(pos?: { x: number; y: number }): string {
  if (!pos) return "Mapa";
  const { x, y } = pos;
  if (x < 3000 && y < 3000) return "Base Azul";
  if (x > 11800 && y > 11800) return "Base Vermelha";
  if (x >= 4200 && x <= 5600 && y >= 9400 && y <= 11200) return "Pit Barão/Grubs";
  if (x >= 9000 && x <= 10600 && y >= 3600 && y <= 5200) return "Pit Dragão";
  if (y - x > 3200) return "Top-side";
  if (x - y > 3200) return "Bot-side";
  if (Math.abs(x - y) <= 2200) return "Mid / Rio Central";
  return y > x ? "Selva Top-side" : "Selva Bot-side";
}

function formatMonsterName(monsterType?: string, subType?: string): string {
  switch (monsterType) {
    case "DRAGON": {
      const map: Record<string, string> = {
        FIRE_DRAGON: "Dragão Infernal",
        WATER_DRAGON: "Dragão do Oceano",
        EARTH_DRAGON: "Dragão da Montanha",
        AIR_DRAGON: "Dragão das Nuvens",
        HEXTECH_DRAGON: "Dragão Hextec",
        CHEMTECH_DRAGON: "Dragão Quimtec",
        ELDER_DRAGON: "Dragão Ancião",
      };
      return (subType && map[subType]) || "Dragão";
    }
    case "BARON_NASHOR":
      return "Barão Na'Shor";
    case "RIFTHERALD":
      return "Arauto do Vale";
    case "HORDE":
      return "Vastilarvas (Grubs)";
    case "ATAKHAN":
      return "Atakhan";
    default:
      return monsterType || "Objetivo Neutro";
  }
}

function formatLaneName(laneType?: string): string {
  switch (laneType) {
    case "TOP_LANE":
      return "Top";
    case "MID_LANE":
      return "Mid";
    case "BOT_LANE":
      return "Bot";
    default:
      return laneType || "Rota";
  }
}

function getFrameAtMinute(
  frames: TimelineFrame[],
  minute: number
): TimelineFrame | null {
  if (frames.length === 0) return null;
  if (minute < frames.length) return frames[minute] ?? null;
  return frames[frames.length - 1] ?? null;
}

export function condenseMatchTimeline(
  match: RiotMatchDto,
  timeline: RiotTimelineDto,
  puuid: string,
  catalog: DDragonCatalog
): CondensedMatchTelemetry {
  const player = match.info.participants.find((p) => p.puuid === puuid);
  if (!player) {
    throw new Error(
      `Jogador (puuid=${puuid}) não encontrado na partida ${match.metadata.matchId}.`
    );
  }

  const opponent = findLaneOpponent(match, player);
  const pId = player.participantId;
  const oppId = opponent?.participantId ?? null;

  const champByParticipantId = new Map<number, string>();
  const teamByParticipantId = new Map<number, number>();
  for (const p of match.info.participants) {
    champByParticipantId.set(p.participantId, p.championName);
    teamByParticipantId.set(p.participantId, p.teamId);
  }

  const frames = timeline.info.frames ?? [];
  const f10 = getFrameAtMinute(frames, 10);
  const f15 = getFrameAtMinute(frames, 15);
  const f20 = getFrameAtMinute(frames, 20);
  const f25 = getFrameAtMinute(frames, 25);

  const pf = (frame: TimelineFrame | null, id: number | null) =>
    frame && id !== null ? frame.participantFrames[String(id)] ?? null : null;

  const p10 = pf(f10, pId);
  const o10 = pf(f10, oppId);
  const p15 = pf(f15, pId);
  const o15 = pf(f15, oppId);
  const p20 = pf(f20, pId);
  const o20 = pf(f20, oppId);
  const p25 = pf(f25, pId);
  const o25 = pf(f25, oppId);

  let kills0to15 = 0;
  let deaths0to15 = 0;
  let assists0to15 = 0;
  let wards0to15 = 0;
  let kills15to25 = 0;
  let deaths15to25 = 0;
  let assists15to25 = 0;
  let objParticipations15to25 = 0;
  let totalObjectives15to25 = 0;

  const rawDeaths: Array<{
    timestamp: number;
    frameIndex: number;
    killer: string;
    assists: number;
    position?: { x: number; y: number };
  }> = [];

  const rawObjectives: Array<{
    timestamp: number;
    obj: string;
    by: "ALIADO" | "INIMIGO";
    killerId: number;
    assists: number[];
  }> = [];

  const rawEnemyTowerKills: Array<{
    timestamp: number;
    lane: string;
  }> = [];

  const itemSpikes: CondensedItemSpike[] = [];
  const seenSpikeItems = new Set<number>();

  frames.forEach((frame, frameIndex) => {
    for (const ev of frame.events ?? []) {
      const ts = ev.timestamp ?? frame.timestamp;

      if (ev.type === "CHAMPION_KILL") {
        const isInLane = ts <= 15 * 60 * 1000;
        const isInMid = ts > 15 * 60 * 1000 && ts <= 25 * 60 * 1000;

        if (ev.killerId === pId) {
          if (isInLane) kills0to15++;
          else if (isInMid) kills15to25++;
        } else if (ev.assistingParticipantIds?.includes(pId)) {
          if (isInLane) assists0to15++;
          else if (isInMid) assists15to25++;
        }

        if (ev.victimId === pId) {
          if (isInLane) deaths0to15++;
          else if (isInMid) deaths15to25++;

          rawDeaths.push({
            timestamp: ts,
            frameIndex,
            killer: champByParticipantId.get(ev.killerId ?? 0) ?? "Torre/Minion",
            assists: ev.assistingParticipantIds?.length ?? 0,
            position: ev.position,
          });
        }
      }

      if (
        ev.type === "WARD_PLACED" &&
        ev.creatorId === pId &&
        ts <= 15 * 60 * 1000
      ) {
        if (ev.wardType !== "UNDEFINED") {
          wards0to15++;
        }
      }

      if (
        ev.type === "ITEM_PURCHASED" &&
        ev.participantId === pId &&
        ev.itemId &&
        isCompletedItem(catalog, ev.itemId) &&
        !seenSpikeItems.has(ev.itemId)
      ) {
        seenSpikeItems.add(ev.itemId);
        itemSpikes.push({
          t: msToClock(ts),
          item: getItemName(catalog, ev.itemId),
        });
      }

      if (ev.type === "ELITE_MONSTER_KILL") {
        const killerTeam =
          ev.killerTeamId ?? teamByParticipantId.get(ev.killerId ?? 0);
        const by: "ALIADO" | "INIMIGO" =
          killerTeam === player.teamId ? "ALIADO" : "INIMIGO";
        const objName = formatMonsterName(ev.monsterType, ev.monsterSubType);

        rawObjectives.push({
          timestamp: ts,
          obj: objName,
          by,
          killerId: ev.killerId ?? 0,
          assists: ev.assistingParticipantIds ?? [],
        });

        if (ts > 15 * 60 * 1000 && ts <= 25 * 60 * 1000) {
          totalObjectives15to25++;
          if (ev.killerId === pId || ev.assistingParticipantIds?.includes(pId)) {
            objParticipations15to25++;
          }
        }
      }

      if (
        ev.type === "BUILDING_KILL" &&
        ev.buildingType === "TOWER_BUILDING" &&
        ev.teamId === player.teamId
      ) {
        rawEnemyTowerKills.push({
          timestamp: ts,
          lane: formatLaneName(ev.laneType),
        });
      }
    }
  });

  const deaths: CondensedDeathEvent[] = rawDeaths.map((d) => {
    const curFrame = frames[d.frameIndex] ?? null;
    const prevFrame = frames[Math.max(0, d.frameIndex - 1)] ?? null;
    const nextFrame = frames[Math.min(frames.length - 1, d.frameIndex + 1)] ?? null;

    const pCur = pf(curFrame, pId);
    const pPrev = pf(prevFrame, pId);
    const pNext = pf(nextFrame, pId);
    const oPrev = pf(prevFrame, oppId);
    const oNext = pf(nextFrame, oppId);

    const unspentGold = pCur?.currentGold ?? 0;

    const objAfter = rawObjectives.find(
      (o) =>
        o.by === "INIMIGO" &&
        o.timestamp >= d.timestamp - 15000 &&
        o.timestamp <= d.timestamp + 75000
    );

    let xpLossNote: string | null = null;
    if (d.timestamp <= 18 * 60 * 1000 && pPrev && pNext && oPrev && oNext) {
      const playerXpGain = pNext.xp - pPrev.xp;
      const oppXpGain = oNext.xp - oPrev.xp;
      const xpSwing = oppXpGain - playerXpGain;
      if (xpSwing >= 450) {
        xpLossNote = `Swing de -${xpSwing} XP vs oponente na janela da morte (~${(
          xpSwing / 300
        ).toFixed(1)} waves)`;
      }
    }

    return {
      t: msToClock(d.timestamp),
      killer: d.killer,
      assists: d.assists,
      unspentGold,
      zone: classifyMapZone(d.position),
      nearbyObjective: objAfter
        ? `${objAfter.obj} cedido aos ${msToClock(objAfter.timestamp)}`
        : null,
      xpLossNote,
    };
  });

  const objectives: CondensedObjectiveEvent[] = rawObjectives.map((o) => {
    const diedJustBefore = rawDeaths.some(
      (d) => o.timestamp >= d.timestamp && o.timestamp - d.timestamp <= 35000
    );
    return {
      t: msToClock(o.timestamp),
      obj: o.obj,
      by: o.by,
      playerAlive: !diedJustBefore,
      playerInvolved: o.killerId === pId || o.assists.includes(pId),
    };
  });

  const towersLostAfterPlayerDeath: CondensedMatchTelemetry["towersLostAfterPlayerDeath"] =
    [];
  for (const d of rawDeaths) {
    const tower = rawEnemyTowerKills.find(
      (tw) => tw.timestamp >= d.timestamp && tw.timestamp - d.timestamp <= 50000
    );
    if (tower) {
      towersLostAfterPlayerDeath.push({
        deathAt: msToClock(d.timestamp),
        towerAt: msToClock(tower.timestamp),
        lane: tower.lane,
      });
    }
  }

  const cs = player.totalMinionsKilled + player.neutralMinionsKilled;
  const durationMin = Math.max(match.info.gameDuration / 60, 1);
  const queueInfo = getQueueInfo(match.info.queueId);
  const patchParts = (match.info.gameVersion || "").split(".");
  const patch =
    patchParts.length >= 2 ? `${patchParts[0]}.${patchParts[1]}` : catalog.version;

  const finalItemIds = [
    player.item0,
    player.item1,
    player.item2,
    player.item3,
    player.item4,
    player.item5,
  ].filter((id) => id > 0);

  const oppItemIds = opponent
    ? [
        opponent.item0,
        opponent.item1,
        opponent.item2,
        opponent.item3,
        opponent.item4,
        opponent.item5,
      ].filter((id) => id > 0)
    : [];

  const keystoneId = player.perks?.styles?.[0]?.selections?.[0]?.perk;
  const riotIdDisplay =
    player.riotIdGameName && player.riotIdTagline
      ? `${player.riotIdGameName}#${player.riotIdTagline}`
      : player.summonerName || "Jogador";

  const telemetry: CondensedMatchTelemetry = {
    matchId: match.metadata.matchId,
    patch,
    queue: queueInfo.name,
    duration: formatDuration(match.info.gameDuration),
    result: player.win ? "VITORIA" : "DERROTA",
    player: {
      riotId: riotIdDisplay,
      champ: player.championName,
      role: normalizeRole(player.teamPosition),
      kda: `${player.kills}/${player.deaths}/${player.assists}`,
      cs,
      csMin: Number((cs / durationMin).toFixed(1)),
      gold: player.goldEarned,
      dmg: player.totalDamageDealtToChampions,
      vision: player.visionScore,
      wardsPlaced: player.wardsPlaced,
      pinkWards:
        player.detectorWardsPlaced ?? player.visionWardsBoughtInGame ?? 0,
      spells: [
        getSpellName(catalog, player.summoner1Id),
        getSpellName(catalog, player.summoner2Id),
      ],
      keystone: getRuneName(catalog, keystoneId),
      finalItems: finalItemIds.map((id) => getItemName(catalog, id)),
    },
    laneOpponent: opponent
      ? {
          champ: opponent.championName,
          kda: `${opponent.kills}/${opponent.deaths}/${opponent.assists}`,
          cs: opponent.totalMinionsKilled + opponent.neutralMinionsKilled,
          gold: opponent.goldEarned,
          finalItems: oppItemIds.map((id) => getItemName(catalog, id)),
        }
      : null,
    lanePhase0to15: {
      csAt10: (p10?.minionsKilled ?? 0) + (p10?.jungleMinionsKilled ?? 0),
      csAt15: (p15?.minionsKilled ?? 0) + (p15?.jungleMinionsKilled ?? 0),
      goldDiffAt10: p10 && o10 ? p10.totalGold - o10.totalGold : null,
      goldDiffAt15: p15 && o15 ? p15.totalGold - o15.totalGold : null,
      xpDiffAt10: p10 && o10 ? p10.xp - o10.xp : null,
      xpDiffAt15: p15 && o15 ? p15.xp - o15.xp : null,
      lvlAt15: p15?.level ?? player.champLevel,
      oppLvlAt15: o15?.level ?? null,
      kills0to15,
      deaths0to15,
      assists0to15,
      wards0to15,
    },
    midGame15to25: {
      kills15to25,
      deaths15to25,
      assists15to25,
      goldDiffAt20: p20 && o20 ? p20.totalGold - o20.totalGold : null,
      goldDiffAt25: p25 && o25 ? p25.totalGold - o25.totalGold : null,
      objParticipations: objParticipations15to25,
      totalObjectives15to25,
    },
    itemSpikes,
    deaths,
    objectives,
    towersLostAfterPlayerDeath,
  };

  return enforcePayloadBudget(telemetry, 3800);
}

export function enforcePayloadBudget(
  telemetry: CondensedMatchTelemetry,
  maxBytes = 3800
): CondensedMatchTelemetry {
  const clone: CondensedMatchTelemetry = structuredClone(telemetry);

  const byteLen = () => Buffer.byteLength(JSON.stringify(clone), "utf8");
  if (byteLen() <= maxBytes) return clone;

  if (clone.deaths.length > 8) {
    clone.deaths = [...clone.deaths]
      .sort((a, b) => {
        const scoreA =
          (a.nearbyObjective ? 5000 : 0) +
          (a.xpLossNote ? 2000 : 0) +
          a.unspentGold;
        const scoreB =
          (b.nearbyObjective ? 5000 : 0) +
          (b.xpLossNote ? 2000 : 0) +
          b.unspentGold;
        return scoreB - scoreA;
      })
      .slice(0, 8);
  }
  if (byteLen() <= maxBytes) return clone;

  if (clone.objectives.length > 8) {
    clone.objectives = clone.objectives.slice(0, 8);
  }
  if (byteLen() <= maxBytes) return clone;

  clone.towersLostAfterPlayerDeath = clone.towersLostAfterPlayerDeath.slice(0, 5);
  clone.itemSpikes = clone.itemSpikes.slice(0, 5);

  return clone;
}
