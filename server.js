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

// Faz GET seguindo redirecionamentos automaticamente
function fetchWithRedirects(targetUrl, maxRedirects, callback) {
  if (maxRedirects < 0) {
    return callback(new Error('Muitos redirecionamentos'), null);
  }
  const parsedUrl = url.parse(targetUrl);
  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    method: 'GET',
    headers: { 'User-Agent': 'MeuFunilProxy/1.0' }
  };
  const req = https.request(options, (res) => {
    // Segue redirecionamento 301/302
    if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
      return fetchWithRedirects(res.headers.location, maxRedirects - 1, callback);
    }
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => callback(null, data));
  });
  req.on('error', (e) => callback(e, null));
  req.end();
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, corsHeaders());
    res.end(JSON.stringify({ ok: true, service: 'meu-funil-proxy', version: '2' }));
    return;
  }

  if (req.url.startsWith('/proxy')) {
    const parsed = url.parse(req.url, true);
    const gsUrl = parsed.query.gsUrl;

    if (!gsUrl) {
      res.writeHead(400, corsHeaders());
      res.end(JSON.stringify({ ok: false, error: 'gsUrl obrigatorio' }));
      return;
    }

    if (req.method === 'POST') {
      // GRAVACAO — recebe JSON do app e envia para o Apps Script via GET com redirecionamento
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const payload = encodeURIComponent(JSON.stringify(data));
          const targetUrl = gsUrl + '?action=write&data=' + payload;
          fetchWithRedirects(targetUrl, 5, (err, responseData) => {
            if (err) {
              res.writeHead(500, corsHeaders());
              res.end(JSON.stringify({ ok: false, error: err.message }));
              return;
            }
            try {
              const j = JSON.parse(responseData);
              res.writeHead(200, corsHeaders());
              res.end(JSON.stringify(j));
            } catch(e) {
              // Apps Script respondeu mas não é JSON — ainda assim ok
              res.writeHead(200, corsHeaders());
              res.end(JSON.stringify({ ok: true }));
            }
          });
        } catch (e) {
          res.writeHead(400, corsHeaders());
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });

    } else if (req.method === 'GET') {
      // LEITURA — segue redirecionamento e retorna dados
      const action = parsed.query.action || 'read';
      const targetUrl = gsUrl + '?action=' + action;
      fetchWithRedirects(targetUrl, 5, (err, responseData) => {
        if (err) {
          res.writeHead(500, corsHeaders());
          res.end(JSON.stringify({ ok: false, error: err.message }));
          return;
        }
        try {
          const j = JSON.parse(responseData);
          res.writeHead(200, corsHeaders());
          res.end(JSON.stringify(j));
        } catch(e) {
          res.writeHead(500, corsHeaders());
          res.end(JSON.stringify({ ok: false, error: 'Resposta invalida do Apps Script', raw: responseData.slice(0, 200) }));
        }
      });
    } else {
      res.writeHead(405, corsHeaders());
      res.end(JSON.stringify({ ok: false, error: 'Metodo nao permitido' }));
    }
    return;
  }

  res.writeHead(404, corsHeaders());
  res.end(JSON.stringify({ ok: false, error: 'Rota nao encontrada' }));
});

server.listen(PORT, () => {
  console.log('Meu Funil Proxy v2 rodando na porta ' + PORT);
});
