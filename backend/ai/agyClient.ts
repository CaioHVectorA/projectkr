import { config, type AppConfig } from "../config";

export interface AgyExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  mode: "arg" | "stdin";
  promptBytes: number;
}

export class AgyExecutionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "AGY_TIMEOUT"
      | "AGY_NOT_FOUND"
      | "AGY_NON_ZERO_EXIT"
      | "AGY_EMPTY_OUTPUT"
      | "AGY_SPAWN_ERROR",
    public readonly details?: string
  ) {
    super(message);
    this.name = "AgyExecutionError";
  }
}

interface QueueJob {
  prompt: string;
  resolve: (value: AgyExecutionResult) => void;
  reject: (reason?: unknown) => void;
}

/**
 * Camada de IA: Motor cognitivo local do PROJETO LOOT.
 * Padrão Produtor-Consumidor: garante que apenas 1 instância do CLI `agy`
 * execute por vez, com timeout rígido e log de auditoria em /data/last_*.txt.
 */
export class AgyQueueClient {
  private queue: QueueJob[] = [];
  private isProcessing = false;
  private activePid: number | null = null;

  constructor(private readonly cfg: AppConfig = config) {}

  getStatus(): {
    busy: boolean;
    pendingCount: number;
    activePid: number | null;
    bin: string;
    mode: "arg" | "stdin";
    timeoutMs: number;
  } {
    return {
      busy: this.isProcessing,
      pendingCount: this.queue.length,
      activePid: this.activePid,
      bin: this.cfg.agyBin,
      mode: this.cfg.agyMode,
      timeoutMs: this.cfg.agyTimeoutMs,
    };
  }

  enqueue(prompt: string): Promise<AgyExecutionResult> {
    return new Promise<AgyExecutionResult>((resolve, reject) => {
      this.queue.push({ prompt, resolve, reject });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.isProcessing) return;
    const next = this.queue.shift();
    if (!next) return;

    this.isProcessing = true;
    try {
      const result = await this.executeSingle(next.prompt);
      next.resolve(result);
    } catch (err) {
      next.reject(err);
    } finally {
      this.isProcessing = false;
      this.activePid = null;
      if (this.queue.length > 0) {
        void this.drain();
      }
    }
  }

  private async executeSingle(prompt: string): Promise<AgyExecutionResult> {
    const startTime = Date.now();
    const promptBytes = Buffer.byteLength(prompt, "utf8");

    await Bun.write(this.cfg.paths.lastPrompt, prompt);

    const cmd =
      this.cfg.agyMode === "stdin"
        ? [this.cfg.agyBin, "-p", "-"]
        : [this.cfg.agyBin, "-p", prompt];

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(cmd, {
        stdin: this.cfg.agyMode === "stdin" ? "pipe" : "ignore",
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
      });
    } catch (err) {
      const msg = (err as Error).message || String(err);
      await Bun.write(
        this.cfg.paths.lastResponse,
        `[ERRO SPAWN AGY]\n${msg}\n`
      );
      if (/ENOENT|not found|cannot find/i.test(msg)) {
        throw new AgyExecutionError(
          `CLI "${this.cfg.agyBin}" não encontrado no PATH. Abra "Configurações" no topo do app para informar o caminho do executável agy (ou marque "Simular AGY").`,
          "AGY_NOT_FOUND",
          msg
        );
      }
      throw new AgyExecutionError(
        `Falha ao iniciar processo "${this.cfg.agyBin}": ${msg}`,
        "AGY_SPAWN_ERROR",
        msg
      );
    }

    this.activePid = proc.pid;

    if (
      this.cfg.agyMode === "stdin" &&
      proc.stdin &&
      typeof proc.stdin !== "number"
    ) {
      try {
        proc.stdin.write(prompt);
        await proc.stdin.end();
      } catch {
        // Processo pode ter encerrado cedo; stdout/stderr capturam o motivo
      }
    }

    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill(9);
      } catch {
        try {
          proc.kill();
        } catch {
          // Ignora se já encerrou
        }
      }
    }, this.cfg.agyTimeoutMs);

    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        proc.stdout && typeof proc.stdout !== "number"
          ? new Response(proc.stdout).text()
          : Promise.resolve(""),
        proc.stderr && typeof proc.stderr !== "number"
          ? new Response(proc.stderr).text()
          : Promise.resolve(""),
        proc.exited,
      ]);

      const durationMs = Date.now() - startTime;

      const auditDump = [
        `# exitCode: ${exitCode} | durationMs: ${durationMs} | mode: ${this.cfg.agyMode} | timedOut: ${timedOut}`,
        stdout,
        stderr ? `\n--- STDERR ---\n${stderr}` : "",
      ].join("\n");
      await Bun.write(this.cfg.paths.lastResponse, auditDump);

      if (timedOut) {
        throw new AgyExecutionError(
          `O processo "${this.cfg.agyBin}" excedeu o timeout de ${Math.round(
            this.cfg.agyTimeoutMs / 1000
          )}s e foi encerrado automaticamente.`,
          "AGY_TIMEOUT",
          stderr.trim() || undefined
        );
      }

      if (exitCode !== 0) {
        throw new AgyExecutionError(
          `O CLI "${this.cfg.agyBin}" retornou código de erro ${exitCode}. ${
            stderr.trim().slice(0, 240) || "Verifique /data/last_response.txt."
          }`,
          "AGY_NON_ZERO_EXIT",
          stderr.trim() || stdout.trim()
        );
      }

      const trimmedOut = stdout.trim();
      if (!trimmedOut) {
        throw new AgyExecutionError(
          `O CLI "${this.cfg.agyBin}" finalizou com sucesso mas retornou saída vazia.`,
          "AGY_EMPTY_OUTPUT",
          stderr.trim() || undefined
        );
      }

      return {
        stdout: trimmedOut,
        stderr: stderr.trim(),
        exitCode,
        durationMs,
        mode: this.cfg.agyMode,
        promptBytes,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export const agyClient = new AgyQueueClient(config);
