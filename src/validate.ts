import type { TemplateDefinition, TextTemplateDefinition, ValidationIssue } from './types.js';

const NAME_RE = /^[a-z0-9_]{1,512}$/;
const VAR_RE = /\{\{(\d+)\}\}/g;

/** Variable numbers in order of appearance, e.g. "Hi {{1}}, {{2}} {{1}}" → [1, 2, 1]. */
export function variablesIn(text: string): number[] {
  return [...text.matchAll(VAR_RE)].map((m) => Number(m[1]));
}

function err(code: string, message: string): ValidationIssue {
  return { level: 'error', code, message };
}
function warn(code: string, message: string): ValidationIssue {
  return { level: 'warning', code, message };
}

/**
 * Checks a template definition against the rules Meta most often rejects for.
 * Errors will be rejected by the API; warnings are likely to be rejected or re-categorised in review.
 */
export function validateTemplate(t: TemplateDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!NAME_RE.test(t.name)) issues.push(err('INVALID_NAME', 'Name must be 1–512 lowercase letters, digits or underscores.'));
  if (!t.language || !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(t.language)) {
    issues.push(err('INVALID_LANGUAGE', `Language "${t.language}" does not look like a Meta language code (e.g. en, en_US, hi).`));
  }

  if (t.category === 'AUTHENTICATION') {
    if (t.codeExpiryMinutes !== undefined && (t.codeExpiryMinutes < 1 || t.codeExpiryMinutes > 90 || !Number.isInteger(t.codeExpiryMinutes))) {
      issues.push(err('INVALID_CODE_EXPIRY', 'codeExpiryMinutes must be a whole number from 1 to 90.'));
    }
    if (t.buttonText !== undefined && t.buttonText.length > 25) issues.push(err('BUTTON_TEXT_TOO_LONG', 'Button text can be at most 25 characters.'));
    return issues;
  }

  return issues.concat(validateText(t));
}

function validateText(t: TextTemplateDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const body = t.body ?? '';
  if (!body.trim()) return [err('EMPTY_BODY', 'Body is required.')];
  if (body.length > 1024) issues.push(err('BODY_TOO_LONG', `Body is ${body.length} characters; the limit is 1024.`));

  const vars = variablesIn(body);
  const unique = [...new Set(vars)].sort((a, b) => a - b);
  unique.forEach((v, i) => {
    if (v !== i + 1) issues.push(err('VARIABLES_NOT_SEQUENTIAL', `Variables must be {{1}}…{{n}} with no gaps; found {{${v}}}.`));
  });
  const firstUse: number[] = [];
  for (const v of vars) if (!firstUse.includes(v)) firstUse.push(v);
  if (firstUse.some((v, i) => v !== i + 1)) {
    issues.push(warn('VARIABLES_OUT_OF_ORDER', 'Variables first appear out of order (e.g. {{2}} before {{1}}). Reorder the text so they appear as {{1}}, {{2}}, …'));
  }
  if (/^\s*\{\{\d+\}\}/.test(body)) issues.push(err('BODY_STARTS_WITH_VARIABLE', 'Body must not start with a variable.'));
  if (/\{\{\d+\}\}\s*[.!?]?\s*$/.test(body)) issues.push(err('BODY_ENDS_WITH_VARIABLE', 'Body must not end with a variable.'));
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) issues.push(err('ADJACENT_VARIABLES', 'Two variables must not be next to each other.'));
  if (/\n\s*\n\s*\n/.test(body)) issues.push(warn('TOO_MANY_NEWLINES', 'More than two newlines in a row are often rejected.'));

  const words = body.replace(VAR_RE, ' ').split(/\s+/).filter(Boolean).length;
  if (unique.length > 0 && words < unique.length * 3 + 3) {
    issues.push(warn('TOO_FEW_WORDS', 'Too few words for the number of variables; Meta tends to reject templates that are mostly variables.'));
  }

  const examples = t.example ?? [];
  if (examples.length !== unique.length) {
    issues.push(err('EXAMPLE_COUNT', `Body has ${unique.length} variable(s) but ${examples.length} example value(s).`));
  }
  examples.forEach((e, i) => {
    if (!e || !e.trim()) issues.push(err('EMPTY_EXAMPLE', `Example for {{${i + 1}}} is empty.`));
  });

  if (t.header !== undefined) {
    if (t.header.length > 60) issues.push(err('HEADER_TOO_LONG', 'Header can be at most 60 characters.'));
    if (variablesIn(t.header).length) issues.push(err('HEADER_VARIABLES_UNSUPPORTED', 'Header variables are not supported by this library yet.'));
  }
  if (t.footer !== undefined) {
    if (t.footer.length > 60) issues.push(err('FOOTER_TOO_LONG', 'Footer can be at most 60 characters.'));
    if (variablesIn(t.footer).length) issues.push(err('FOOTER_HAS_VARIABLE', 'Footer must not contain variables.'));
  }

  const buttons = t.buttons ?? [];
  if (buttons.length > 10) issues.push(err('TOO_MANY_BUTTONS', 'At most 10 buttons are allowed.'));
  if (buttons.filter((b) => b.type === 'URL').length > 2) issues.push(err('TOO_MANY_URL_BUTTONS', 'At most 2 URL buttons are allowed.'));
  if (buttons.filter((b) => b.type === 'PHONE_NUMBER').length > 1) issues.push(err('TOO_MANY_PHONE_BUTTONS', 'At most 1 phone-number button is allowed.'));
  buttons.forEach((b, i) => {
    if (!b.text?.trim()) issues.push(err('EMPTY_BUTTON_TEXT', `Button ${i + 1} has no text.`));
    if (b.text && b.text.length > 25) issues.push(err('BUTTON_TEXT_TOO_LONG', `Button ${i + 1} text is longer than 25 characters.`));
    if (b.type === 'URL') {
      if (!/^https?:\/\//.test(b.url)) issues.push(err('INVALID_URL', `Button ${i + 1} URL must start with http:// or https://.`));
      const urlVars = variablesIn(b.url);
      if (urlVars.length > 0) {
        if (urlVars.length > 1 || !/\{\{1\}\}$/.test(b.url)) issues.push(err('URL_VARIABLE_POSITION', `Button ${i + 1}: a URL may have one variable, {{1}}, at the very end.`));
        if (!b.example) issues.push(err('URL_EXAMPLE_MISSING', `Button ${i + 1}: a dynamic URL needs an example URL.`));
      }
    }
    if (b.type === 'PHONE_NUMBER' && !/^\+\d{8,15}$/.test(b.phoneNumber)) {
      issues.push(err('INVALID_PHONE', `Button ${i + 1}: phone number must be E.164, e.g. +919876543210.`));
    }
  });
  return issues;
}

/** True when there are no errors (warnings allowed). */
export function isValid(t: TemplateDefinition): boolean {
  return validateTemplate(t).every((i) => i.level !== 'error');
}
