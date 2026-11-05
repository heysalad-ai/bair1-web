"use client";

import { Auth0Provider } from "@auth0/auth0-react";

export default function Auth0ProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Auth0Provider
      domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN!}
      clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!}
      authorizationParams={{
        redirect_uri: typeof window !== "undefined" ? window.location.origin : "",
      }}
      cacheLocation="localstorage"
      onRedirectCallback={(appState) => {
        if (appState?.returnTo === "/firmware#installer") window.location.replace("/firmware#installer");
        else window.history.replaceState({}, document.title, window.location.pathname);
      }}
    >
      {children}
    </Auth0Provider>
  );
}
