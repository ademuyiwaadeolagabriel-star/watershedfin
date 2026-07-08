// Frontend auth helper — manages JWT token in memory + localStorage
// Used by all API calls to include the Bearer token

const TOKEN_KEY = 'watershed_auth_token';

/** Get the current JWT token from localStorage */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** Save the JWT token after login */
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

/** Clear the JWT token on logout */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

/** Add Authorization header to fetch options */
export function withAuth(options: RequestInit = {}): RequestInit {
  const token = getAuthToken();
  if (!token) return options;

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  return { ...options, headers };
}

/** Authenticated fetch — automatically adds Bearer token */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, withAuth(options));

  // If 401, clear token (expired/invalid) — the app will redirect to login
  if (response.status === 401) {
    clearAuthToken();
  }

  return response;
}
