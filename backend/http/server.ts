import { agyClient, AgyExecutionError } from "../ai/agyClient";
import { liveCoachService } from "../ai/liveCoachService";
import { runPostGameAutopsy } from "../ai/postGameService";
import {
  config,
  getPublicSettings,
  hasConfiguredRiotKey,
  isCompiledBinary,
  updateRuntimeSettings,
  type SettingsUpdateInput,
} from "../config";
import { fetchLiveClientSnapshot } from "../data/liveClient";
import { loadMockMatch, MOCK_ACCOUNT } from "../data/mockRepository";
import {
  buildMatchSummary,
  getAccountByRiotId,
  getMatchById,
  getRecentMatchIds,
  RiotApiError,
  testRiotApiKey,
} from "../data/riotApi";
import type { MatchSummaryItem, QueueFilter } from "../types";
import { serveFrontendAsset } from "./assets";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeQueueFilter(raw: string | null | undefined): QueueFilter {
  const val = (raw ?? "all").toLowerCase();
  if (val === "soloq" || val === "flex" || val === "normal") return val;
  return "all";
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;

  try {
    // 1. Health & Diagnóstico
    if (req.method === "GET" && pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        service: "PROJETO LOOT",
        version: "0.3.0",
        platform: process.platform,
        riotKeyConfigured: hasConfiguredRiotKey(),
        defaultRiotId: config.defaultRiotId,
        riotRegion: {
          platform: config.riotPlatform,
          regional: config.riotRegional,
        },
        agy: agyClient.getStatus(),
        liveCoach: {
          running: liveCoachService.getStatus().running,
          muted: liveCoachService.getStatus().muted,
          connectionStatus: liveCoachService.getStatus().connectionStatus,
        },
      });
    }

    // 2. Configurações in-app (zero .env)
    if (req.method === "GET" && pathname === "/api/settings") {
      return jsonResponse(getPublicSettings());
    }

    if (req.method === "POST" && pathname === "/api/settings") {
      const body = (await req.json().catch(() => ({}))) as SettingsUpdateInput;
      const prevPoll = config.livePollIntervalMs;
      const updated = updateRuntimeSettings(body);

      // Se o intervalo de polling mudou enquanto o Live Coach estava rodando, reinicia suavemente
      if (
        liveCoachService.getStatus().running &&
        config.livePollIntervalMs !== prevPoll
      ) {
        liveCoachService.stop();
        liveCoachService.start();
      }

      return jsonResponse({
        ok: true,
        settings: updated,
      });
    }

    if (req.method === "POST" && pathname === "/api/settings/test-riot") {
      const body = (await req.json().catch(() => ({}))) as {
        riotApiKey?: string;
        riotPlatform?: string;
      };
      const result = await testRiotApiKey(body.riotApiKey, body.riotPlatform);
      return jsonResponse(result, result.valid ? 200 : 400);
    }

    // 3. Histórico das últimas 10 partidas (Camada de Dados)
    if (req.method === "GET" && pathname === "/api/matches") {
      const riotId = (url.searchParams.get("riotId") ?? "").trim();
      const queue = normalizeQueueFilter(url.searchParams.get("queue"));
      const useMock = url.searchParams.get("mock") === "true";

      if (useMock) {
        const mockMatch = await loadMockMatch();
        const summary = await buildMatchSummary(mockMatch, MOCK_ACCOUNT.puuid);
        return jsonResponse({
          account: MOCK_ACCOUNT,
          matches: summary ? [summary] : [],
          usedMockData: true,
        });
      }

      if (!riotId) {
        return jsonResponse(
          {
            error: 'Informe um Riot ID no formato "Nome#TAG" (ex: Faker#BR1).',
            code: "RIOT_BAD_REQUEST",
          },
          400
        );
      }

      const account = await getAccountByRiotId(riotId);
      const matchIds = await getRecentMatchIds(account.puuid, 10, queue);

      const rawMatches = await Promise.all(
        matchIds.map((id) => getMatchById(id).catch(() => null))
      );

      const summaries: MatchSummaryItem[] = [];
      for (const m of rawMatches) {
        if (!m) continue;
        const summary = await buildMatchSummary(m, account.puuid);
        if (!summary) continue;
        if (queue !== "all" && summary.queueCategory !== queue) continue;
        summaries.push(summary);
      }

      return jsonResponse({
        account,
        matches: summaries,
        usedMockData: false,
      });
    }

    // 4. LENTE 1: Autópsia Pós-Jogo (Camada de IA -> PostGameService)
    if (req.method === "POST" && pathname === "/api/analyze/post-game") {
      const body = (await req.json().catch(() => ({}))) as {
        riotId?: string;
        matchId?: string;
        queue?: QueueFilter;
        mockData?: boolean;
        mockAgy?: boolean;
      };

      const result = await runPostGameAutopsy({
        riotId: body.riotId,
        matchId: body.matchId,
        queue: normalizeQueueFilter(body.queue),
        mockData: Boolean(body.mockData),
        mockAgy: Boolean(body.mockAgy),
      });

      return jsonResponse(result);
    }

    // 5. LENTE 2: Live Coach — Rotas de Controle e Diagnóstico
    if (req.method === "GET" && pathname === "/api/live/test") {
      const snapshot = await fetchLiveClientSnapshot(true);
      return jsonResponse(snapshot);
    }

    if (req.method === "GET" && pathname === "/api/live/status") {
      return jsonResponse(liveCoachService.getStatus());
    }

    if (req.method === "POST" && pathname === "/api/live/start") {
      return jsonResponse(liveCoachService.start());
    }

    if (req.method === "POST" && pathname === "/api/live/stop") {
      return jsonResponse(liveCoachService.stop());
    }

    if (req.method === "POST" && pathname === "/api/live/mute") {
      const body = (await req.json().catch(() => ({}))) as { muted?: boolean };
      const nextMuted =
        typeof body.muted === "boolean"
          ? body.muted
          : !liveCoachService.getStatus().muted;
      return jsonResponse(liveCoachService.setMuted(nextMuted));
    }

    if (req.method === "POST" && pathname === "/api/live/clear") {
      return jsonResponse(liveCoachService.clearHistory());
    }

    if (req.method === "POST" && pathname === "/api/live/simulate") {
      const body = (await req.json().catch(() => ({}))) as {
        mockAgy?: boolean;
      };
      const result = await liveCoachService.simulateEvent(Boolean(body.mockAgy));
      return jsonResponse(result);
    }

    // 6. Frontend estático / embutido
    if (req.method === "GET") {
      return serveFrontendAsset(pathname);
    }

    return jsonResponse({ error: "Rota não encontrada." }, 404);
  } catch (err) {
    if (err instanceof RiotApiError) {
      return jsonResponse(
        {
          error: err.message,
          code: err.code,
          suggestMock:
            err.code === "RIOT_KEY_MISSING" || err.code === "RIOT_AUTH_ERROR",
          suggestSettings:
            err.code === "RIOT_KEY_MISSING" || err.code === "RIOT_AUTH_ERROR",
        },
        err.statusCode
      );
    }
    if (err instanceof AgyExecutionError) {
      return jsonResponse(
        {
          error: err.message,
          code: err.code,
          details: err.details,
          suggestMockAgy: err.code === "AGY_NOT_FOUND",
          suggestSettings: err.code === "AGY_NOT_FOUND",
        },
        500
      );
    }

    console.error("[PROJETO LOOT] Erro inesperado:", err);
    return jsonResponse(
      {
        error: `Erro interno no servidor: ${(err as Error).message}`,
        code: "INTERNAL_ERROR",
      },
      500
    );
  }
}

function openBrowserUrl(targetUrl: string): void {
  try {
    if (process.platform === "win32") {
      // Usa Shell API nativa do Windows (sem cmd.exe e sem .bat)
      Bun.spawn(["rundll32", "url.dll,FileProtocolHandler", targetUrl], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
        windowsHide: true,
      });
    } else if (process.platform === "darwin") {
      Bun.spawn(["open", targetUrl], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
      });
    } else {
      Bun.spawn(["xdg-open", targetUrl], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
      });
    }
  } catch {
    // Se não conseguir abrir automaticamente, o usuário abre manualmente pelo link no terminal
  }
}

if (import.meta.main) {
  // Bind estrito em 127.0.0.1 (loopback): 100% local e evita alerta do Windows Firewall
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: config.port,
    fetch: handleRequest,
  });

  const appUrl = `http://localhost:${server.port}`;

  console.log("==========================================================");
  console.log(`  PROJETO LOOT v0.3.1 rodando em ${appUrl}`);
  console.log(
    `  Riot API Key: ${
      hasConfiguredRiotKey()
        ? "CONFIGURADA"
        : 'NAO CONFIGURADA (abra "Configuracoes" no navegador)'
    }`
  );
  console.log(
    `  AGY CLI: ${config.agyBin} (modo: ${config.agyMode} | timeout: ${Math.round(
      config.agyTimeoutMs / 1000
    )}s)`
  );
  console.log("  Pressione Ctrl+C ou feche esta janela para encerrar.");
  console.log("==========================================================");

  if (isCompiledBinary && process.env.LOOT_NO_BROWSER !== "1") {
    setTimeout(() => openBrowserUrl(appUrl), 600);
  }
}
