// Simple in-memory token cache — good enough for a single warm instance;
// a cold start just means one extra token request.
let cachedToken = null;
let tokenExpiresAt = 0;

// Only these NinjaOne path prefixes can be reached through this proxy.
// Widen deliberately as you need more of the API — keep the check itself.
const ALLOWED_PATH_PREFIXES = ['/v2/ticketing/'];

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 30000) {
    return cachedToken;
  }

  const instance = process.env.NINJA_INSTANCE;
  const tokenUrl = `https://${instance}/ws/oauth/token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.NINJA_CLIENT_ID,
    client_secret: process.env.NINJA_CLIENT_SECRET,
    scope: 'management'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`NinjaOne token request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

function isPathAllowed(path) {
  return ALLOWED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-proxy-key'
  };
}

// Call shape: GET/POST/PATCH/PUT/DELETE to
//   /.netlify/functions/ninja?path=/v2/ticketing/ticket
// with header x-proxy-key: <PROXY_SHARED_KEY>. Netlify has no built-in
// per-function key like Azure does, so this header is our own auth check.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  const providedKey = event.headers['x-proxy-key'] || event.headers['X-Proxy-Key'];
  if (!providedKey || providedKey !== process.env.PROXY_SHARED_KEY) {
    return {
      statusCode: 401,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Missing or invalid proxy key' })
    };
  }

  const params = event.queryStringParameters || {};
  const targetPath = params.path;

  if (!targetPath || !isPathAllowed(targetPath)) {
    return {
      statusCode: 403,
      headers: corsHeaders(),
      body: JSON.stringify({ error: `Path not allowed through this proxy: ${targetPath}` })
    };
  }

  try {
    const token = await getAccessToken();
    const url = new URL(`https://${process.env.NINJA_INSTANCE}${targetPath}`);

    for (const [key, value] of Object.entries(params)) {
      if (key !== 'path') {
        url.searchParams.set(key, value);
      }
    }

    const init = {
      method: event.httpMethod,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    };

    if (['POST', 'PATCH', 'PUT'].includes(event.httpMethod)) {
      init.headers['Content-Type'] = 'application/json';
      init.body = event.body;
    }

    const ninjaResponse = await fetch(url.toString(), init);
    const contentType = ninjaResponse.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await ninjaResponse.json()
      : await ninjaResponse.text();

    return {
      statusCode: ninjaResponse.status,
      headers: corsHeaders(),
      body: JSON.stringify(typeof payload === 'string' ? { raw: payload } : payload)
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to reach NinjaOne API', detail: err.message })
    };
  }
};
