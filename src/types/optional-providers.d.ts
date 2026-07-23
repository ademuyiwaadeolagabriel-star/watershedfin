// Type declarations for optional email/SMS provider dependencies.
// These packages are dynamically imported at runtime (with graceful fallback
// if not installed), so we declare them as `any` to satisfy TypeScript.

declare module 'nodemailer' {
  const any: any;
  export default any;
  export const createTransport: any;
}

declare module '@sendgrid/mail' {
  const any: any;
  export default any;
}

declare module 'mailgun-js' {
  const any: any;
  export default any;
}

declare module 'postmark' {
  const any: any;
  export default any;
}

declare module '@aws-sdk/client-ses' {
  export const SESClient: any;
  export const SendEmailCommand: any;
}

declare module 'twilio' {
  const any: any;
  export default any;
}
