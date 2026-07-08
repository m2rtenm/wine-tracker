import { WebStorageStateStore } from 'oidc-client-ts';

// The redirect/logout target is derived from the current origin at runtime so a
// single build works across the CloudFront domain, custom aliases, and
// localhost dev — each of those origins is registered in the Cognito app
// client's callback/logout URLs by Terraform.
const appOrigin = `${window.location.origin}/`;

const hostedUiDomain = import.meta.env.VITE_COGNITO_HOSTED_UI;

export const cognitoAuthConfig = {
  authority: import.meta.env.VITE_COGNITO_AUTHORITY,
  client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirect_uri: appOrigin,
  response_type: 'code',
  scope: 'openid email profile',
  // Skip the Cognito IdP chooser and go straight to Google.
  extraQueryParams: { identity_provider: 'Google' },
  // Persist the session across reloads.
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  // Strip ?code and ?state from the URL once the sign-in redirect completes.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

// Cognito's OIDC discovery document does not advertise an end_session_endpoint,
// so logout uses the Hosted UI's non-standard /logout endpoint directly.
export function buildLogoutUrl() {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
    logout_uri: appOrigin,
  });
  return `${hostedUiDomain}/logout?${params.toString()}`;
}
