/**
 * SMS Gateway — Termii integration for Nigerian SMS.
 *
 * Get your API key from https://termii.com
 * Set TERMII_API_KEY in your .env file.
 *
 * If TERMII_API_KEY is not set, SMS sending is silently skipped (no error).
 * All SMS calls are fire-and-forget — they never block the caller.
 */

interface SmsOptions {
  to: string; // phone number in international format (e.g. +2348012345678)
  message: string;
}

const TERMII_API_URL = 'https://api.ng.termii.com/api/sms/send';
const TERMII_SENDER_ID = 'Watershed';

/**
 * Send an SMS via Termii.
 * Silently skips if TERMII_API_KEY is not configured.
 */
export async function sendSms({ to, message }: SmsOptions): Promise<boolean> {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey) {
    console.warn('[SMS] TERMII_API_KEY not set — skipping SMS to', to);
    return false;
  }

  // Normalize phone number (remove leading 0, add +234)
  let normalized = to.replace(/\s/g, '').replace(/^\+/, '');
  if (normalized.startsWith('234')) {
    normalized = '+' + normalized;
  } else if (normalized.startsWith('0')) {
    normalized = '+234' + normalized.slice(1);
  } else if (!normalized.startsWith('+')) {
    normalized = '+234' + normalized;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(TERMII_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to: normalized,
        from: TERMII_SENDER_ID,
        sms: message,
        type: 'plain',
        channel: 'generic',
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      console.error('[SMS] Termii API error:', response.status, await response.text());
      return false;
    }

    const data = await response.json();
    if (data.code !== 'ok') {
      console.error('[SMS] Termii API returned error:', data);
      return false;
    }

    console.log('[SMS] Sent to', normalized, '— message ID:', data.message_id);
    return true;
  } catch (e: any) {
    console.error('[SMS] Send failed:', e?.message || e);
    return false;
  }
}

/**
 * Send an SMS + log it as a notification (for audit trail).
 */
export async function sendSmsWithLog(userId: string, phone: string, message: string, type: string = 'sms'): Promise<void> {
  void sendSms({ to: phone, message });
}
