#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { WhatsAppTemplatesClient } from './client.js';
import type { TemplateDefinition } from './types.js';
import { validateTemplate } from './validate.js';

const HELP = `wa-templates — validate and sync WhatsApp Cloud API message templates

Usage:
  wa-templates validate <templates.json>          Check templates locally (no network)
  wa-templates sync <templates.json>              Compare with Meta; show what would be created
  wa-templates sync <templates.json> --submit     Create the templates that are not on Meta yet
  wa-templates status [templates.json]            Show approval status (all, or only those in the file)

Environment:
  WA_WABA_ID        WhatsApp Business Account ID
  WA_ACCESS_TOKEN   System User access token (whatsapp_business_management)
  WA_API_VERSION    Graph API version (default v21.0)

The JSON file holds an array of template definitions (see README).`;

function load(path: string | undefined): TemplateDefinition[] {
  if (!path) throw new Error('Path to templates.json is required.');
  const data = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(data)) throw new Error('The templates file must contain a JSON array.');
  return data as TemplateDefinition[];
}

function client(): WhatsAppTemplatesClient {
  const accessToken = process.env.WA_ACCESS_TOKEN ?? '';
  const wabaId = process.env.WA_WABA_ID ?? '';
  if (!accessToken || !wabaId) throw new Error('Set WA_WABA_ID and WA_ACCESS_TOKEN.');
  return new WhatsAppTemplatesClient({ accessToken, wabaId, apiVersion: process.env.WA_API_VERSION });
}

const pad = (s: string, n: number) => s.padEnd(n);

async function main(): Promise<number> {
  const [cmd, file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const submit = process.argv.includes('--submit');

  if (!cmd || cmd === 'help' || process.argv.includes('--help')) {
    console.log(HELP);
    return 0;
  }

  if (cmd === 'validate') {
    let errors = 0;
    for (const t of load(file)) {
      const issues = validateTemplate(t);
      if (!issues.length) {
        console.log(`✓ ${t.name} (${t.language})`);
        continue;
      }
      for (const i of issues) {
        if (i.level === 'error') errors += 1;
        console.log(`${i.level === 'error' ? '✗' : '!'} ${t.name} (${t.language}): ${i.message}`);
      }
    }
    return errors ? 1 : 0;
  }

  if (cmd === 'sync') {
    const results = await client().syncTemplates(load(file), { dryRun: !submit, delayMs: 400 });
    console.log(`${pad('TEMPLATE', 34)}${pad('LANG', 7)}${pad('RESULT', 14)}STATUS / NOTE`);
    for (const r of results) {
      const note = r.error ?? r.rejectedReason ?? r.issues?.map((i) => i.message).join(' ') ?? '';
      console.log(`${pad(r.name, 34)}${pad(r.language, 7)}${pad(r.action, 14)}${r.status ?? ''} ${note}`.trimEnd());
    }
    if (!submit && results.some((r) => r.action === 'would_create')) console.log('\nDry run. Add --submit to create them.');
    return results.some((r) => r.action === 'failed' || r.action === 'invalid') ? 1 : 0;
  }

  if (cmd === 'status') {
    const remote = await client().listTemplates();
    const names = file ? new Set(load(file).map((t) => `${t.name}::${t.language}`)) : null;
    for (const r of remote) {
      if (names && !names.has(`${r.name}::${r.language}`)) continue;
      console.log(`${pad(r.name, 34)}${pad(r.language, 7)}${pad(r.status, 12)}${r.category}${r.rejected_reason && r.rejected_reason !== 'NONE' ? ` — ${r.rejected_reason}` : ''}`);
    }
    return 0;
  }

  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  },
);
