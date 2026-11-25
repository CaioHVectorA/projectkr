# PROJETO LOOT — Coach Tático Local de League of Legends (BR1)

Sistema 100% local rodando no seu PC (Windows 10/11) com **Bun + TypeScript** em servidor único (`http://localhost:3000`), usando exclusivamente o CLI oficial local do **Google Antigravity (`agy`)** como motor cognitivo — zero SaaS, zero APIs pagas de LLM.

---

## Arquitetura em Camadas

O backend separa explicitamente **Dados**, **Domínio/Telemetria**, **IA** e **Transporte HTTP**:

```text
projectkr/
├── backend/
│   ├── config.ts                  # Infra: leitura do .env e diretórios /data
│   ├── types.ts                   # Contratos de tipos compartilhados
│   ├── data/                      # CAMADA DE DADOS (I/O puro, cache, zero IA)
│   │   ├── riotApi.ts             # Account-v1, Match-v5, Timeline + cache em /data/cache
│   │   ├── ddragon.ts             # Data Dragon pt_BR em /data/ddragon
│   │   ├── liveClient.ts          # Read-only https://127.0.0.1:2999 (allgamedata)
│   │   └── mockRepository.ts      # Repositório de fixtures /data/mock/ (com fallback embutido)
│   ├── domain/                    # CAMADA DE DOMÍNIO (regras determinísticas, zero IA)
│   │   ├── timelineParser.ts      # Condensador Match-v5 (< 6KB garantido)
│   │   └── liveDeltaDetector.ts   # Detector de deltas acionáveis do Live Coach
│   ├── ai/                        # CAMADA DE IA (exclusivamente CLI agy + prompts + casos de uso)
│   │   ├── agyClient.ts           # Fila produtor-consumidor (1 agy por vez), timeout 90s, logs
│   │   ├── prompts.ts             # Prompts determinísticos Lente 1 e Lente 2 + parsers
│   │   ├── postGameService.ts     # Caso de uso Lente 1 (Autópsia Pós-Jogo)
│   │   └── liveCoachService.ts    # Caso de uso Lente 2 (Loop silencioso 12s/60s, MUTE, histórico)
│   └── http/                      # CAMADA HTTP / APRESENTAÇÃO
│       ├── assets.ts              # Frontend do disco (dev) ou embutido no executável (.exe)
│       └── server.ts              # Servidor único Bun.serve na porta 3000
├── frontend/                      # UI Hextech escura (HTML + Tailwind CDN + JS)
├── data/mock/                     # Partida e timeline realistas para testes offline
└── tests/pipeline.test.ts         # Suíte automatizada (`bun test`)
```

---

## Opção 1 — Testar Rápido pelo Release do GitHub (Windows 10/11 — Executável Único `.exe`)

1. Baixe **`ProjetoLoot-v0.3.1-win-x64.exe`** na aba **Releases** do repositório (**sem `.bat`, sem `.zip`, sem `.env`**).
2. Dê dois cliques no `.exe` — o servidor sobe localmente em `127.0.0.1:3000` (loopback, evitando alertas de firewall) e abre automaticamente o navegador em **`http://localhost:3000`**.
3. *(Opcional)* Clique em **Configurações** no topo da tela para colar sua Riot API Key, definir seu Riot ID padrão, testar a chave em 1 clique ou ajustar o CLI `agy` (salvo automaticamente em `data/settings.json`). Sem chave, o **Modo Demo (Mock)** e **Simular Evento Live** já funcionam na hora.

---

## Opção 2 — Rodar pelo Código-Fonte (Desenvolvimento)

```powershell
# 1. Instale o Bun (se ainda não tiver)
powershell -c "irm bun.sh/install.ps1 | iex"

# 2. Suba o servidor único (API + Frontend na porta 3000)
bun run dev

# 3. Rodar testes automatizados
bun test

# 4. Gerar executável Windows (.exe)
bun run build:win
```

---

## Funcionalidades Implementadas

### Lente 1 — Autópsia Pós-Jogo
- Busca por Riot ID (`Nome#TAG` no BR1), filtro por fila (`Todas`, `Ranked Solo/Duo`, `Ranked Flex`, `Normal`) e lista das últimas 10 partidas com ícones oficiais do Data Dragon (`pt_BR`).
- Condensador determinístico da Timeline (`< 6KB`) cruzando mortes com ouro flutuando, perda de XP/wave e objetivos/torres cedidos.
- Renderização estruturada em 4 blocos: **Fase de Rotas (0–15m)**, **Transição e Macro (15–25m)**, **Ponto de Inflexão (Erro Fatal)** e **Prescrição (3 passos)**.

### Lente 2 — Coach Tático Ao Vivo (Live Coach)
- Polling inteligente *read-only* a cada `12s` em `https://127.0.0.1:2999/liveclientdata/allgamedata` (ignora certificado autoassinado apenas nessa chamada local; *graceful fail* `"Aguardando Partida"`).
- **Loop silencioso (cooldown de 60s):** só invoca o `agy` quando o detector de deltas identifica uma mudança acionável real (Power Spike de item completo do oponente, ouro flutuando `>= 1400g`, atraso de CS `<= -25`, desvantagem de nível crítica, sequência de mortes ou evento de objetivo).
- **UX de combate:** máximo de **2 linhas** por aviso, botão **MUTE**, histórico de avisos com relógio da partida, fila rigorosa sem sobreposição de processos `agy` e botão **Simular Evento Live** para testar mesmo fora de partida.
