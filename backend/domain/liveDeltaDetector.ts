import type {
  LiveDeltaTrigger,
  LiveGameState,
  LiveItemInfo,
} from "../types";

function isMajorItem(item: LiveItemInfo): boolean {
  return !item.consumable && item.price >= 2200;
}

/**
 * Camada de Domínio (Lente 2 — Live Coach):
 * Detecta apenas mudanças de estado acionáveis (Deltas) entre snapshots.
 * Se não houver mudança relevante, retorna null para manter o loop silencioso
 * e evitar spam no processo local do `agy`.
 */
export function detectActionableLiveDelta(
  previous: LiveGameState | null,
  current: LiveGameState,
  firedFingerprints: Set<string>
): LiveDeltaTrigger | null {
  const candidates: LiveDeltaTrigger[] = [];
  const p = current.activePlayer;
  const opp = current.laneOpponent;
  const prevOpp = previous?.laneOpponent ?? null;

  // 1. Adversário direto fechou item completo (Power Spike / Perigo de All-in)
  if (opp) {
    const prevMajorIds = new Set(
      (prevOpp?.items ?? []).filter(isMajorItem).map((i) => i.itemID)
    );
    const newMajorItem = opp.items.find(
      (i) => isMajorItem(i) && !prevMajorIds.has(i.itemID)
    );
    if (newMajorItem) {
      const fp = `OPP_ITEM:${opp.championName}:${newMajorItem.itemID}`;
      if (!firedFingerprints.has(fp)) {
        candidates.push({
          kind: "OPPONENT_ITEM_SPIKE",
          severity: "CRITICO",
          headline: `${opp.championName} fechou ${newMajorItem.displayName}`,
          details: `Adversário direto completou item de ${newMajorItem.price}g aos ${current.gameTimeLabel}.`,
          fingerprint: fp,
        });
      }
    }
  }

  // 2. Jogador flutuando ouro alto sem dar base (>= 1400g)
  if (!p.isDead && p.currentGold >= 1400) {
    const tier =
      p.currentGold >= 2600 ? 2600 : p.currentGold >= 2000 ? 2000 : 1400;
    const minuteBucket = Math.floor(current.gameTimeSec / 180);
    const fp = `GOLD:${tier}:${minuteBucket}`;
    if (!firedFingerprints.has(fp)) {
      candidates.push({
        kind: "FLOATING_GOLD",
        severity: p.currentGold >= 2000 ? "CRITICO" : "ATENCAO",
        headline: `Você está flutuando ${p.currentGold}g sem gastar`,
        details: `Ouro acumulado no bolso aos ${current.gameTimeLabel} sem recall.`,
        fingerprint: fp,
      });
    }
  }

  // 3. Atraso significativo de CS contra o oponente direto (<= -25 CS)
  if (opp && current.gameTimeSec >= 360) {
    const csDiff = p.creepScore - opp.creepScore;
    if (csDiff <= -25) {
      const bucket = csDiff <= -50 ? -50 : csDiff <= -35 ? -35 : -25;
      const fp = `CS_DEFICIT:${bucket}`;
      if (!firedFingerprints.has(fp)) {
        candidates.push({
          kind: "CS_DEFICIT",
          severity: csDiff <= -40 ? "CRITICO" : "ATENCAO",
          headline: `Atraso de ${Math.abs(csDiff)} CS vs ${opp.championName}`,
          details: `Você tem ${p.creepScore} CS contra ${opp.creepScore} CS do oponente aos ${current.gameTimeLabel}.`,
          fingerprint: fp,
        });
      }
    }
  }

  // 4. Desvantagem crítica de nível (spike de ult 6/11/16 ou >= 2 níveis atrás)
  if (opp) {
    const lvlDiff = opp.level - p.level;
    const oppHitUltSpike =
      (opp.level === 6 || opp.level === 11 || opp.level === 16) &&
      p.level < opp.level;
    if (lvlDiff >= 2 || oppHitUltSpike) {
      const fp = `LVL_GAP:${opp.level}:${p.level}`;
      if (!firedFingerprints.has(fp)) {
        candidates.push({
          kind: "LEVEL_DISADVANTAGE",
          severity: "CRITICO",
          headline: `${opp.championName} está Nível ${opp.level} (você Nível ${p.level})`,
          details: `Diferença de ${lvlDiff} nível(is) com janela de all-in favorável ao inimigo.`,
          fingerprint: fp,
        });
      }
    }
  }

  // 5. Morte recente acumulando >= 2 mortes
  if (previous && p.deaths > previous.activePlayer.deaths && p.deaths >= 2) {
    const fp = `DEATHS:${p.deaths}`;
    if (!firedFingerprints.has(fp)) {
      candidates.push({
        kind: "RECENT_DEATHS",
        severity: "CRITICO",
        headline: `Você chegou a ${p.deaths} mortes aos ${current.gameTimeLabel}`,
        details: `KDA atual ${p.kills}/${p.deaths}/${p.assists}. Risco de snowball inimigo.`,
        fingerprint: fp,
      });
    }
  }

  // 6. Objetivo neutro importante capturado nos últimos 20s
  const objectiveNames = new Set([
    "DragonKill",
    "BaronKill",
    "HeraldKill",
    "HordeKill",
  ]);
  const freshObj = [...current.recentEvents]
    .reverse()
    .find(
      (e) =>
        objectiveNames.has(e.eventName) &&
        current.gameTimeSec - e.eventTime <= 25
    );
  if (freshObj) {
    const fp = `OBJ:${freshObj.eventId}:${freshObj.eventName}`;
    if (!firedFingerprints.has(fp)) {
      candidates.push({
        kind: "OBJECTIVE_EVENT",
        severity: "OPORTUNIDADE",
        headline: `Evento de objetivo: ${freshObj.eventName} (${freshObj.dragonType || "Mapa"})`,
        details: `Objetivo abatido por ${freshObj.killerName || "mapa"} aos ${current.gameTimeLabel}.`,
        fingerprint: fp,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Prioriza CRITICO > ATENCAO > OPORTUNIDADE
  const rank = { CRITICO: 3, ATENCAO: 2, OPORTUNIDADE: 1 };
  candidates.sort((a, b) => rank[b.severity] - rank[a.severity]);
  return candidates[0] ?? null;
}

/**
 * Comprime o estado ao vivo em um micro-JSON determinístico (< 1.2KB)
 * para o AGY responder rapidamente em até 2 linhas.
 */
export function condenseLiveStateForAgy(
  state: LiveGameState,
  trigger: LiveDeltaTrigger
): Record<string, unknown> {
  return {
    t: state.gameTimeLabel,
    modo: state.gameMode,
    gatilho: {
      tipo: trigger.kind,
      severidade: trigger.severity,
      resumo: trigger.headline,
      detalhe: trigger.details,
    },
    jogador: {
      champ: state.activePlayer.championName,
      role: state.activePlayer.position,
      lvl: state.activePlayer.level,
      ouroNoBolso: state.activePlayer.currentGold,
      kda: `${state.activePlayer.kills}/${state.activePlayer.deaths}/${state.activePlayer.assists}`,
      cs: state.activePlayer.creepScore,
      morto: state.activePlayer.isDead,
      itens: state.activePlayer.items
        .filter((i) => !i.consumable)
        .map((i) => i.displayName),
    },
    oponente: state.laneOpponent
      ? {
          champ: state.laneOpponent.championName,
          lvl: state.laneOpponent.level,
          kda: `${state.laneOpponent.kills}/${state.laneOpponent.deaths}/${state.laneOpponent.assists}`,
          cs: state.laneOpponent.creepScore,
          itens: state.laneOpponent.items
            .filter((i) => !i.consumable)
            .map((i) => i.displayName),
        }
      : null,
  };
}
