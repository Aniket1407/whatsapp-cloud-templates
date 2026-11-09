import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanParam, normalizePhone, toCreatePayload, toOtpPayload, toSendPayload } from '../src/index.js';

test('cleanParam removes what Meta rejects', () => {
  assert.equal(cleanParam('Line one\nline two\tend'), 'Line one line two end');
  assert.equal(cleanParam('a      b'), 'a b');
  assert.equal(cleanParam('   '), '-');
  assert.equal(cleanParam(null), '-');
  assert.equal(cleanParam(42), '42');
  assert.equal(cleanParam('x'.repeat(300)).length, 200);
  assert.equal(cleanParam('abcdef', { maxLength: 3 }), 'abc');
  assert.equal(cleanParam('', { emptyValue: 'N/A' }), 'N/A');
});

test('normalizePhone', () => {
  assert.equal(normalizePhone('+91 98765-43210'), '919876543210');
  assert.equal(normalizePhone('9876543210', '91'), '919876543210');
  assert.equal(normalizePhone('0091 9876543210'), '919876543210');
});

test('toCreatePayload for a text template', () => {
  const p = toCreatePayload({
    name: 'invoice_due',
    language: 'en',
    category: 'UTILITY',
    header: 'Invoice due',
    body: 'Hello {{1}}, invoice {{2}} is due. Tap below to view it.',
    example: ['Asha', 'INV-7'],
    footer: 'Reply STOP to opt out',
    buttons: [{ type: 'URL', text: 'View invoice', url: 'https://example.com/i/{{1}}', example: 'https://example.com/i/INV-7' }],
  });
  assert.deepEqual(p, {
    name: 'invoice_due',
    language: 'en',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'Invoice due' },
      { type: 'BODY', text: 'Hello {{1}}, invoice {{2}} is due. Tap below to view it.', example: { body_text: [['Asha', 'INV-7']] } },
      { type: 'FOOTER', text: 'Reply STOP to opt out' },
      { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'View invoice', url: 'https://example.com/i/{{1}}', example: ['https://example.com/i/INV-7'] }] },
    ],
  });
});

test('toCreatePayload for an authentication template', () => {
  const p = toCreatePayload({ name: 'login_otp', language: 'en', category: 'AUTHENTICATION', codeExpiryMinutes: 10 });
  assert.deepEqual(p.components, [
    { type: 'BODY', add_security_recommendation: true },
    { type: 'FOOTER', code_expiration_minutes: 10 },
    { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }] },
  ]);
});

test('toSendPayload cleans params and adds URL button params', () => {
  const p = toSendPayload({ to: '+91 98765 43210', name: 'invoice_due', language: 'en', bodyParams: ['Asha\nK', 'INV-7'], urlButtonParams: { 0: 'INV-7' } });
  assert.deepEqual(p, {
    messaging_product: 'whatsapp',
    to: '919876543210',
    type: 'template',
    template: {
      name: 'invoice_due',
      language: { code: 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: 'Asha K' }, { type: 'text', text: 'INV-7' }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'INV-7' }] },
      ],
    },
  });
});

test('toSendPayload without params has no components', () => {
  const p = toSendPayload({ to: '919876543210', name: 'hello_world', language: 'en_US' });
  assert.deepEqual(p.template, { name: 'hello_world', language: { code: 'en_US' } });
});

test('toOtpPayload puts the code in the body and the copy button', () => {
  const p = toOtpPayload('919876543210', 'login_otp', 'en', '482913') as { template: { components: unknown[] } };
  assert.deepEqual(p.template.components, [
    { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] },
  ]);
});
