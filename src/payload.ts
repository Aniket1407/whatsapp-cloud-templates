import type { TemplateDefinition } from './types.js';

/** Builds the body for POST /{waba-id}/message_templates. */
export function toCreatePayload(t: TemplateDefinition): Record<string, unknown> {
  if (t.category === 'AUTHENTICATION') {
    const components: Record<string, unknown>[] = [
      { type: 'BODY', add_security_recommendation: t.securityRecommendation ?? true },
    ];
    if (t.codeExpiryMinutes) components.push({ type: 'FOOTER', code_expiration_minutes: t.codeExpiryMinutes });
    components.push({ type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: t.buttonText ?? 'Copy code' }] });
    return { name: t.name, language: t.language, category: 'AUTHENTICATION', components };
  }

  const components: Record<string, unknown>[] = [];
  if (t.header) components.push({ type: 'HEADER', format: 'TEXT', text: t.header });
  components.push({
    type: 'BODY',
    text: t.body,
    ...(t.example && t.example.length ? { example: { body_text: [t.example] } } : {}),
  });
  if (t.footer) components.push({ type: 'FOOTER', text: t.footer });
  if (t.buttons?.length) {
    components.push({
      type: 'BUTTONS',
      buttons: t.buttons.map((b) => {
        if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url, ...(b.example ? { example: [b.example] } : {}) };
        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber };
        return { type: 'QUICK_REPLY', text: b.text };
      }),
    });
  }
  return { name: t.name, language: t.language, category: t.category, components };
}

export interface CleanParamOptions {
  /** Maximum characters kept. Default 200. */
  maxLength?: number;
  /** Used when the value is empty. Default "-". */
  emptyValue?: string;
}

/**
 * Makes a value safe as a template parameter. Meta rejects parameters that contain newlines or
 * tabs, more than 4 spaces in a row, or are empty.
 */
export function cleanParam(value: unknown, options: CleanParamOptions = {}): string {
  const max = options.maxLength ?? 200;
  const text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return text || (options.emptyValue ?? '-');
}

/** Digits only, without a leading +, as the Cloud API expects. Adds a default country code to 10-digit numbers. */
export function normalizePhone(phone: string, defaultCountryCode?: string): string {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (defaultCountryCode && digits.length === 10) digits = defaultCountryCode.replace(/\D/g, '') + digits;
  return digits;
}

export interface SendTemplateInput {
  to: string;
  name: string;
  language: string;
  /** Values for {{1}}, {{2}} … in order. Cleaned with cleanParam unless `raw` is true. */
  bodyParams?: unknown[];
  /** Dynamic URL suffix per button index, e.g. { 0: 'INV-42' }. */
  urlButtonParams?: Record<number, string>;
  /** Skip cleaning of parameters. */
  raw?: boolean;
}

/** Builds the body for POST /{phone-number-id}/messages with a template. */
export function toSendPayload(input: SendTemplateInput, defaultCountryCode?: string): Record<string, unknown> {
  const clean = (v: unknown) => (input.raw ? String(v) : cleanParam(v));
  const components: Record<string, unknown>[] = [];
  if (input.bodyParams?.length) {
    components.push({ type: 'body', parameters: input.bodyParams.map((v) => ({ type: 'text', text: clean(v) })) });
  }
  for (const [index, value] of Object.entries(input.urlButtonParams ?? {})) {
    components.push({ type: 'button', sub_type: 'url', index: String(index), parameters: [{ type: 'text', text: clean(value) }] });
  }
  return {
    messaging_product: 'whatsapp',
    to: normalizePhone(input.to, defaultCountryCode),
    type: 'template',
    template: { name: input.name, language: { code: input.language }, ...(components.length ? { components } : {}) },
  };
}

/** Builds the send body for an AUTHENTICATION (copy-code) template: the code goes in the body and the button. */
export function toOtpPayload(to: string, name: string, language: string, code: string, defaultCountryCode?: string): Record<string, unknown> {
  return toSendPayload({ to, name, language, bodyParams: [code], urlButtonParams: { 0: code }, raw: true }, defaultCountryCode);
}
