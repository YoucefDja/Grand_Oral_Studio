/**
 * Serveur statique minimal pour le build de production (dist/).
 * Gère le fallback SPA : toute route inconnue renvoie index.html, ce qui
 * permet les deep links vers /admin.
 *
 * Utilisé par le service Railway "tension-frontend" (npm start).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const requested = normalize(join(DIST, urlPath));

    // Sécurité : on reste dans dist/
    if (!requested.startsWith(DIST)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let filePath = requested;
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      /* pas un fichier → fallback SPA */
      filePath = join(DIST, 'index.html');
    }

    const content = await readFile(filePath).catch(() => null);
    if (!content) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Server error');
  }
}).listen(PORT, () => {
  console.log(`Tension frontend servi sur le port ${PORT} (dist/).`);
});
