/**
 * Validates and normalizes a user-provided external HTTP/HTTPS URL.
 * Rejects non-HTTP(S) schemes (e.g. `javascript:`, `data:`).
 */
export function normalizeExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed);
  if (hasScheme && !/^https?:/i.test(trimmed)) {
    return null;
  }

  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Returns a short human-readable label for common student link domains.
 */
export function getFriendlyLinkLabel(urlString: string): string {
  try {
    const host = new URL(urlString).hostname.replace(/^www\./, '');
    if (host.includes('zoom.us')) return 'Zoom';
    if (host.includes('meet.google.com')) return 'Google Meet';
    if (host.includes('t.me') || host.includes('telegram')) return 'Telegram';
    if (host.includes('docs.google.com')) return 'Google Docs';
    if (host.includes('drive.google.com')) return 'Google Drive';
    if (host.includes('classroom.google.com')) return 'Classroom';
    if (host.includes('github.com')) return 'GitHub';
    return host;
  } catch {
    return 'Посилання';
  }
}
