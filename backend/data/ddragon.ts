import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config";

export interface DDragonCatalog {
  version: string;
  items: Record<string, { name: string; totalGold: number }>;
  spells: Record<string, string>;
  runes: Record<string, string>;
}

const FALLBACK_VERSION = "15.22.1";

const FALLBACK_SPELLS: Record<string, string> = {
  "1": "Purificar",
  "3": "Exaustão",
  "4": "Flash",
  "6": "Fantasma",
  "7": "Curar",
  "11": "Golpear",
  "12": "Teleporte",
  "14": "Incendiar",
  "21": "Barreira",
  "32": "Marca",
};

const FALLBACK_RUNES: Record<string, string> = {
  "8005": "Pressione o Ataque",
  "8008": "Ritmo Fatal",
  "8010": "Conquistador",
  "8021": "Agilidade nos Pés",
  "8112": "Eletrocutar",
  "8128": "Colheita Sombria",
  "9923": "Chuva de Lâminas",
  "8214": "Invocar Aery",
  "8229": "Cometa Arcano",
  "8230": "Ímpeto Gradual",
  "8437": "Aperto dos Mortos-Vivos",
  "8439": "Pós-Choque",
  "8465": "Guardião",
  "8351": "Aprimoramento Glacial",
  "8360": "Livro de Feitiços Deslacrado",
  "8369": "Primeiro Ataque",
};

const FALLBACK_ITEMS: Record<string, { name: string; totalGold: number }> = {
  "1054": { name: "Escudo de Doran", totalGold: 450 },
  "1055": { name: "Lâmina de Doran", totalGold: 450 },
  "1056": { name: "Anel de Doran", totalGold: 400 },
  "2055": { name: "Sentinela de Controle", totalGold: 75 },
  "3006": { name: "Grevas do Berserker", totalGold: 1100 },
  "3020": { name: "Sapatos do Feiticeiro", totalGold: 1100 },
  "3047": { name: "Botas Galvanizadas de Aço", totalGold: 1200 },
  "3111": { name: "Passos de Mercúrio", totalGold: 1200 },
  "3158": { name: "Botas Ionianas da Lucidez", totalGold: 900 },
  "3078": { name: "Força da Trindade", totalGold: 3333 },
  "3071": { name: "Cutelo Negro", totalGold: 3000 },
  "3053": { name: "Sinal de Sterak", totalGold: 3200 },
  "3153": { name: "Espada do Rei Destruído", totalGold: 3200 },
  "3157": { name: "Ampulheta de Zhonya", totalGold: 3250 },
  "3089": { name: "Capuz da Morte de Rabadon", totalGold: 3600 },
  "3115": { name: "Dente de Na'Shor", totalGold: 3000 },
  "6655": { name: "Companheiro de Luden", totalGold: 2850 },
  "6653": { name: "Tormento de Liandry", totalGold: 3000 },
  "3031": { name: "Gume do Infinito", totalGold: 3600 },
  "3036": { name: "Lembranças do Lorde Dominik", totalGold: 3000 },
  "3142": { name: "Lâmina Fantasma de Youmuu", totalGold: 2800 },
  "6692": { name: "Eclipse", totalGold: 2900 },
  "3074": { name: "Hidra Raivosa", totalGold: 3300 },
  "3748": { name: "Hidra Titânica", totalGold: 3300 },
  "3340": { name: "Sentinela Invisível", totalGold: 0 },
  "3363": { name: "Alteração Vidente", totalGold: 0 },
  "3364": { name: "Lente do Oráculo", totalGold: 0 },
};

const memoryCache = new Map<string, DDragonCatalog>();
let latestVersionCache: string | null = null;

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao buscar ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getLatestDDragonVersion(): Promise<string> {
  if (latestVersionCache) return latestVersionCache;

  const versionsPath = resolve(config.paths.ddragon, "latest_version.txt");
  try {
    const versions = await fetchJsonWithTimeout<string[]>(
      "https://ddragon.leagueoflegends.com/api/versions.json",
      5000
    );
    if (Array.isArray(versions) && versions[0]) {
      latestVersionCache = versions[0];
      await Bun.write(versionsPath, latestVersionCache);
      return latestVersionCache;
    }
  } catch {
    if (existsSync(versionsPath)) {
      const cached = (await Bun.file(versionsPath).text()).trim();
      if (cached) {
        latestVersionCache = cached;
        return cached;
      }
    }
  }

  latestVersionCache = FALLBACK_VERSION;
  return latestVersionCache;
}

export function extractPatchFromGameVersion(gameVersion?: string): string {
  if (!gameVersion) return FALLBACK_VERSION;
  const parts = gameVersion.split(".");
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}.1`;
  }
  return FALLBACK_VERSION;
}

export async function getDDragonCatalog(
  preferredVersion?: string
): Promise<DDragonCatalog> {
  const version = preferredVersion || (await getLatestDDragonVersion());
  const cachedMem = memoryCache.get(version);
  if (cachedMem) return cachedMem;

  const versionDir = resolve(config.paths.ddragon, version);
  const catalogFile = resolve(versionDir, "catalog_pt_BR.json");

  if (existsSync(catalogFile)) {
    try {
      const parsed = (await Bun.file(catalogFile).json()) as DDragonCatalog;
      memoryCache.set(version, parsed);
      return parsed;
    } catch {
      // Recria se estiver corrompido
    }
  }

  try {
    const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR`;
    const [itemsRaw, spellsRaw, runesRaw] = await Promise.all([
      fetchJsonWithTimeout<{
        data: Record<string, { name: string; gold?: { total?: number } }>;
      }>(`${base}/item.json`),
      fetchJsonWithTimeout<{
        data: Record<string, { key: string; name: string }>;
      }>(`${base}/summoner.json`),
      fetchJsonWithTimeout<
        Array<{
          id: number;
          name: string;
          slots: Array<{ runes: Array<{ id: number; name: string }> }>;
        }>
      >(`${base}/runesReforged.json`),
    ]);

    const items: Record<string, { name: string; totalGold: number }> = {
      ...FALLBACK_ITEMS,
    };
    for (const [id, info] of Object.entries(itemsRaw.data ?? {})) {
      items[id] = {
        name: info.name,
        totalGold: info.gold?.total ?? 0,
      };
    }

    const spells: Record<string, string> = { ...FALLBACK_SPELLS };
    for (const spell of Object.values(spellsRaw.data ?? {})) {
      spells[spell.key] = spell.name;
    }

    const runes: Record<string, string> = { ...FALLBACK_RUNES };
    for (const tree of runesRaw ?? []) {
      runes[String(tree.id)] = tree.name;
      for (const slot of tree.slots ?? []) {
        for (const rune of slot.runes ?? []) {
          runes[String(rune.id)] = rune.name;
        }
      }
    }

    const catalog: DDragonCatalog = { version, items, spells, runes };
    mkdirSync(versionDir, { recursive: true });
    await Bun.write(catalogFile, JSON.stringify(catalog));
    memoryCache.set(version, catalog);
    return catalog;
  } catch {
    const fallback: DDragonCatalog = {
      version: FALLBACK_VERSION,
      items: FALLBACK_ITEMS,
      spells: FALLBACK_SPELLS,
      runes: FALLBACK_RUNES,
    };
    memoryCache.set(version, fallback);
    return fallback;
  }
}

export function getItemName(catalog: DDragonCatalog, itemId: number): string {
  if (!itemId || itemId <= 0) return "";
  return catalog.items[String(itemId)]?.name ?? `Item #${itemId}`;
}

export function isCompletedItem(catalog: DDragonCatalog, itemId: number): boolean {
  if (!itemId || itemId <= 0) return false;
  const info = catalog.items[String(itemId)];
  return Boolean(info && info.totalGold >= 2200);
}

export function getSpellName(catalog: DDragonCatalog, spellId: number): string {
  return catalog.spells[String(spellId)] ?? `Feitiço #${spellId}`;
}

export function getRuneName(catalog: DDragonCatalog, runeId?: number): string {
  if (!runeId) return "Desconhecida";
  return catalog.runes[String(runeId)] ?? `Runa #${runeId}`;
}

export function getChampionIconUrl(version: string, championName: string): string {
  const normalized = championName === "FiddleSticks" ? "Fiddlesticks" : championName;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${normalized}.png`;
}

export function getItemIconUrl(version: string, itemId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}
