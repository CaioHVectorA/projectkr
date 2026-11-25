import { existsSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import embeddedAppJs from "../../frontend/app.js" with { type: "text" };
import embeddedIndexHtml from "../../frontend/index.html" with { type: "text" };
import embeddedStylesCss from "../../frontend/styles.css" with { type: "text" };
import { config } from "../config";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const EMBEDDED_ASSETS: Record<string, { content: string; contentType: string }> =
  {
    "/index.html": {
      content: embeddedIndexHtml,
      contentType: "text/html; charset=utf-8",
    },
    "/styles.css": {
      content: embeddedStylesCss,
      contentType: "text/css; charset=utf-8",
    },
    "/app.js": {
      content: embeddedAppJs,
      contentType: "application/javascript; charset=utf-8",
    },
  };

/**
 * Em desenvolvimento lê direto de /frontend no disco (reload imediato).
 * Quando compilado em executável standalone (.exe), usa os assets embutidos no binário.
 */
export function serveFrontendAsset(pathname: string): Response {
  const target = pathname === "/" ? "/index.html" : pathname;
  const normalized = resolve(config.paths.frontend, `.${target}`);

  if (
    normalized !== config.paths.frontend &&
    !normalized.startsWith(config.paths.frontend + sep)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  if (existsSync(normalized)) {
    const ext = extname(normalized).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(Bun.file(normalized), {
      headers: { "Content-Type": contentType },
    });
  }

  const embedded = EMBEDDED_ASSETS[target];
  if (embedded) {
    return new Response(embedded.content, {
      headers: { "Content-Type": embedded.contentType },
    });
  }

  return new Response("Not Found", { status: 404 });
}
