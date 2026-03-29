/**
 * Servidor HTTP otimizado para servir o build estático Next.js
 * com headers de cache corretos para máxima performance no PageSpeed.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json',
  '.txt':  'text/plain',
};

// Assets com hash no nome (/_next/static/) → cache imutável por 1 ano
// HTML → sem cache (sempre fresco)
function getCacheHeaders(filePath, urlPath) {
  if (urlPath.includes('/_next/static/')) {
    return {
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
  }
  if (urlPath.endsWith('.html') || urlPath === '/') {
    return {
      'Cache-Control': 'public, max-age=0, must-revalidate',
    };
  }
  return {
    'Cache-Control': 'public, max-age=3600',
  };
}

const compressible = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.map']);

function serveFile(req, res, filePath, urlPath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Try index.html for SPA fallback
      if (!filePath.endsWith('index.html')) {
        const fallback = path.join(ROOT, 'index.html');
        return serveFile(req, res, fallback, '/');
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const cacheHeaders = getCacheHeaders(filePath, urlPath);
    const acceptEncoding = req.headers['accept-encoding'] || '';

    const headers = {
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      ...cacheHeaders,
    };

    if (compressible.has(ext) && acceptEncoding.includes('br')) {
      // Brotli compression
      headers['Content-Encoding'] = 'br';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      const stream = fs.createReadStream(filePath);
      stream.pipe(zlib.createBrotliCompress()).pipe(res);
    } else if (compressible.has(ext) && acceptEncoding.includes('gzip')) {
      // Gzip compression
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      const stream = fs.createReadStream(filePath);
      stream.pipe(zlib.createGzip()).pipe(res);
    } else {
      headers['Content-Length'] = stat.size;
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  });
}

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0]; // strip query string

  // Security: prevent directory traversal
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');

  let filePath = path.join(ROOT, safePath);

  // If directory, serve index.html
  if (safePath === '/' || safePath === '') {
    filePath = path.join(ROOT, 'index.html');
  } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  serveFile(req, res, filePath, urlPath);
});

server.listen(PORT, () => {
  console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`   Headers de cache otimizados ativados`);
  console.log(`   Compressão Brotli/Gzip ativada\n`);
});
