// Visit this function's URL (with ?user=<email>) to start a login for that
// specific person. NinjaOne will ask them to sign in and approve access,
// then redirect to oauth-callback with a code it exchanges for tokens.
// The email travels through as the OAuth "state" parameter, which NinjaOne
// echoes back unchanged — that's how the callback knows whose tokens these are.
exports.handler = async (event) => {
  const userEmail = (event.queryStringParameters || {}).user;

  if (!userEmail) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Missing "user" query parameter — this link should be opened from the web part\'s "Connect your account" button, not visited directly.'
    };
  }

  const instance = process.env.NINJA_INSTANCE;
  const clientId = process.env.NINJA_CLIENT_ID;
  const redirectUri = process.env.NINJA_REDIRECT_URI;

  const state = Buffer.from(
    JSON.stringify({ email: userEmail, nonce: Math.random().toString(36).slice(2) })
  ).toString('base64');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    // offline_access is what makes NinjaOne issue a refresh_token alongside
    // the access_token — without it we'd only get a short-lived token back.
    scope: 'monitoring management control offline_access',
    state
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://${instance}/ws/oauth/authorize?${params.toString()}`
    }
  };
};
