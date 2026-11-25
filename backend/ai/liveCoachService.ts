import { config, type AppConfig } from "../config";
import { fetchLiveClientSnapshot } from "../data/liveClient";
import { buildSimulatedLiveStates } from "../data/mockRepository";
import {
  condenseLiveStateForAgy,
  detectActionableLiveDelta,
} from "../domain/liveDeltaDetector";
import type {
  LiveClientTestResult,
  LiveCoachAdvice,
  LiveCoachStatus,
  LiveDeltaTrigger,
  LiveGameState,
} from "../types";
import { agyClient, type AgyQueueClient } from "./agyClient";
import { buildLiveCoachPrompt, parseLiveCoachResponse } from "./prompts";

const MAX_HISTORY_ITEMS = 30;

function buildMockLiveLines(
  trigger: LiveDeltaTrigger,
  state: LiveGameState
): [string, string] {
  switch (trigger.kind) {
    case "OPPONENT_ITEM_SPIKE":
      return [
        `${trigger.headline} — janela de all-in perigosa contra você agora.`,
        `Respeite o alcance, empurre apenas seguro e procure recall para igualar Power Spike (${state.activePlayer.currentGold}g no bolso).`,
      ];
    case "FLOATING_GOLD":
      return [
        `Você está flutuando ${state.activePlayer.currentGold}g aos ${state.gameTimeLabel} sem converter em stats.`,
        "Empurre a próxima wave até a torre inimiga e dê base imediato para não perder Tempo.",
      ];
    case "CS_DEFICIT":
      return [
        `${trigger.headline} — não force trocas longas em desvantagem.`,
        "Jogue pelo weak-side, segure um freeze perto da sua torre e pinge o MIA.",
      ];
    case "LEVEL_DISADVANTAGE":
      return [
        `${trigger.headline} — risco alto de burst/all-in.`,
        "Absorva XP na distância segura até igualar o nível antes de contestar a wave.",
      ];
    case "RECENT_DEATHS":
      return [
        `${trigger.headline} — pare de estender sem visão da selva inimiga.`,
        "Priorize farm seguro e acompanhe o Tempo do seu jungler nos próximos 2 minutos.",
      ];
    default:
      return [
        `${trigger.headline} — estado do mapa mudou agora.`,
        "Reajuste a visão do rio e sincronize o próximo recall com o cronômetro de objetivos.",
      ];
  }
}

/**
 * Camada de IA — Serviço da Lente 2 (Coach Tático Ao Vivo).
 * - Polling inteligente a cada 12s (read-only na porta 2999).
 * - Loop silencioso: só chama o `agy` se houver Delta acionável E cooldown de 60s livre.
 * - Respeita fila rigorosa do `agyClient` (zero sobreposição de processos).
 * - Suporta MUTE, histórico de avisos e simulação offline.
 */
export class LiveCoachService {
  private running = false;
  private muted = false;
  private analyzingNow = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private connectionStatus: LiveCoachStatus["connectionStatus"] = "STOPPED";
  private statusMessage = "Live Coach pausado. Clique em Iniciar para monitorar.";
  private lastPolledAt: string | null = null;
  private lastAdviceAtMs = 0;
  private activeSummary: LiveClientTestResult["summary"] | null = null;
  private previousState: LiveGameState | null = null;
  private firedFingerprints = new Set<string>();
  private history: LiveCoachAdvice[] = [];
  private lastError: string | null = null;
  private simulationCounter = 0;

  constructor(
    private readonly cfg: AppConfig = config,
    private readonly aiClient: AgyQueueClient = agyClient
  ) {}

  getStatus(): LiveCoachStatus {
    const elapsed = Date.now() - this.lastAdviceAtMs;
    const remainingMs =
      this.lastAdviceAtMs === 0
        ? 0
        : Math.max(0, this.cfg.liveCoachCooldownMs - elapsed);

    return {
      running: this.running,
      muted: this.muted,
      connectionStatus: this.connectionStatus,
      statusMessage: this.statusMessage,
      pollIntervalMs: this.cfg.livePollIntervalMs,
      cooldownMs: this.cfg.liveCoachCooldownMs,
      cooldownRemainingSec: Math.ceil(remainingMs / 1000),
      lastPolledAt: this.lastPolledAt,
      analyzingNow: this.analyzingNow,
      activeSummary: this.activeSummary,
      latestAdvice: this.history[0] ?? null,
      history: this.history,
      lastError: this.lastError,
    };
  }

  start(): LiveCoachStatus {
    if (this.running) return this.getStatus();
    this.running = true;
    this.lastError = null;
    this.connectionStatus = "WAITING_FOR_MATCH";
    this.statusMessage =
      "Monitorando 127.0.0.1:2999 (read-only)... Aguardando Partida.";

    void this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.cfg.livePollIntervalMs);

    return this.getStatus();
  }

  stop(): LiveCoachStatus {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.connectionStatus = "STOPPED";
    this.statusMessage = "Live Coach pausado.";
    return this.getStatus();
  }

  setMuted(muted: boolean): LiveCoachStatus {
    this.muted = muted;
    return this.getStatus();
  }

  clearHistory(): LiveCoachStatus {
    this.history = [];
    this.firedFingerprints.clear();
    this.lastAdviceAtMs = 0;
    this.lastError = null;
    return this.getStatus();
  }

  async pollOnce(): Promise<void> {
    if (!this.running) return;
    this.lastPolledAt = new Date().toISOString();

    const snapshot = await fetchLiveClientSnapshot(false);
    if (snapshot.status !== "IN_GAME" || !snapshot.state) {
      this.connectionStatus = "WAITING_FOR_MATCH";
      this.statusMessage = snapshot.message;
      this.activeSummary = null;
      // Reseta estado da partida se o jogo foi encerrado
      this.previousState = null;
      this.firedFingerprints.clear();
      return;
    }

    this.connectionStatus = "IN_GAME";
    this.statusMessage = `Em partida (${snapshot.state.activePlayer.championName} • ${snapshot.state.gameTimeLabel})`;
    this.activeSummary = snapshot.summary ?? null;

    const currentState = snapshot.state;
    const prev = this.previousState;
    this.previousState = currentState;

    // Se estiver mutado, analisando ou em cooldown de 60s, mantém silêncio absoluto
    if (this.muted || this.analyzingNow || this.aiClient.getStatus().busy) {
      return;
    }

    const now = Date.now();
    if (
      this.lastAdviceAtMs > 0 &&
      now - this.lastAdviceAtMs < this.cfg.liveCoachCooldownMs
    ) {
      return;
    }

    const trigger = detectActionableLiveDelta(
      prev,
      currentState,
      this.firedFingerprints
    );
    if (!trigger) return;

    await this.processTrigger(currentState, trigger, false);
  }

  /**
   * Permite testar todo o fluxo do Live Coach (Detector de Delta -> Prompt -> AGY ou Mock)
   * mesmo sem o cliente do League of Legends aberto.
   */
  async simulateEvent(useMockAgy = false): Promise<{
    advice: LiveCoachAdvice;
    status: LiveCoachStatus;
  }> {
    const { previous, current } = buildSimulatedLiveStates(
      this.simulationCounter++
    );
    const tempFingerprints = new Set<string>();
    const trigger = detectActionableLiveDelta(previous, current, tempFingerprints);

    if (!trigger) {
      throw new Error("Nenhum delta acionável gerado na simulação.");
    }

    this.activeSummary = {
      gameMode: current.gameMode,
      gameTimeSec: current.gameTimeSec,
      gameTimeLabel: current.gameTimeLabel,
      activePlayerName: current.activePlayer.riotId,
      activeChampion: current.activePlayer.championName,
      level: current.activePlayer.level,
      currentGold: current.activePlayer.currentGold,
      playerCount: current.allPlayersCount,
      eventCount: current.recentEvents.length,
    };

    const advice = await this.processTrigger(current, trigger, useMockAgy, true);
    return { advice, status: this.getStatus() };
  }

  private async processTrigger(
    state: LiveGameState,
    trigger: LiveDeltaTrigger,
    useMockAgy: boolean,
    isSimulation = false
  ): Promise<LiveCoachAdvice> {
    this.analyzingNow = true;
    this.lastError = null;

    try {
      const condensed = condenseLiveStateForAgy(state, trigger);
      const prompt = buildLiveCoachPrompt(condensed);

      let severity = trigger.severity;
      let lines: [string] | [string, string];
      let durationMs = 80;
      let source: "agy" | "mock" = "mock";

      if (useMockAgy) {
        await Bun.write(this.cfg.paths.lastPrompt, prompt);
        lines = buildMockLiveLines(trigger, state);
        await Bun.write(
          this.cfg.paths.lastResponse,
          `# MOCK LIVE COACH RESPONSE\n${lines.join("\n")}`
        );
      } else {
        const result = await this.aiClient.enqueue(prompt);
        const parsed = parseLiveCoachResponse(result.stdout, trigger.severity);
        severity = parsed.severity;
        lines = parsed.lines;
        durationMs = result.durationMs;
        source = "agy";
      }

      if (!isSimulation) {
        this.firedFingerprints.add(trigger.fingerprint);
        this.lastAdviceAtMs = Date.now();
      }

      const advice: LiveCoachAdvice = {
        id: `live_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        gameTimeLabel: state.gameTimeLabel,
        severity,
        triggerKind: trigger.kind,
        triggerHeadline: trigger.headline,
        lines,
        source,
        durationMs,
      };

      this.history = [advice, ...this.history].slice(0, MAX_HISTORY_ITEMS);
      return advice;
    } catch (err) {
      this.lastError = (err as Error).message;
      throw err;
    } finally {
      this.analyzingNow = false;
    }
  }
}

export const liveCoachService = new LiveCoachService(config, agyClient);
