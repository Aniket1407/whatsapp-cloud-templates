import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppApiError, WhatsAppTemplatesClient } from '../src/index.js';
import type { TemplateDefinition } from '../src/index.js';

interface Call {
  url: string;
  method: string;
  body?: unknown;
  auth?: string;
}

function mockFetch(responder: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.Authorization,
    };
    calls.push(call);
    const r = responder(call);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { fn, calls };
}

const fee: TemplateDefinition = {
  name: 'fee_reminder',
  language: 'en',
  category: 'UTILITY',
  body: 'Hello {{1}}, the fee of {{2}} is due this month. Please pay before the due date.',
  example: ['Rahul', 'Rs 2,500'],
};
const welcome: TemplateDefinition = {
  name: 'welcome',
  language: 'en',
  category: 'UTILITY',
  body: 'Welcome to our school, {{1}}. Your account is ready and you can sign in now.',
  example: ['Asha'],
};

test('listTemplates follows paging and sends the token', async () => {
  const { fn, calls } = mockFetch((c) =>
    c.url.includes('after=')
      ? { body: { data: [{ id: '2', name: 'b', language: 'en', status: 'PENDING', category: 'UTILITY' }] } }
      : { body: { data: [{ id: '1', name: 'a', language: 'en', status: 'APPROVED', category: 'UTILITY' }], paging: { next: 'https://graph.facebook.com/v21.0/123/message_templates?after=X' } } },
  );
  const client = new WhatsAppTemplatesClient({ wabaId: '123', accessToken: 'tok', fetch: fn });
  const list = await client.listTemplates();
  assert.deepEqual(list.map((t) => t.name), ['a', 'b']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.auth, 'Bearer tok');
  assert.match(calls[0]?.url ?? '', /^https:\/\/graph\.facebook\.com\/v21\.0\/123\/message_templates\?fields=/);
});

test('syncTemplates dry run reports existing and missing templates', async () => {
  const { fn, calls } = mockFetch(() => ({ body: { data: [{ id: '1', name: 'fee_reminder', language: 'en', status: 'APPROVED', category: 'UTILITY' }] } }));
  const client = new WhatsAppTemplatesClient({ wabaId: '123', accessToken: 'tok', fetch: fn });
  const results = await client.syncTemplates([fee, welcome], { dryRun: true });
  assert.deepEqual(results.map((r) => [r.name, r.action, r.status]), [
    ['fee_reminder', 'exists', 'APPROVED'],
    ['welcome', 'would_create', undefined],
  ]);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('syncTemplates submits only missing templates and records failures', async () => {
  const { fn, calls } = mockFetch((c) => {
    if (c.method === 'GET') return { body: { data: [] } };
    const name = (c.body as { name: string }).name;
    if (name === 'welcome') return { status: 400, body: { error: { message: 'Invalid parameter', code: 100, error_user_msg: 'Content in this language already exists' } } };
    return { body: { id: '9', status: 'PENDING', category: 'UTILITY' } };
  });
  const client = new WhatsAppTemplatesClient({ wabaId: '123', accessToken: 'tok', fetch: fn });
  const results = await client.syncTemplates([fee, welcome]);
  assert.equal(results[0]?.action, 'created');
  assert.equal(results[0]?.status, 'PENDING');
  assert.equal(results[1]?.action, 'failed');
  assert.match(results[1]?.error ?? '', /already exists/);
  const posted = calls.find((c) => c.method === 'POST')?.body as { components: { type: string }[] };
  assert.equal(posted.components[0]?.type, 'BODY');
});

test('syncTemplates does not submit invalid templates', async () => {
  const { fn, calls } = mockFetch(() => ({ body: { data: [] } }));
  const client = new WhatsAppTemplatesClient({ wabaId: '123', accessToken: 'tok', fetch: fn });
  const results = await client.syncTemplates([{ ...welcome, body: '{{1}} welcome to our school, your account is ready now.' }]);
  assert.equal(results[0]?.action, 'invalid');
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('sendTemplate posts to the phone number and returns the message id', async () => {
  const { fn, calls } = mockFetch(() => ({ body: { messages: [{ id: 'wamid.1' }] } }));
  const client = new WhatsAppTemplatesClient({ phoneNumberId: '555', accessToken: 'tok', defaultCountryCode: '91', fetch: fn });
  const res = await client.sendTemplate({ to: '9876543210', name: 'fee_reminder', language: 'en', bodyParams: ['Rahul', 'Rs 2,500'] });
  assert.equal(res.messageId, 'wamid.1');
  assert.match(calls[0]?.url ?? '', /\/555\/messages$/);
  assert.equal((calls[0]?.body as { to: string }).to, '919876543210');
});

test('sendOtp sends the code twice (body and button)', async () => {
  const { fn, calls } = mockFetch(() => ({ body: { messages: [{ id: 'wamid.2' }] } }));
  const client = new WhatsAppTemplatesClient({ phoneNumberId: '555', accessToken: 'tok', fetch: fn });
  await client.sendOtp('919876543210', 'login_otp', '123456');
  const comps = (calls[0]?.body as { template: { components: { type: string }[] } }).template.components;
  assert.deepEqual(comps.map((c) => c.type), ['body', 'button']);
});

test('API errors become WhatsAppApiError with the Meta message', async () => {
  const { fn } = mockFetch(() => ({ status: 401, body: { error: { message: 'Invalid OAuth access token', code: 190 } } }));
  const client = new WhatsAppTemplatesClient({ wabaId: '123', accessToken: 'bad', fetch: fn });
  await assert.rejects(client.listTemplates(), (e: unknown) => {
    assert.ok(e instanceof WhatsAppApiError);
    assert.equal(e.status, 401);
    assert.equal(e.code, 190);
    assert.match(e.message, /Invalid OAuth/);
    return true;
  });
});

test('missing ids give clear errors', async () => {
  const client = new WhatsAppTemplatesClient({ accessToken: 'tok', fetch: mockFetch(() => ({ body: {} })).fn });
  await assert.rejects(client.listTemplates(), /wabaId is required/);
  await assert.rejects(client.sendTemplate({ to: '1', name: 'x', language: 'en' }), /phoneNumberId is required/);
  assert.throws(() => new WhatsAppTemplatesClient({ accessToken: '' }), /accessToken is required/);
});
