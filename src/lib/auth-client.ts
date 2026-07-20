// Frontend auth helper — manages JWT token in localStorage
// Used by all API calls to include the Bearer token

const ADMIN_TOKEN_KEY = 'watershed_admin_token';
const CUSTOMER_TOKEN_KEY = 'watershed_customer_token';

/** Get the current JWT token from localStorage (checks admin first, then customer) */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

/** Save the admin JWT token after login */
export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

/** Save the customer JWT token after login */
export function setCustomerAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
}

/** Clear the admin JWT token on logout */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/** Clear the customer JWT token on logout */
export function clearCustomerAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
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

  // G3: If 401, clear token and redirect to login
  if (response.status === 401) {
    clearAuthToken();
    clearCustomerAuthToken();
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (!currentPath.includes('login') && !currentPath.includes('setup')) {
        setTimeout(() => {
          window.location.href = '/';
        }, 100);
      }
    }
  }

  return response;
}
