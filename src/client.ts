import { toCreatePayload, toOtpPayload, toSendPayload, type SendTemplateInput } from './payload.js';
import type { RemoteTemplate, TemplateDefinition, ValidationIssue } from './types.js';
import { validateTemplate } from './validate.js';

export interface ClientOptions {
  /** WhatsApp Business Account ID — needed for template management. */
  wabaId?: string;
  /** Phone number ID — needed for sending. */
  phoneNumberId?: string;
  /** Permanent System User token with whatsapp_business_management / whatsapp_business_messaging. */
  accessToken: string;
  /** Graph API version. Default v21.0. */
  apiVersion?: string;
  /** Country code added to 10-digit numbers when sending, e.g. "91". */
  defaultCountryCode?: string;
  /** Custom fetch (tests, proxies). Default global fetch. */
  fetch?: typeof fetch;
}

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'WhatsAppApiError';
  }
}

export type SyncAction = 'exists' | 'would_create' | 'created' | 'failed' | 'invalid';

export interface SyncResult {
  name: string;
  language: string;
  action: SyncAction;
  /** Status on Meta (APPROVED, PENDING, REJECTED …) when known. */
  status?: string;
  category?: string;
  rejectedReason?: string;
  issues?: ValidationIssue[];
  error?: string;
}

export class WhatsAppTemplatesClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly options: ClientOptions) {
    if (!options.accessToken) throw new Error('accessToken is required');
    this.base = `https://graph.facebook.com/${options.apiVersion ?? 'v21.0'}`;
    this.doFetch = options.fetch ?? fetch;
  }

  private requireWaba(): string {
    if (!this.options.wabaId) throw new Error('wabaId is required for template management');
    return this.options.wabaId;
  }

  private async request<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.base}${pathOrUrl}`;
    const res = await this.doFetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.options.accessToken}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const e = (data as { error?: { message?: string; code?: number; error_user_title?: string; error_user_msg?: string } }).error ?? {};
      const msg = [e.message, e.error_user_title, e.error_user_msg].filter(Boolean).join(' — ') || `HTTP ${res.status}`;
      throw new WhatsAppApiError(msg, res.status, e.code, data);
    }
    return data as T;
  }

  /** All templates of the WABA (follows paging). */
  async listTemplates(): Promise<RemoteTemplate[]> {
    const all: RemoteTemplate[] = [];
    let next: string | null = `/${this.requireWaba()}/message_templates?fields=id,name,language,status,category,rejected_reason&limit=200`;
    while (next) {
      const page: { data?: RemoteTemplate[]; paging?: { next?: string } } = await this.request(next);
      all.push(...(page.data ?? []));
      next = page.paging?.next ?? null;
    }
    return all;
  }

  /** Validates and submits one template. Throws on validation errors. */
  async createTemplate(t: TemplateDefinition): Promise<{ id: string; status: string; category: string }> {
    const errors = validateTemplate(t).filter((i) => i.level === 'error');
    if (errors.length) throw new Error(`Template ${t.name} is invalid: ${errors.map((e) => e.message).join(' ')}`);
    return this.request(`/${this.requireWaba()}/message_templates`, { method: 'POST', body: JSON.stringify(toCreatePayload(t)) });
  }

  /**
   * Compares local definitions with Meta and submits the missing ones.
   * Templates are matched by name + language. Existing templates are never changed.
   */
  async syncTemplates(defs: TemplateDefinition[], opts: { dryRun?: boolean; delayMs?: number } = {}): Promise<SyncResult[]> {
    const remote = await this.listTemplates();
    const byKey = new Map(remote.map((r) => [`${r.name}::${r.language}`, r]));
    const results: SyncResult[] = [];
    for (const t of defs) {
      const found = byKey.get(`${t.name}::${t.language}`);
      if (found) {
        results.push({ name: t.name, language: t.language, action: 'exists', status: found.status, category: found.category, rejectedReason: found.rejected_reason });
        continue;
      }
      const issues = validateTemplate(t);
      if (issues.some((i) => i.level === 'error')) {
        results.push({ name: t.name, language: t.language, action: 'invalid', issues });
        continue;
      }
      if (opts.dryRun) {
        results.push({ name: t.name, language: t.language, action: 'would_create', issues });
        continue;
      }
      try {
        const created = await this.createTemplate(t);
        results.push({ name: t.name, language: t.language, action: 'created', status: created.status, category: created.category, issues });
      } catch (e) {
        results.push({ name: t.name, language: t.language, action: 'failed', error: (e as Error).message, issues });
      }
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    }
    return results;
  }

  private requirePhone(): string {
    if (!this.options.phoneNumberId) throw new Error('phoneNumberId is required for sending');
    return this.options.phoneNumberId;
  }

  /** Sends a template message. Parameters are cleaned so Meta accepts them. */
  async sendTemplate(input: SendTemplateInput): Promise<{ messageId?: string }> {
    const res: { messages?: { id: string }[] } = await this.request(`/${this.requirePhone()}/messages`, {
      method: 'POST',
      body: JSON.stringify(toSendPayload(input, this.options.defaultCountryCode)),
    });
    return { messageId: res.messages?.[0]?.id };
  }

  /** Sends a one-time passcode with an AUTHENTICATION (copy-code) template. */
  async sendOtp(to: string, templateName: string, code: string, language = 'en'): Promise<{ messageId?: string }> {
    const res: { messages?: { id: string }[] } = await this.request(`/${this.requirePhone()}/messages`, {
      method: 'POST',
      body: JSON.stringify(toOtpPayload(to, templateName, language, code, this.options.defaultCountryCode)),
    });
    return { messageId: res.messages?.[0]?.id };
  }
}
