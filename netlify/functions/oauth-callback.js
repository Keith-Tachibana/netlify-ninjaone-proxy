const { getStore } = require('@netlify/blobs');

// NinjaOne redirects here after a person approves the login. We exchange
// the code for tokens and store the refresh token in Netlify Blobs, keyed
// by their email (decoded from the state parameter) — no manual copy-paste
// into environment variables needed anymore.
exports.handler = async (event) => {
  const params = event.queryStringParameters || {};

  if (params.error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/plain' },
      body: `NinjaOne returned an error: ${params.error} — ${params.error_description || ''}`
    };
  }

  if (!params.code || !params.state) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Missing code or state parameter.' };
  }

  let email;
  try {
    const decoded = JSON.parse(Buffer.from(params.state, 'base64').toString('utf8'));
    email = decoded.email;
  } catch (err) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Invalid state parameter.' };
  }

  const instance = process.env.NINJA_INSTANCE;
  const tokenUrl = `https://${instance}/ws/oauth/token`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: process.env.NINJA_REDIRECT_URI,
    client_id: process.env.NINJA_CLIENT_ID,
    client_secret: process.env.NINJA_CLIENT_SECRET
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'text/plain' },
        body: `Token exchange failed: ${JSON.stringify(data)}`
      };
    }

    if (!data.refresh_token) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Login succeeded, but no refresh_token came back — double check the offline_access scope was included and approved.'
      };
    }

    const store = getStore('ninja-user-tokens');
    await store.setJSON(email, { refreshToken: data.refresh_token, updatedAt: Date.now() });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body style="font-family: sans-serif; padding: 24px;">
        <p>You're connected as <strong>${email}</strong>.</p>
        <p>You can close this tab and go back to SharePoint — comments you post will now show up under your name.</p>
      </body></html>`
    };
  } catch (err) {
    return { statusCode: 502, headers: { 'Content-Type': 'text/plain' }, body: `Error: ${err.message}` };
  }
};
