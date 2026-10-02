import 'sonner';

declare module 'sonner' {
  /**
   * sonner reads `closeButtonAriaLabel` from the Toaster and falls back to the
   * English "Close toast", but its published 1.7.1 types do not declare the
   * prop. The app is Persian, so the close button must not announce itself in
   * English (AGENTS.md section 8: Persian aria-labels).
   */
  interface ToasterProps {
    closeButtonAriaLabel?: string;
    /** The toast region's aria-label, English ("Notifications alt+T") by default. */
    containerAriaLabel?: string;
  }
}
