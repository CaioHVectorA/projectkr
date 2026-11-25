import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { AgyQueueClient } from "../backend/ai/agyClient";
import {
  buildLiveCoachPrompt,
  buildPostGameAutopsyPrompt,
  parseAutopsyResponse,
  parseLiveCoachResponse,
} from "../backend/ai/prompts";
import { config } from "../backend/config";
import { getDDragonCatalog } from "../backend/data/ddragon";
import {
  buildSimulatedLiveStates,
  loadMockMatch,
  loadMockTimeline,
  MOCK_ACCOUNT,
} from "../backend/data/mockRepository";
import {
  condenseLiveStateForAgy,
  detectActionableLiveDelta,
} from "../backend/domain/liveDeltaDetector";
import { condenseMatchTimeline } from "../backend/domain/timelineParser";
import { handleRequest } from "../backend/http/server";

describe("PROJETO LOOT — Lente 1 (Autópsia Pós-Jogo)", () => {
  test("condensa Timeline Match-v5 com rigor determinístico e mantém prompt < 6KB", async () => {
    const [match, timeline, catalog] = await Promise.all([
      loadMockMatch(),
      loadMockTimeline(),
      getDDragonCatalog("15.22.1"),
    ]);

    const telemetry = condenseMatchTimeline(
      match,
      timeline,
      MOCK_ACCOUNT.puuid,
      catalog
    );

    expect(telemetry.player.champ).toBe("Orianna");
    expect(telemetry.laneOpponent?.champ).toBe("Ahri");
    expect(telemetry.lanePhase0to15.goldDiffAt15).toBe(540);
    expect(telemetry.lanePhase0to15.xpDiffAt15).toBe(470);

    const fatalDeath = telemetry.deaths.find((d) => d.t === "22:15");
    expect(fatalDeath).toBeDefined();
    expect(fatalDeath?.unspentGold).toBe(1800);
    expect(fatalDeath?.nearbyObjective).toContain("Dragão Infernal");

    expect(
      telemetry.towersLostAfterPlayerDeath.some(
        (tw) => tw.deathAt === "22:15" && tw.lane === "Mid"
      )
    ).toBe(true);

    const prompt = buildPostGameAutopsyPrompt(telemetry);
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(6000);
  });

  test("parseAutopsyResponse aceita JSON puro, JSON em markdown e fallback seguro", () => {
    const validJson = JSON.stringify({
      veredito_geral: "Resumo curto.",
      fase_de_rotas: {
        nota: 8,
        resumo: "Boa lane",
        metricas_chave: ["140 CS @15m"],
        analise: "Pressão constante.",
      },
      transicao_macro: {
        nota: 5,
        resumo: "Queda no mid-game",
        metricas_chave: ["1/3 objetivos"],
        analise: "Faltou setup de visão.",
      },
      ponto_de_inflexao: {
        timestamp: "22:15",
        titulo: "Pick-off top-side",
        custo_estimado: "Dragão + T1 Mid",
        analise: "Morreu com 1800g.",
      },
      prescricao: [
        { prioridade: 1, foco: "Recall", acao_pratica: "Volte base 45s antes." },
      ],
    });

    expect(parseAutopsyResponse(validJson).parseMode).toBe("json");
    expect(
      parseAutopsyResponse(`\`\`\`json\n${validJson}\n\`\`\``).ponto_de_inflexao
        .timestamp
    ).toBe("22:15");
    expect(parseAutopsyResponse("Texto livre sem JSON").parseMode).toBe(
      "fallback"
    );
  });
});

describe("PROJETO LOOT — Lente 2 (Live Coach)", () => {
  test("detecta deltas acionáveis (Power Spike inimigo, Ouro Flutuando) sem duplicar", () => {
    const { previous, current } = buildSimulatedLiveStates(0);
    const fired = new Set<string>();

    const trigger1 = detectActionableLiveDelta(previous, current, fired);
    expect(trigger1).not.toBeNull();
    expect(trigger1?.kind).toBe("OPPONENT_ITEM_SPIKE");
    expect(trigger1?.severity).toBe("CRITICO");

    // Marca como disparado e verifica que cai para o próximo delta (ouro flutuando 1620g)
    fired.add(trigger1!.fingerprint);
    const trigger2 = detectActionableLiveDelta(previous, current, fired);
    expect(trigger2?.kind).toBe("FLOATING_GOLD");

    // Prompt do Live Coach extremamente leve (< 1.5KB)
    const condensed = condenseLiveStateForAgy(current, trigger1!);
    const prompt = buildLiveCoachPrompt(condensed);
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(1500);
  });

  test("parseLiveCoachResponse impõe máximo de 2 linhas em JSON ou fallback", () => {
    const parsedJson = parseLiveCoachResponse(
      JSON.stringify({
        severidade: "CRITICO",
        linha1: "Ahri fechou Luden aos 14:00.",
        linha2: "Respeite all-in e dê recall na próxima wave.",
      }),
      "ATENCAO"
    );
    expect(parsedJson.severity).toBe("CRITICO");
    expect(parsedJson.lines.length).toBe(2);

    const parsedFallback = parseLiveCoachResponse(
      "Linha 1\nLinha 2\nLinha 3 que deve ser descartada",
      "ATENCAO"
    );
    expect(parsedFallback.lines.length).toBe(2);
  });
});

describe("PROJETO LOOT — Motor AGY & Camada HTTP", () => {
  test("AgyQueueClient executa 1 processo por vez e grava logs de auditoria", async () => {
    if (process.platform !== "win32") {
      const echoClient = new AgyQueueClient({
        ...config,
        agyBin: "/bin/echo",
        agyMode: "arg",
        agyTimeoutMs: 5000,
      });

      const [r1, r2] = await Promise.all([
        echoClient.enqueue("PROMPT_UM"),
        echoClient.enqueue("PROMPT_DOIS"),
      ]);

      expect(r1.stdout).toContain("PROMPT_UM");
      expect(r2.stdout).toContain("PROMPT_DOIS");
      expect(existsSync(config.paths.lastPrompt)).toBe(true);
      expect(existsSync(config.paths.lastResponse)).toBe(true);
    }
  });

  test("Endpoints HTTP (Lente 1 + Lente 2 Live Coach + Frontend)", async () => {
    const healthRes = await handleRequest(
      new Request("http://localhost:3000/api/health")
    );
    expect(healthRes.status).toBe(200);

    const matchesRes = await handleRequest(
      new Request(
        "http://localhost:3000/api/matches?riotId=FakerDemo%23BR1&mock=true"
      )
    );
    expect(matchesRes.status).toBe(200);

    const analyzeRes = await handleRequest(
      new Request("http://localhost:3000/api/analyze/post-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mockData: true, mockAgy: true }),
      })
    );
    expect(analyzeRes.status).toBe(200);

    // Ciclo completo de API do Live Coach
    const simRes = await handleRequest(
      new Request("http://localhost:3000/api/live/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mockAgy: true }),
      })
    );
    expect(simRes.status).toBe(200);
    const simData = (await simRes.json()) as {
      advice: { lines: string[] };
      status: { history: unknown[] };
    };
    expect(simData.advice.lines.length).toBeLessThanOrEqual(2);
    expect(simData.status.history.length).toBeGreaterThanOrEqual(1);

    const muteRes = await handleRequest(
      new Request("http://localhost:3000/api/live/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted: true }),
      })
    );
    expect(((await muteRes.json()) as { muted: boolean }).muted).toBe(true);

    const clearRes = await handleRequest(
      new Request("http://localhost:3000/api/live/clear", { method: "POST" })
    );
    expect(
      ((await clearRes.json()) as { history: unknown[] }).history.length
    ).toBe(0);

    const htmlRes = await handleRequest(new Request("http://localhost:3000/"));
    expect(htmlRes.status).toBe(200);
    expect(await htmlRes.text()).toContain("PROJETO LOOT");
  });

  test("Configurações in-app (/api/settings) salvam, mascaram chave e aplicam em tempo real sem .env", async () => {
    const saveRes = await handleRequest(
      new Request("http://localhost:3000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riotApiKey: "RGAPI-test-1234567890-abcd",
          defaultRiotId: "CaioTester#BR1",
          riotPlatform: "br1",
          agyMode: "stdin",
          livePollIntervalSec: 15,
        }),
      })
    );
    expect(saveRes.status).toBe(200);
    const saved = (await saveRes.json()) as {
      ok: boolean;
      settings: {
        riotKeyConfigured: boolean;
        riotKeyMasked: string;
        defaultRiotId: string;
        agyMode: string;
        livePollIntervalSec: number;
      };
    };
    expect(saved.ok).toBe(true);
    expect(saved.settings.riotKeyConfigured).toBe(true);
    expect(saved.settings.riotKeyMasked).toContain("RGAPI-");
    expect(saved.settings.riotKeyMasked).not.toContain("1234567890");
    expect(saved.settings.defaultRiotId).toBe("CaioTester#BR1");
    expect(saved.settings.agyMode).toBe("stdin");
    expect(saved.settings.livePollIntervalSec).toBe(15);

    // Restaura estado limpo após o teste
    const clearRes = await handleRequest(
      new Request("http://localhost:3000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clearRiotApiKey: true,
          defaultRiotId: "",
          agyMode: "arg",
          livePollIntervalSec: 12,
        }),
      })
    );
    expect(clearRes.status).toBe(200);
    const cleared = (await clearRes.json()) as {
      settings: { riotKeyConfigured: boolean };
    };
    expect(cleared.settings.riotKeyConfigured).toBe(false);
  });
});
