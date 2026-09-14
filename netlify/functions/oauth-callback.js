// NinjaOne redirects here after you approve the login. We exchange the code
// for tokens and display the refresh_token so you can copy it into your
// Netlify environment variables as NINJA_REFRESH_TOKEN — this is a one-time
// manual step since a serverless function can't update its own site config.
exports.handler = async (event) => {
  const params = event.queryStringParameters || {};

  if (params.error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/plain' },
      body: `NinjaOne returned an error: ${params.error} — ${params.error_description || ''}`
    };
  }

  if (!params.code) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Missing code parameter.' };
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body:
        'Login succeeded. Copy the value below into your Netlify site\'s environment variables ' +
        'as NINJA_REFRESH_TOKEN (Site configuration > Environment variables), then redeploy:\n\n' +
        data.refresh_token
    };
  } catch (err) {
    return { statusCode: 502, headers: { 'Content-Type': 'text/plain' }, body: `Error: ${err.message}` };
  }
};
