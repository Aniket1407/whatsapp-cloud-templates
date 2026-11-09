export type TemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export interface UrlButton {
  type: 'URL';
  /** Button label, max 25 characters. */
  text: string;
  /** Static URL, or a URL ending in `{{1}}` for a dynamic suffix. */
  url: string;
  /** Full example URL — required when `url` ends in `{{1}}`. */
  example?: string;
}

export interface PhoneButton {
  type: 'PHONE_NUMBER';
  text: string;
  /** E.164 number, e.g. +919876543210. */
  phoneNumber: string;
}

export interface QuickReplyButton {
  type: 'QUICK_REPLY';
  text: string;
}

export type TemplateButton = UrlButton | PhoneButton | QuickReplyButton;

/** A UTILITY or MARKETING template with a text body. */
export interface TextTemplateDefinition {
  name: string;
  /** Meta language code, e.g. `en`, `en_US`, `hi`. Must match exactly what you send with. */
  language: string;
  category: 'UTILITY' | 'MARKETING';
  /** Optional text header (max 60 chars, no variables in this version). */
  header?: string;
  /** Body with `{{1}}`, `{{2}}` … variables. */
  body: string;
  /** One sample value per body variable, in variable order. */
  example?: string[];
  /** Optional footer (max 60 chars, no variables). */
  footer?: string;
  buttons?: TemplateButton[];
}

/** An AUTHENTICATION (one-time passcode) template. Meta fixes the body text. */
export interface AuthTemplateDefinition {
  name: string;
  language: string;
  category: 'AUTHENTICATION';
  /** Adds "For your security, do not share this code." Default true. */
  securityRecommendation?: boolean;
  /** Shows "This code expires in N minutes." (1–90). */
  codeExpiryMinutes?: number;
  /** Copy-code button label. Default "Copy code". */
  buttonText?: string;
}

export type TemplateDefinition = TextTemplateDefinition | AuthTemplateDefinition;

export interface ValidationIssue {
  level: 'error' | 'warning';
  /** Short machine-readable code, e.g. `BODY_STARTS_WITH_VARIABLE`. */
  code: string;
  message: string;
}

/** A template as returned by GET /{waba-id}/message_templates. */
export interface RemoteTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  rejected_reason?: string;
}
