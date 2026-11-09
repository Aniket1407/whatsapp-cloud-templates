import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTemplate, isValid, variablesIn } from '../src/index.js';
import type { TextTemplateDefinition } from '../src/index.js';

const base: TextTemplateDefinition = {
  name: 'fee_reminder',
  language: 'en',
  category: 'UTILITY',
  body: 'Hello {{1}}, the fee of {{2}} for this month is due. Please pay before the due date to avoid a late fee.',
  example: ['Rahul', 'Rs 2,500'],
};

const codes = (t: TextTemplateDefinition) => validateTemplate(t).map((i) => i.code);

test('a well-formed template has no issues', () => {
  assert.deepEqual(validateTemplate(base), []);
  assert.equal(isValid(base), true);
});

test('variablesIn lists variables in order of appearance', () => {
  assert.deepEqual(variablesIn('a {{2}} b {{1}} c {{2}}'), [2, 1, 2]);
});

test('rejects bad names and languages', () => {
  assert.ok(codes({ ...base, name: 'Fee-Reminder' }).includes('INVALID_NAME'));
  assert.ok(codes({ ...base, language: 'English' }).includes('INVALID_LANGUAGE'));
  assert.equal(codes({ ...base, language: 'en_US' }).length, 0);
});

test('body must not start or end with a variable', () => {
  assert.ok(codes({ ...base, body: '{{1}} your fee of {{2}} is due this month, please pay soon.' }).includes('BODY_STARTS_WITH_VARIABLE'));
  assert.ok(codes({ ...base, body: 'Hello there, your fee is due this month, amount {{1}} for {{2}}.' }).includes('BODY_ENDS_WITH_VARIABLE'));
});

test('variables must be sequential and examples must match', () => {
  const c = codes({ ...base, body: 'Hello {{1}}, the fee of {{3}} for this month is due. Please pay on time.' });
  assert.ok(c.includes('VARIABLES_NOT_SEQUENTIAL'));
  assert.ok(codes({ ...base, example: ['Rahul'] }).includes('EXAMPLE_COUNT'));
});

test('warns when variables first appear out of order', () => {
  const issues = validateTemplate({ ...base, body: 'Dear parent, {{2}} is due for {{1}} this month. Please pay soon to avoid a fee.' });
  const issue = issues.find((i) => i.code === 'VARIABLES_OUT_OF_ORDER');
  assert.equal(issue?.level, 'warning');
});

test('adjacent variables and too few words', () => {
  assert.ok(codes({ ...base, body: 'Hello {{1}} {{2}} please pay the fee this month on time.' }).includes('ADJACENT_VARIABLES'));
  assert.ok(codes({ ...base, body: 'Hi {{1}} and {{2}} ok' }).includes('TOO_FEW_WORDS'));
});

test('URL button rules', () => {
  const withButton = (url: string, example?: string): TextTemplateDefinition => ({
    ...base,
    buttons: [{ type: 'URL', text: 'Pay now', url, ...(example ? { example } : {}) }],
  });
  assert.equal(codes(withButton('https://example.com/pay')).length, 0);
  assert.equal(codes(withButton('https://example.com/pay?id={{1}}', 'https://example.com/pay?id=42')).length, 0);
  assert.ok(codes(withButton('https://example.com/{{1}}/pay', 'https://example.com/1/pay')).includes('URL_VARIABLE_POSITION'));
  assert.ok(codes(withButton('https://example.com/pay?id={{1}}')).includes('URL_EXAMPLE_MISSING'));
  assert.ok(codes(withButton('example.com')).includes('INVALID_URL'));
});

test('button, header and footer lengths', () => {
  assert.ok(codes({ ...base, buttons: [{ type: 'QUICK_REPLY', text: 'This label is far too long for WhatsApp' }] }).includes('BUTTON_TEXT_TOO_LONG'));
  assert.ok(codes({ ...base, footer: 'x'.repeat(61) }).includes('FOOTER_TOO_LONG'));
  assert.ok(codes({ ...base, footer: 'Ref {{1}}' }).includes('FOOTER_HAS_VARIABLE'));
});

test('authentication templates', () => {
  assert.deepEqual(validateTemplate({ name: 'login_otp', language: 'en', category: 'AUTHENTICATION', codeExpiryMinutes: 10 }), []);
  const issues = validateTemplate({ name: 'login_otp', language: 'en', category: 'AUTHENTICATION', codeExpiryMinutes: 120 });
  assert.equal(issues[0]?.code, 'INVALID_CODE_EXPIRY');
});
