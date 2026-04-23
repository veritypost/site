'use client';

// Re-export so callers can import ToastProvider from its own file
// (matches the spec list). All actual logic lives in Toast.jsx.
export { ToastProvider as default, ToastProvider, useToast } from './Toast';

/**
 * @example
 * import ToastProvider from '@/components/admin/ToastProvider';
 * <ToastProvider><AdminApp /></ToastProvider>
 */
