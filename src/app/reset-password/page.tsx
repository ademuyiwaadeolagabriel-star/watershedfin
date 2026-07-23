// v41: /reset-password page route
// This is a thin wrapper that re-exports the main app shell (page.tsx).
// The app shell detects the token query param on mount and renders the
// ResetPasswordView component. This ensures the email reset link works
// without breaking the single-page app architecture.
export { default } from '../page';
