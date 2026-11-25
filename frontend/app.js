const els = {
  healthBadges: document.getElementById("healthBadges"),
  toggleMockData: document.getElementById("toggleMockData"),
  toggleMockAgy: document.getElementById("toggleMockAgy"),
  searchForm: document.getElementById("searchForm"),
  riotIdInput: document.getElementById("riotIdInput"),
  queueFilter: document.getElementById("queueFilter"),
  btnListMatches: document.getElementById("btnListMatches"),
  btnAnalyzeLatest: document.getElementById("btnAnalyzeLatest"),
  errorBanner: document.getElementById("errorBanner"),
  errorText: document.getElementById("errorText"),
  btnQuickMock: document.getElementById("btnQuickMock"),
  historySection: document.getElementById("historySection"),
  historyAccountTag: document.getElementById("historyAccountTag"),
  historyList: document.getElementById("historyList"),
  loadingSection: document.getElementById("loadingSection"),
  loadingTitle: document.getElementById("loadingTitle"),
  autopsySection: document.getElementById("autopsySection"),
  matchMetaHeader: document.getElementById("matchMetaHeader"),
  verdictText: document.getElementById("verdictText"),
  laneScore: document.getElementById("laneScore"),
  laneSummary: document.getElementById("laneSummary"),
  laneMetrics: document.getElementById("laneMetrics"),
  laneAnalysis: document.getElementById("laneAnalysis"),
  macroScore: document.getElementById("macroScore"),
  macroSummary: document.getElementById("macroSummary"),
  macroMetrics: document.getElementById("macroMetrics"),
  macroAnalysis: document.getElementById("macroAnalysis"),
  inflectionTimestamp: document.getElementById("inflectionTimestamp"),
  inflectionTitle: document.getElementById("inflectionTitle"),
  inflectionCost: document.getElementById("inflectionCost"),
  inflectionAnalysis: document.getElementById("inflectionAnalysis"),
  prescriptionList: document.getElementById("prescriptionList"),
  rawFallbackBox: document.getElementById("rawFallbackBox"),
  rawFallbackText: document.getElementById("rawFallbackText"),
  telemetryMetaTag: document.getElementById("telemetryMetaTag"),
  telemetryJsonPre: document.getElementById("telemetryJsonPre"),
  // Lente 2: Live Coach
  liveConnectionPill: document.getElementById("liveConnectionPill"),
  btnLiveToggle: document.getElementById("btnLiveToggle"),
  btnLiveMute: document.getElementById("btnLiveMute"),
  btnLiveSimulate: document.getElementById("btnLiveSimulate"),
  btnLiveClear: document.getElementById("btnLiveClear"),
  liveCoachStatusText: document.getElementById("liveCoachStatusText"),
  liveActiveChampMeta: document.getElementById("liveActiveChampMeta"),
  liveCooldownMeta: document.getElementById("liveCooldownMeta"),
  liveAdviceHero: document.getElementById("liveAdviceHero"),
  liveAdviceSeverity: document.getElementById("liveAdviceSeverity"),
  liveAdviceTrigger: document.getElementById("liveAdviceTrigger"),
  liveAdviceClock: document.getElementById("liveAdviceClock"),
  liveAdviceLines: document.getElementById("liveAdviceLines"),
  liveHistoryCount: document.getElementById("liveHistoryCount"),
  liveHistoryList: document.getElementById("liveHistoryList"),
  btnTestLive: document.getElementById("btnTestLive"),
  liveResultBox: document.getElementById("liveResultBox"),
  liveStatusBanner: document.getElementById("liveStatusBanner"),
  liveJsonPre: document.getElementById("liveJsonPre"),
};

let liveStateCache = { running: false, muted: false };
let liveUiPoller = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showError(message, options = {}) {
  els.errorText.textContent = message;
  els.errorBanner.classList.remove("hidden");
  if (options.suggestMock || options.suggestMockAgy) {
    els.btnQuickMock.classList.remove("hidden");
    els.btnQuickMock.dataset.mode = options.suggestMockAgy ? "full" : "data";
  } else {
    els.btnQuickMock.classList.add("hidden");
  }
}

function clearError() {
  els.errorBanner.classList.add("hidden");
  els.btnQuickMock.classList.add("hidden");
}

function setBusy(busy, message) {
  els.btnListMatches.disabled = busy;
  els.btnAnalyzeLatest.disabled = busy;
  if (busy) {
    els.loadingTitle.textContent =
      message || "Condensando Timeline e invocando Antigravity (agy)...";
    els.loadingSection.classList.remove("hidden");
  } else {
    els.loadingSection.classList.add("hidden");
  }
}

function scoreStyle(nota) {
  if (nota >= 7.5) return "bg-[#0ac8b9]/15 text-[#0ac8b9] border-[#0ac8b9]/40";
  if (nota >= 5.5) return "bg-[#c8aa6e]/15 text-[#c8aa6e] border-[#c8aa6e]/40";
  return "bg-[#e84057]/15 text-[#ff8a9b] border-[#e84057]/40";
}

function severityStyle(sev) {
  if (sev === "CRITICO") {
    return {
      badge: "bg-[#e84057]/20 text-[#ff8a9b] border border-[#e84057]/45",
      border: "border-[#e84057]/45 bg-[#200f16]/80",
    };
  }
  if (sev === "OPORTUNIDADE") {
    return {
      badge: "bg-[#0ac8b9]/20 text-[#0ac8b9] border border-[#0ac8b9]/45",
      border: "border-[#0ac8b9]/40 bg-[#081b1e]/80",
    };
  }
  return {
    badge: "bg-[#c8aa6e]/20 text-[#c8aa6e] border border-[#c8aa6e]/45",
    border: "border-[#c8aa6e]/40 bg-[#1a150c]/80",
  };
}

function renderMetricChips(container, metrics) {
  container.innerHTML = "";
  (metrics || []).forEach((m) => {
    const span = document.createElement("span");
    span.className =
      "font-mono-tech text-[11px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[#b7c4d6]";
    span.textContent = m;
    container.appendChild(span);
  });
}

async function loadHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();

    const keyBadge = data.riotKeyConfigured
      ? `<span class="px-2.5 py-1 rounded-md bg-[#0ac8b9]/15 border border-[#0ac8b9]/30 text-[#0ac8b9]">RIOT KEY: OK</span>`
      : `<span class="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-300">RIOT KEY: AUSENTE</span>`;

    const agyBadge = `<span class="px-2.5 py-1 rounded-md bg-white/5 border border-white/15 text-[#c8aa6e]">AGY: ${escapeHtml(
      data.agy.bin
    )} (${escapeHtml(data.agy.mode)})</span>`;

    els.healthBadges.innerHTML = keyBadge + agyBadge;

    if (!data.riotKeyConfigured) {
      els.toggleMockData.checked = true;
    }
  } catch {
    els.healthBadges.innerHTML = `<span class="px-2.5 py-1 rounded-md bg-[#e84057]/20 border border-[#e84057]/40 text-[#ff8a9b]">API OFFLINE</span>`;
  }
}

// ============================================================================
// LENTE 1: AUTÓPSIA PÓS-JOGO
// ============================================================================

function renderHistory(account, matches) {
  els.historyAccountTag.textContent = `${account.gameName}#${account.tagLine} • ${matches.length} partida(s)`;
  els.historyList.innerHTML = "";

  if (!matches.length) {
    els.historyList.innerHTML = `<div class="col-span-full text-xs text-[#8b9bb4] py-4 text-center">Nenhuma partida encontrada para este filtro de fila.</div>`;
    els.historySection.classList.remove("hidden");
    return;
  }

  for (const m of matches) {
    const card = document.createElement("div");
    card.className = `rounded-lg p-3 border flex items-center justify-between gap-3 transition ${
      m.win
        ? "bg-[#0ac8b9]/[0.06] border-[#0ac8b9]/25 hover:border-[#0ac8b9]/55"
        : "bg-[#e84057]/[0.06] border-[#e84057]/25 hover:border-[#e84057]/55"
    }`;

    const itemsHtml = (m.items || [])
      .slice(0, 6)
      .map(
        (it) =>
          `<img src="${escapeHtml(it.iconUrl)}" alt="${escapeHtml(
            it.name
          )}" title="${escapeHtml(
            it.name
          )}" class="w-5 h-5 rounded border border-white/15 bg-black/50" loading="lazy" />`
      )
      .join("");

    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <img
          src="${escapeHtml(m.championIconUrl)}"
          alt="${escapeHtml(m.champion)}"
          class="w-11 h-11 rounded-lg border border-[#c8aa6e]/35 bg-black/60 shrink-0"
        />
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-[#f0e6d2] truncate">${escapeHtml(
              m.champion
            )}</span>
            <span class="font-mono-tech text-[10px] px-1.5 py-0.5 rounded ${
              m.win
                ? "bg-[#0ac8b9]/20 text-[#0ac8b9]"
                : "bg-[#e84057]/20 text-[#ff8a9b]"
            }">${m.win ? "VITÓRIA" : "DERROTA"}</span>
            <span class="font-mono-tech text-[10px] text-[#8b9bb4]">${escapeHtml(
              m.role
            )}</span>
          </div>
          <div class="text-xs text-[#b7c4d6] font-mono-tech mt-0.5">
            ${m.kills}/${m.deaths}/${m.assists} • ${m.cs} CS (${m.csPerMin}/m) • ${escapeHtml(
      m.durationLabel
    )}
          </div>
          <div class="flex items-center gap-1 mt-1.5">
            ${itemsHtml}
            <span class="text-[10px] text-[#8b9bb4] ml-1.5 truncate">${escapeHtml(
              m.queueName
            )}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        data-match-id="${escapeHtml(m.matchId)}"
        class="btn-autopsy-item hex-btn-primary shrink-0 rounded-md px-3 py-1.5 text-xs"
      >
        Autopsiar
      </button>
    `;

    card.querySelector(".btn-autopsy-item").addEventListener("click", () => {
      runAutopsy(m.matchId);
    });

    els.historyList.appendChild(card);
  }

  els.historySection.classList.remove("hidden");
}

function renderAutopsyResult(payload) {
  const { matchSummary, telemetry, autopsy, meta } = payload;

  const winBadge = matchSummary?.win
    ? `<span class="px-2 py-0.5 rounded bg-[#0ac8b9]/20 text-[#0ac8b9] border border-[#0ac8b9]/40 font-mono-tech text-xs font-bold">VITÓRIA</span>`
    : `<span class="px-2 py-0.5 rounded bg-[#e84057]/20 text-[#ff8a9b] border border-[#e84057]/40 font-mono-tech text-xs font-bold">DERROTA</span>`;

  const oppText = matchSummary?.opponentChampion
    ? `vs <span class="text-[#f0e6d2] font-semibold">${escapeHtml(
        matchSummary.opponentChampion
      )}</span>`
    : "";

  const itemsHtml = (matchSummary?.items || [])
    .map(
      (it) =>
        `<img src="${escapeHtml(it.iconUrl)}" title="${escapeHtml(
          it.name
        )}" alt="${escapeHtml(
          it.name
        )}" class="w-6 h-6 rounded border border-white/15 bg-black/50" />`
    )
    .join("");

  els.matchMetaHeader.innerHTML = `
    <div class="flex items-center gap-3.5">
      ${
        matchSummary?.championIconUrl
          ? `<img src="${escapeHtml(
              matchSummary.championIconUrl
            )}" alt="${escapeHtml(
              matchSummary.champion
            )}" class="w-14 h-14 rounded-xl border border-[#c8aa6e]/50 bg-black/60" />`
          : ""
      }
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-lg font-bold text-[#f0e6d2]">${escapeHtml(
            telemetry.player.champ
          )}</span>
          <span class="text-xs text-[#8b9bb4]">${oppText}</span>
          ${winBadge}
          <span class="font-mono-tech text-xs text-[#8b9bb4]">${escapeHtml(
            telemetry.queue
          )} • ${escapeHtml(telemetry.duration)}</span>
        </div>
        <div class="font-mono-tech text-xs text-[#b7c4d6] mt-1">
          ${escapeHtml(telemetry.player.riotId)} • ${escapeHtml(
    telemetry.player.role
  )} • KDA ${escapeHtml(telemetry.player.kda)} • ${telemetry.player.cs} CS (${
    telemetry.player.csMin
  }/m) • Patch ${escapeHtml(telemetry.patch)}
        </div>
        <div class="flex items-center gap-1.5 mt-2">${itemsHtml}</div>
      </div>
    </div>
    <div class="font-mono-tech text-[11px] text-[#8b9bb4] bg-black/35 border border-white/10 rounded-lg px-3 py-2 space-y-0.5">
      <div>Motor: <span class="text-[#c8aa6e]">${escapeHtml(
        meta.agyMode
      )}</span> (${(meta.agyDurationMs / 1000).toFixed(1)}s)</div>
      <div>Prompt: <span class="text-[#0ac8b9]">${meta.promptBytes} bytes</span></div>
      <div>Dados: <span class="text-[#f0e6d2]">${
        meta.usedMockData ? "MOCK" : "RIOT API"
      }</span></div>
    </div>
  `;

  els.verdictText.textContent = autopsy.veredito_geral || "";

  const lane = autopsy.fase_de_rotas;
  els.laneScore.textContent = `${Number(lane.nota ?? 0).toFixed(1)} / 10`;
  els.laneScore.className = `score-pill font-mono-tech text-sm font-bold px-2.5 py-1 rounded-md border ${scoreStyle(
    lane.nota
  )}`;
  els.laneSummary.textContent = lane.resumo || "";
  renderMetricChips(els.laneMetrics, lane.metricas_chave);
  els.laneAnalysis.textContent = lane.analise || "";

  const macro = autopsy.transicao_macro;
  els.macroScore.textContent = `${Number(macro.nota ?? 0).toFixed(1)} / 10`;
  els.macroScore.className = `score-pill font-mono-tech text-sm font-bold px-2.5 py-1 rounded-md border ${scoreStyle(
    macro.nota
  )}`;
  els.macroSummary.textContent = macro.resumo || "";
  renderMetricChips(els.macroMetrics, macro.metricas_chave);
  els.macroAnalysis.textContent = macro.analise || "";

  const inf = autopsy.ponto_de_inflexao;
  els.inflectionTimestamp.textContent = inf.timestamp || "--:--";
  els.inflectionTitle.textContent = inf.titulo || "";
  els.inflectionCost.textContent = `Custo estimado: ${inf.custo_estimado || "N/A"}`;
  els.inflectionAnalysis.textContent = inf.analise || "";

  els.prescriptionList.innerHTML = "";
  (autopsy.prescricao || []).forEach((step, idx) => {
    const li = document.createElement("li");
    li.className =
      "rounded-lg bg-black/30 border border-white/10 p-3 flex items-start gap-3";
    li.innerHTML = `
      <span class="font-mono-tech text-xs font-bold w-6 h-6 rounded-md bg-[#c8aa6e]/20 text-[#c8aa6e] border border-[#c8aa6e]/35 flex items-center justify-center shrink-0">
        ${escapeHtml(step.prioridade || idx + 1)}
      </span>
      <div class="space-y-0.5">
        <div class="text-xs font-bold text-[#f0e6d2]">${escapeHtml(step.foco)}</div>
        <p class="text-xs text-[#c5d0df] leading-relaxed">${escapeHtml(
          step.acao_pratica
        )}</p>
      </div>
    `;
    els.prescriptionList.appendChild(li);
  });

  if (autopsy.parseMode === "fallback" && autopsy.rawFallback) {
    els.rawFallbackText.textContent = autopsy.rawFallback;
    els.rawFallbackBox.classList.remove("hidden");
  } else {
    els.rawFallbackBox.classList.add("hidden");
  }

  els.telemetryMetaTag.textContent = `${telemetry.matchId} • ${
    new TextEncoder().encode(JSON.stringify(telemetry)).length
  } bytes minificados`;
  els.telemetryJsonPre.textContent = JSON.stringify(telemetry, null, 2);

  els.autopsySection.classList.remove("hidden");
  els.autopsySection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function fetchMatchHistory() {
  clearError();
  const riotId = els.riotIdInput.value.trim();
  const queue = els.queueFilter.value;
  const mock = els.toggleMockData.checked;

  setBusy(true, "Buscando histórico das últimas 10 partidas...");
  try {
    const params = new URLSearchParams({ riotId, queue, mock: String(mock) });
    const res = await fetch(`/api/matches?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "Falha ao buscar histórico de partidas.", {
        suggestMock: data.suggestMock,
      });
      return;
    }
    renderHistory(data.account, data.matches || []);
  } catch (err) {
    showError(`Erro de conexão com o servidor local: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

async function runAutopsy(matchId = null) {
  clearError();
  const riotId = els.riotIdInput.value.trim();
  const queue = els.queueFilter.value;
  const mockData = els.toggleMockData.checked;
  const mockAgy = els.toggleMockAgy.checked;

  setBusy(
    true,
    mockAgy
      ? "Condensando Timeline e carregando simulação de Autópsia..."
      : "Condensando Timeline e invocando Antigravity (agy)..."
  );

  try {
    const res = await fetch("/api/analyze/post-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        riotId,
        matchId: matchId || undefined,
        queue,
        mockData,
        mockAgy,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "Erro ao executar autópsia pós-jogo.", {
        suggestMock: data.suggestMock,
        suggestMockAgy: data.suggestMockAgy,
      });
      return;
    }
    renderAutopsyResult(data);
  } catch (err) {
    showError(`Falha na requisição ao backend local: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

// ============================================================================
// LENTE 2: LIVE COACH
// ============================================================================

function renderLiveCoachStatus(status) {
  liveStateCache = { running: status.running, muted: status.muted };

  // Pill de conexão
  if (!status.running) {
    els.liveConnectionPill.textContent = "PAUSADO";
    els.liveConnectionPill.className =
      "font-mono-tech text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/15 text-[#8b9bb4]";
  } else if (status.connectionStatus === "IN_GAME") {
    els.liveConnectionPill.textContent = status.analyzingNow
      ? "ANALISANDO AGY..."
      : "EM PARTIDA";
    els.liveConnectionPill.className =
      "font-mono-tech text-[10px] px-2 py-0.5 rounded bg-[#0ac8b9]/20 border border-[#0ac8b9]/45 text-[#0ac8b9]";
  } else {
    els.liveConnectionPill.textContent = "AGUARDANDO PARTIDA";
    els.liveConnectionPill.className =
      "font-mono-tech text-[10px] px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300";
  }

  // Botões Iniciar/Pausar e MUTE
  els.btnLiveToggle.textContent = status.running
    ? "Pausar Live Coach"
    : "Iniciar Live Coach";

  els.btnLiveMute.textContent = status.muted ? "MUTE: ON" : "MUTE: OFF";
  els.btnLiveMute.className = status.muted
    ? "rounded-lg px-3 py-2 text-xs font-semibold border border-[#e84057]/55 bg-[#e84057]/20 text-[#ff8a9b] transition"
    : "rounded-lg px-3 py-2 text-xs font-semibold border border-white/15 bg-white/5 text-[#d6dde8] hover:border-[#c8aa6e]/50 transition";

  els.liveCoachStatusText.textContent = status.lastError
    ? `Erro AGY: ${status.lastError}`
    : status.statusMessage;

  els.liveActiveChampMeta.textContent = status.activeSummary
    ? `${status.activeSummary.activeChampion} Lvl ${status.activeSummary.level} • ${status.activeSummary.currentGold}g • ${status.activeSummary.gameTimeLabel}`
    : "";

  els.liveCooldownMeta.textContent =
    status.cooldownRemainingSec > 0
      ? `Cooldown: ${status.cooldownRemainingSec}s`
      : "Cooldown: pronto";

  // Último aviso (máximo 2 linhas)
  const latest = status.latestAdvice;
  if (latest) {
    const sty = severityStyle(latest.severity);
    els.liveAdviceHero.className = `rounded-xl border p-4 space-y-2 transition ${sty.border}`;
    els.liveAdviceSeverity.className = `font-mono-tech text-[10px] font-bold px-2 py-0.5 rounded ${sty.badge}`;
    els.liveAdviceSeverity.textContent = latest.severity;
    els.liveAdviceTrigger.textContent = `${latest.triggerHeadline} (${latest.source.toUpperCase()})`;
    els.liveAdviceClock.textContent = latest.gameTimeLabel;
    els.liveAdviceLines.innerHTML = (latest.lines || [])
      .slice(0, 2)
      .map((line) => `<p class="leading-snug">${escapeHtml(line)}</p>`)
      .join("");
  } else {
    els.liveAdviceHero.className =
      "rounded-xl border border-[#0ac8b9]/25 bg-[#070a0f]/80 p-4 space-y-2";
    els.liveAdviceSeverity.className =
      "font-mono-tech text-[10px] font-bold px-2 py-0.5 rounded bg-white/10 text-[#8b9bb4]";
    els.liveAdviceSeverity.textContent = "SILENCIOSO";
    els.liveAdviceTrigger.textContent = "Nenhum delta acionável detectado ainda.";
    els.liveAdviceClock.textContent = "--:--";
    els.liveAdviceLines.innerHTML = `<p class="text-xs text-[#8b9bb4]">O Live Coach só fala quando identifica mudança real de estado (ouro flutuando, Power Spike inimigo, atraso de CS ou janela de objetivo).</p>`;
  }

  // Histórico de avisos
  const hist = status.history || [];
  els.liveHistoryCount.textContent = `${hist.length} aviso(s)`;
  els.liveHistoryList.innerHTML = "";
  for (const item of hist) {
    const sty = severityStyle(item.severity);
    const row = document.createElement("div");
    row.className =
      "rounded-lg bg-black/30 border border-white/10 px-3.5 py-2.5 space-y-1";
    row.innerHTML = `
      <div class="flex items-center justify-between gap-2 text-[11px]">
        <div class="flex items-center gap-2 min-w-0">
          <span class="font-mono-tech text-[10px] font-bold px-1.5 py-0.5 rounded ${sty.badge}">${escapeHtml(
      item.severity
    )}</span>
          <span class="text-[#8b9bb4] truncate">${escapeHtml(
            item.triggerHeadline
          )}</span>
        </div>
        <span class="font-mono-tech text-[#c8aa6e] shrink-0">${escapeHtml(
          item.gameTimeLabel
        )}</span>
      </div>
      <div class="text-xs text-[#e5ebf4] space-y-0.5">
        ${(item.lines || [])
          .slice(0, 2)
          .map((l) => `<p>${escapeHtml(l)}</p>`)
          .join("")}
      </div>
    `;
    els.liveHistoryList.appendChild(row);
  }

  syncLiveUiPoller(status.running);
}

function syncLiveUiPoller(shouldRun) {
  if (shouldRun && !liveUiPoller) {
    liveUiPoller = setInterval(refreshLiveStatus, 3000);
  } else if (!shouldRun && liveUiPoller) {
    clearInterval(liveUiPoller);
    liveUiPoller = null;
  }
}

async function refreshLiveStatus() {
  try {
    const res = await fetch("/api/live/status");
    if (res.ok) {
      renderLiveCoachStatus(await res.json());
    }
  } catch {
    // Silencioso no polling de UI
  }
}

async function toggleLiveCoach() {
  const endpoint = liveStateCache.running ? "/api/live/stop" : "/api/live/start";
  const res = await fetch(endpoint, { method: "POST" });
  if (res.ok) {
    renderLiveCoachStatus(await res.json());
  }
}

async function toggleLiveMute() {
  const res = await fetch("/api/live/mute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muted: !liveStateCache.muted }),
  });
  if (res.ok) {
    renderLiveCoachStatus(await res.json());
  }
}

async function clearLiveHistory() {
  const res = await fetch("/api/live/clear", { method: "POST" });
  if (res.ok) {
    renderLiveCoachStatus(await res.json());
  }
}

async function simulateLiveEvent() {
  clearError();
  els.btnLiveSimulate.disabled = true;
  els.btnLiveSimulate.textContent = "Processando Delta...";
  try {
    const res = await fetch("/api/live/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mockAgy: els.toggleMockAgy.checked }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "Falha ao simular evento do Live Coach.", {
        suggestMockAgy: data.suggestMockAgy,
      });
      return;
    }
    renderLiveCoachStatus(data.status);
  } catch (err) {
    showError(`Erro na simulação do Live Coach: ${err.message}`);
  } finally {
    els.btnLiveSimulate.disabled = false;
    els.btnLiveSimulate.textContent = "Simular Evento Live";
  }
}

async function testLiveClient() {
  els.btnTestLive.disabled = true;
  els.btnTestLive.textContent = "Consultando 2999...";
  try {
    const res = await fetch("/api/live/test");
    const data = await res.json();
    els.liveResultBox.classList.remove("hidden");

    const inGame = data.status === "IN_GAME";
    els.liveStatusBanner.className = `rounded-lg px-3.5 py-2.5 text-xs font-medium flex flex-wrap items-center justify-between gap-2 border ${
      inGame
        ? "bg-[#0ac8b9]/15 border-[#0ac8b9]/40 text-[#8bf2ea]"
        : "bg-amber-500/10 border-amber-500/30 text-amber-200"
    }`;

    const summaryStr = data.summary
      ? `${data.summary.activeChampion} (Lvl ${data.summary.level}) • ${data.summary.currentGold}g • ${data.summary.gameTimeLabel}`
      : `Verificado em ${new Date(data.checkedAt).toLocaleTimeString("pt-BR")}`;

    els.liveStatusBanner.innerHTML = `
      <span>${escapeHtml(data.message)}</span>
      <span class="font-mono-tech text-[11px]">${escapeHtml(summaryStr)}</span>
    `;
    els.liveJsonPre.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    els.liveResultBox.classList.remove("hidden");
    els.liveStatusBanner.className =
      "rounded-lg px-3.5 py-2.5 text-xs bg-[#e84057]/15 border border-[#e84057]/40 text-[#ffd5dc]";
    els.liveStatusBanner.textContent = `Erro ao consultar /api/live/test: ${err.message}`;
    els.liveJsonPre.textContent = "";
  } finally {
    els.btnTestLive.disabled = false;
    els.btnTestLive.textContent = "Testar JSON 2999";
  }
}

els.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  runAutopsy(null);
});
els.btnListMatches.addEventListener("click", fetchMatchHistory);
els.btnQuickMock.addEventListener("click", () => {
  els.toggleMockData.checked = true;
  if (els.btnQuickMock.dataset.mode === "full") {
    els.toggleMockAgy.checked = true;
  }
  clearError();
  runAutopsy(null);
});

els.btnLiveToggle.addEventListener("click", toggleLiveCoach);
els.btnLiveMute.addEventListener("click", toggleLiveMute);
els.btnLiveClear.addEventListener("click", clearLiveHistory);
els.btnLiveSimulate.addEventListener("click", simulateLiveEvent);
els.btnTestLive.addEventListener("click", testLiveClient);

loadHealth();
refreshLiveStatus();
