const TOKEN_KEY = "stocksense_token";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

// Client-side fetch interceptor to guarantee all /api calls in this tab attach the tab's Bearer token
let isInterceptorSetup = false;

export function setupFetchInterceptor(): void {
  if (typeof window === "undefined" || isInterceptorSetup) return;
  isInterceptorSetup = true;

  const originalFetch = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    
    // Do not attach token to public authentication routes
    const isPublicAuthRoute =
      url.includes("/api/auth/login") ||
      url.includes("/api/auth/signup") ||
      url.includes("/api/auth/forgot-password") ||
      url.includes("/api/auth/reset-password");

    const isApiRoute = url.startsWith("/api/") || url.includes("/api/");

    if (isApiRoute && !isPublicAuthRoute) {
      const token = getSessionToken();
      if (token) {
        const headers = new Headers(init?.headers);
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        return originalFetch(input, { ...init, headers });
      }
    }

    return originalFetch(input, init);
  };
}
