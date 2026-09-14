// Visit this function's URL once in a browser to kick off the one-time
// login. NinjaOne will ask you to sign in and approve access, then redirect
// to the oauth-callback function with a code it exchanges for tokens.
exports.handler = async () => {
  const instance = process.env.NINJA_INSTANCE;
  const clientId = process.env.NINJA_CLIENT_ID;
  const redirectUri = process.env.NINJA_REDIRECT_URI;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    // offline_access is what makes NinjaOne issue a refresh_token alongside
    // the access_token — without it we'd only get a short-lived token back.
    scope: 'monitoring management control offline_access',
    state: 'ninja-proxy-setup'
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://${instance}/ws/oauth/authorize?${params.toString()}`
    }
  };
};
