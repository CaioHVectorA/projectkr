import type {
  CondensedMatchTelemetry,
  LiveSeverity,
  PostGameAutopsy,
  PrescriptionStep,
} from "../types";

/**
 * LENTE 1: Prompt determinístico da Autópsia Pós-Jogo (< 6KB garantido).
 */
export function buildPostGameAutopsyPrompt(
  telemetry: CondensedMatchTelemetry
): string {
  const jsonPayload = JSON.stringify(telemetry);

  return [
    "Voce e o Analista Tatico Senior do PROJETO LOOT (Coach de League of Legends BR1).",
    "REGRAS ABSOLUTAS:",
    "1. RIGOR DETERMINISTICO: use APENAS numeros, itens, campeoes, ouro e timestamps presentes no JSON abaixo. NUNCA invente valores.",
    "2. Responda em PT-BR com jargao tecnico real de LoL (Wave, Freeze, Tempo, Power Spike, Peel, Engage, Win Condition, Weak-side).",
    "3. Seja direto, cirurgico, acionavel e focado na dor do jogador.",
    "4. Retorne EXCLUSIVAMENTE um objeto JSON valido (sem markdown, sem texto antes ou depois) seguindo EXATAMENTE este schema:",
    '{"veredito_geral":"string (1-2 frases)","fase_de_rotas":{"nota":0,"resumo":"string","metricas_chave":["string"],"analise":"string (3-4 frases sobre 0-15m: CS/min, delta gold/XP, wards, wave)"},"transicao_macro":{"nota":0,"resumo":"string","metricas_chave":["string"],"analise":"string (3-4 frases sobre 15-25m: skirmishes, objetivos, power spikes)"},"ponto_de_inflexao":{"timestamp":"MM:SS","titulo":"string","custo_estimado":"string","analise":"string (qual morte/erro custou mais Tempo/Gold/Objetivo)"},"prescricao":[{"prioridade":1,"foco":"string","acao_pratica":"string"},{"prioridade":2,"foco":"string","acao_pratica":"string"},{"prioridade":3,"foco":"string","acao_pratica":"string"}]}',
    "DADOS_PARTIDA_JSON:",
    jsonPayload,
  ].join("\n");
}

/**
 * LENTE 2: Prompt determinístico do Coach Tático Ao Vivo (máximo 2 linhas).
 */
export function buildLiveCoachPrompt(
  condensedLiveState: Record<string, unknown>
): string {
  return [
    "Voce e o Coach Tatico Ao Vivo do PROJETO LOOT (League of Legends BR1).",
    "REGRAS ABSOLUTAS:",
    "1. RIGOR DETERMINISTICO: use APENAS numeros, itens, campeoes e ouro presentes no JSON abaixo. Nunca invente nada.",
    "2. PT-BR com jargao de LoL (Wave, Freeze, Tempo, Power Spike, Weak-side, All-in, Recall).",
    "3. MAXIMO DE 2 LINHAS CURTAS E ACIONAVEIS (no maximo 110 caracteres por linha).",
    "4. Retorne EXCLUSIVAMENTE um objeto JSON valido seguindo o schema:",
    '{"severidade":"CRITICO|ATENCAO|OPORTUNIDADE","linha1":"diagnostico imediato em 1 frase curta","linha2":"acao tatica imediata na proxima wave"}',
    "ESTADO_AO_VIVO_JSON:",
    JSON.stringify(condensedLiveState),
  ].join("\n");
}

function clampScore(value: unknown, fallback = 5): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(10, Number(num.toFixed(1))));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : String(v ?? "")))
    .filter(Boolean)
    .slice(0, 6);
}

function extractJsonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  return candidate.slice(firstBrace, lastBrace + 1);
}

export function parseAutopsyResponse(rawOutput: string): PostGameAutopsy {
  const jsonCandidate = extractJsonCandidate(rawOutput);

  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      const lane = (parsed.fase_de_rotas ?? {}) as Record<string, unknown>;
      const macro = (parsed.transicao_macro ?? {}) as Record<string, unknown>;
      const inflection = (parsed.ponto_de_inflexao ?? {}) as Record<
        string,
        unknown
      >;
      const rawPresc = Array.isArray(parsed.prescricao) ? parsed.prescricao : [];

      const prescricao: PrescriptionStep[] = rawPresc
        .slice(0, 3)
        .map((step, idx) => {
          const obj = (step ?? {}) as Record<string, unknown>;
          return {
            prioridade: Number(obj.prioridade) || idx + 1,
            foco: String(obj.foco ?? `Ajuste #${idx + 1}`).trim(),
            acao_pratica: String(
              obj.acao_pratica ?? "Aplicar ajuste tático no próximo jogo."
            ).trim(),
          };
        });

      const hasCoreContent =
        typeof lane.analise === "string" ||
        typeof macro.analise === "string" ||
        typeof inflection.analise === "string";

      if (hasCoreContent) {
        return {
          veredito_geral: String(
            parsed.veredito_geral ?? "Autópsia tática concluída."
          ).trim(),
          fase_de_rotas: {
            nota: clampScore(lane.nota, 6),
            resumo: String(
              lane.resumo ?? "Análise dos primeiros 15 minutos."
            ).trim(),
            metricas_chave: toStringArray(lane.metricas_chave),
            analise: String(
              lane.analise ?? "Sem observações adicionais para 0–15m."
            ).trim(),
          },
          transicao_macro: {
            nota: clampScore(macro.nota, 6),
            resumo: String(macro.resumo ?? "Análise do mid-game (15–25m).").trim(),
            metricas_chave: toStringArray(macro.metricas_chave),
            analise: String(
              macro.analise ?? "Sem observações adicionais para 15–25m."
            ).trim(),
          },
          ponto_de_inflexao: {
            timestamp: String(inflection.timestamp ?? "--:--").trim(),
            titulo: String(
              inflection.titulo ?? "Erro de maior custo de Tempo/Gold"
            ).trim(),
            custo_estimado: String(
              inflection.custo_estimado ?? "Impacto direto em objetivo/tempo"
            ).trim(),
            analise: String(
              inflection.analise ?? "Nenhum ponto de inflexão detalhado."
            ).trim(),
          },
          prescricao:
            prescricao.length > 0
              ? prescricao
              : [
                  {
                    prioridade: 1,
                    foco: "Revisão de Tempo",
                    acao_pratica:
                      "Revise as mortes com ouro acumulado e antecipe o recall 45s antes do objetivo.",
                  },
                ],
          parseMode: "json",
        };
      }
    } catch {
      // Cai no fallback seguro abaixo
    }
  }

  return {
    veredito_geral:
      "O AGY respondeu em formato livre (fallback ativado). Exibindo análise bruta abaixo.",
    fase_de_rotas: {
      nota: 0,
      resumo: "Resposta não estruturada em JSON",
      metricas_chave: ["Modo Fallback"],
      analise:
        "O modelo não seguiu estritamente o schema JSON. Consulte o bloco completo de resposta bruta ou /data/last_response.txt.",
    },
    transicao_macro: {
      nota: 0,
      resumo: "Resposta não estruturada em JSON",
      metricas_chave: ["Modo Fallback"],
      analise:
        "Os dados de macro estão incluídos no texto bruto retornado pelo AGY.",
    },
    ponto_de_inflexao: {
      timestamp: "--:--",
      titulo: "Consulte a resposta bruta",
      custo_estimado: "N/A",
      analise: "Veja o painel de resposta bruta abaixo para o diagnóstico completo.",
    },
    prescricao: [
      {
        prioridade: 1,
        foco: "Auditoria de Prompt",
        acao_pratica:
          "Verifique /data/last_response.txt para ajustar o comportamento do CLI agy.",
      },
    ],
    rawFallback: rawOutput.trim(),
    parseMode: "fallback",
  };
}

/**
 * Parser da Lente 2: garante UX estrita de no máximo 2 linhas curtas.
 */
export function parseLiveCoachResponse(
  rawOutput: string,
  defaultSeverity: LiveSeverity
): { severity: LiveSeverity; lines: [string] | [string, string] } {
  const jsonCandidate = extractJsonCandidate(rawOutput);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      const rawSev = String(parsed.severidade ?? defaultSeverity).toUpperCase();
      const severity: LiveSeverity =
        rawSev === "CRITICO" || rawSev === "ATENCAO" || rawSev === "OPORTUNIDADE"
          ? rawSev
          : defaultSeverity;

      const l1 = String(parsed.linha1 ?? "").trim().slice(0, 140);
      const l2 = String(parsed.linha2 ?? "").trim().slice(0, 140);
      if (l1 && l2) return { severity, lines: [l1, l2] };
      if (l1) return { severity, lines: [l1] };
    } catch {
      // Fallback para texto livre limitado a 2 linhas
    }
  }

  const cleanLines = rawOutput
    .replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•>\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((l) => l.slice(0, 140));

  if (cleanLines.length >= 2) {
    return {
      severity: defaultSeverity,
      lines: [cleanLines[0]!, cleanLines[1]!],
    };
  }
  return {
    severity: defaultSeverity,
    lines: [cleanLines[0] || "Ajuste sua posição na wave e proteja seu Tempo."],
  };
}
