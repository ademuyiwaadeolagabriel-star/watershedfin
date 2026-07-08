// ============================================================================
// SMS SERVICE — Provider-Agnostic
// ============================================================================
// Supports: Console (default), Twilio, Termii, Africa's Talking, Vonage/Nexmo
// Configure via .env:
//   SMS_PROVIDER=console|twilio|termii|africas_talking|vonage|none
//
// Twilio:          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
// Termii:          TERMII_API_KEY, TERMII_SENDER_ID
// Africa's Talking: AFRICAS_TALKING_API_KEY, AFRICAS_TALKING_SENDER_ID, AFRICAS_TALKING_USERNAME
// Vonage:          VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM
// ============================================================================

export interface SmsMessage {
  to: string;           // phone number (E.164 format: +234...)
  message: string;
  senderId?: string;    // override default sender ID
}

export interface SmsProvider {
  name: string;
  send(message: SmsMessage): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// ── Factory ──
export function getSmsProvider(): SmsProvider {
  const provider = process.env.SMS_PROVIDER || 'console';

  switch (provider.toLowerCase()) {
    case 'twilio':
      return new TwilioProvider();
    case 'termii':
      return new TermiiProvider();
    case 'africas_talking':
    case 'africastalking':
      return new AfricasTalkingProvider();
    case 'vonage':
    case 'nexmo':
      return new VonageProvider();
    default:
      return new ConsoleSmsProvider();
  }
}

// ── Console Provider (default — logs to console) ──
class ConsoleSmsProvider implements SmsProvider {
  name = 'console';
  async send(message: SmsMessage) {
    console.log(`\n📱 [SMS] To: ${message.to}`);
    console.log(`   Message: ${message.message.slice(0, 160)}`);
    return { success: true, messageId: `console-sms-${Date.now()}` };
  }
}

// ── Twilio Provider ──
// Install: bun add twilio
class TwilioProvider implements SmsProvider {
  name = 'twilio';
  async send(message: SmsMessage) {
    try {
      const twilio = await import('twilio').catch(() => null);
      if (!twilio) {
        console.error('[SMS] twilio not installed. Run: bun add twilio');
        return { success: false, error: 'twilio not installed' };
      }
      const client = twilio.default(
        process.env.TWILIO_ACCOUNT_SID!,
        process.env.TWILIO_AUTH_TOKEN!
      );
      const result = await client.messages.create({
        body: message.message,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: message.to,
      });
      return { success: true, messageId: result.sid };
    } catch (e: any) {
      console.error('[SMS] Twilio error:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// ── Termii Provider (popular in Nigeria) ──
// No SDK needed — uses fetch directly to Termii REST API
class TermiiProvider implements SmsProvider {
  name = 'termii';
  async send(message: SmsMessage) {
    try {
      const apiKey = process.env.TERMII_API_KEY;
      if (!apiKey) {
        console.error('[SMS] TERMII_API_KEY not set');
        return { success: false, error: 'TERMII_API_KEY not configured' };
      }
      const senderId = message.senderId || process.env.TERMII_SENDER_ID || 'Watershed';
      
      const response = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          to: message.to,
          from: senderId,
          sms: message.message,
          type: 'plain',
          channel: 'generic',
        }),
      });
      const data = await response.json();
      if (data.code === 'ok') {
        return { success: true, messageId: data.message_id };
      }
      return { success: false, error: data.message || 'Termii send failed' };
    } catch (e: any) {
      console.error('[SMS] Termii error:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// ── Africa's Talking Provider ──
// No SDK needed — uses fetch directly to Africa's Talking REST API
class AfricasTalkingProvider implements SmsProvider {
  name = 'africas_talking';
  async send(message: SmsMessage) {
    try {
      const apiKey = process.env.AFRICAS_TALKING_API_KEY;
      const username = process.env.AFRICAS_TALKING_USERNAME || 'sandbox';
      const senderId = message.senderId || process.env.AFRICAS_TALKING_SENDER_ID;
      if (!apiKey) {
        console.error('[SMS] AFRICAS_TALKING_API_KEY not set');
        return { success: false, error: 'AFRICAS_TALKING_API_KEY not configured' };
      }

      const baseUrl = username === 'sandbox'
        ? 'https://api.sandbox.africastalking.com/version1/messaging'
        : 'https://api.africastalking.com/version1/messaging';

      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('to', message.to);
      formData.append('message', message.message);
      if (senderId) formData.append('from', senderId);

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': apiKey,
        },
        body: formData.toString(),
      });
      const data = await response.json();
      if (data.SMSMessageData?.Recipients?.length > 0) {
        return { success: true, messageId: data.SMSMessageData.MessageId };
      }
      return { success: false, error: data.SMSMessageData?.Message || 'Africa\'s Talking send failed' };
    } catch (e: any) {
      console.error('[SMS] Africa\'s Talking error:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// ── Vonage / Nexmo Provider ──
// No SDK needed — uses fetch directly to Vonage REST API
class VonageProvider implements SmsProvider {
  name = 'vonage';
  async send(message: SmsMessage) {
    try {
      const apiKey = process.env.VONAGE_API_KEY;
      const apiSecret = process.env.VONAGE_API_SECRET;
      const from = message.senderId || process.env.VONAGE_FROM || 'Watershed';
      if (!apiKey || !apiSecret) {
        console.error('[SMS] VONAGE_API_KEY or VONAGE_API_SECRET not set');
        return { success: false, error: 'Vonage credentials not configured' };
      }

      const response = await fetch('https://rest.nexmo.com/sms/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          api_secret: apiSecret,
          to: message.to,
          from: from,
          text: message.message,
        }),
      });
      const data = await response.json();
      if (data.messages?.[0]?.status === '0') {
        return { success: true, messageId: data.messages[0]['message-id'] };
      }
      return { success: false, error: data.messages?.[0]?.['error-text'] || 'Vonage send failed' };
    } catch (e: any) {
      console.error('[SMS] Vonage error:', e.message);
      return { success: false, error: e.message };
    }
  }
}

// ── Main send function ──
export async function sendSms(message: SmsMessage): Promise<{ success: boolean; error?: string }> {
  const provider = getSmsProvider();
  const result = await provider.send(message);
  if (!result.success) {
    console.error(`[SMS] Failed to send via ${provider.name}:`, result.error);
  }
  return result;
}
