const https = require('https');
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

const server = http.createServer((req, res) => {
  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Health check
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, corsHeaders());
    res.end(JSON.stringify({ ok: true, service: 'meu-funil-proxy' }));
    return;
  }

  // Proxy para Google Apps Script
  if (req.url.startsWith('/proxy')) {
    const parsed = url.parse(req.url, true);
    const gsUrl = parsed.query.gsUrl;

    if (!gsUrl) {
      res.writeHead(400, corsHeaders());
      res.end(JSON.stringify({ ok: false, error: 'gsUrl obrigatório' }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const payload = encodeURIComponent(JSON.stringify(data));
          const targetUrl = gsUrl + '?action=write&data=' + payload;
          const parsedTarget = url.parse(targetUrl);

          const options = {
            hostname: parsedTarget.hostname,
            path: parsedTarget.path,
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          };

          const proxyReq = https.request(options, (proxyRes) => {
            let responseData = '';
            proxyRes.on('data', chunk => { responseData += chunk; });
            proxyRes.on('end', () => {
              res.writeHead(200, corsHeaders());
              res.end(responseData || JSON.stringify({ ok: true }));
            });
          });

          proxyReq.on('error', (e) => {
            res.writeHead(500, corsHeaders());
            res.end(JSON.stringify({ ok: false, error: e.message }));
          });

          proxyReq.end();
        } catch (e) {
          res.writeHead(400, corsHeaders());
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
    } else if (req.method === 'GET') {
      // Leitura — repassa GET para o Apps Script
      const action = parsed.query.action || 'read';
      const targetUrl = gsUrl + '?action=' + action;
      const parsedTarget = url.parse(targetUrl);

      const proxyReq = https.request({
        hostname: parsedTarget.hostname,
        path: parsedTarget.path,
        method: 'GET'
      }, (proxyRes) => {
        let responseData = '';
        proxyRes.on('data', chunk => { responseData += chunk; });
        proxyRes.on('end', () => {
          res.writeHead(200, corsHeaders());
          res.end(responseData);
        });
      });

      proxyReq.on('error', (e) => {
        res.writeHead(500, corsHeaders());
        res.end(JSON.stringify({ ok: false, error: e.message }));
      });

      proxyReq.end();
    } else {
      res.writeHead(405, corsHeaders());
      res.end(JSON.stringify({ ok: false, error: 'Método não permitido' }));
    }
    return;
  }

  res.writeHead(404, corsHeaders());
  res.end(JSON.stringify({ ok: false, error: 'Rota não encontrada' }));
});

server.listen(PORT, () => {
  console.log('Meu Funil Proxy rodando na porta ' + PORT);
});
