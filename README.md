# whatsapp-cloud-templates

Keep your WhatsApp Cloud API message templates in a JSON file, check them against the rules Meta rejects for, sync them to your WhatsApp Business Account, and send them with parameters Meta will accept.

- **Validate before you submit.** Catches the mistakes that get templates rejected: a body that starts or ends with a variable, gaps in `{{1}}…{{n}}`, missing examples, a URL variable that is not at the end, labels that are too long.
- **Sync, don't click.** Templates live in version control. `wa-templates sync` shows what is missing on Meta and submits it, and never touches templates that already exist.
- **Send safely.** `cleanParam` strips the newlines, tabs and runs of spaces that make Meta reject a send. One-time-passcode (copy-code) sends are built for you.
- Zero runtime dependencies. Node 18+. TypeScript types included.

## Install

```bash
npm install whatsapp-cloud-templates
```

## Command line

```bash
export WA_WABA_ID=123456789012345          # WhatsApp Business Account ID
export WA_ACCESS_TOKEN=EAAG...             # System User token with whatsapp_business_management

npx wa-templates validate templates.json        # local check, no network
npx wa-templates sync templates.json            # dry run: what exists, what would be created
npx wa-templates sync templates.json --submit   # create the missing ones
npx wa-templates status templates.json          # APPROVED / PENDING / REJECTED (+ reason)
```

See [`examples/templates.example.json`](examples/templates.example.json) for a starter file.

## Template file

An array of definitions:

```json
[
  {
    "name": "fee_reminder_v1",
    "language": "en",
    "category": "UTILITY",
    "body": "Dear parent, this is a reminder from {{1}}. The fee of {{2}} for {{3}} is due on {{4}}. Please pay on time.",
    "example": ["Green Valley School", "Rs 2,500", "Rahul Kumar", "10 Nov 2026"],
    "footer": "This is an automated message",
    "buttons": [{ "type": "URL", "text": "Pay now", "url": "https://example.com/pay?id={{1}}", "example": "https://example.com/pay?id=42" }]
  },
  { "name": "login_otp_v1", "language": "en", "category": "AUTHENTICATION", "codeExpiryMinutes": 10 }
]
```

| Field | Notes |
|---|---|
| `name` | lowercase letters, digits, `_` |
| `language` | Meta code: `en`, `en_US`, `hi` … You must send with exactly the same code. |
| `category` | `UTILITY`, `MARKETING` or `AUTHENTICATION` |
| `body` | up to 1024 chars, variables `{{1}}…{{n}}` |
| `example` | one sample value per variable, in order |
| `header`, `footer` | optional text, up to 60 chars, no variables |
| `buttons` | `URL` (max 2, optional `{{1}}` at the very end + `example`), `PHONE_NUMBER` (max 1), `QUICK_REPLY` |
| `codeExpiryMinutes`, `buttonText`, `securityRecommendation` | `AUTHENTICATION` only; Meta writes the body |

## Library

```ts
import { WhatsAppTemplatesClient, validateTemplate, cleanParam } from 'whatsapp-cloud-templates';

const wa = new WhatsAppTemplatesClient({
  wabaId: process.env.WA_WABA_ID,
  phoneNumberId: process.env.WA_PHONE_NUMBER_ID,
  accessToken: process.env.WA_ACCESS_TOKEN!,
  defaultCountryCode: '91', // 10-digit numbers get this prefix
});

// Send a template; body params are cleaned automatically
await wa.sendTemplate({
  to: '98765 43210',
  name: 'fee_reminder_v1',
  language: 'en',
  bodyParams: ['Green Valley School', 'Rs 2,500', 'Rahul Kumar', '10 Nov 2026'],
});

// Dynamic URL button: the suffix that replaces {{1}} in the button URL
await wa.sendTemplate({ to, name: 'invoice_reminder_v1', language: 'en', bodyParams: [...], urlButtonParams: { 0: 'INV-2026-031' } });

// One-time passcode with a copy-code template
await wa.sendOtp(to, 'login_otp_v1', '482913');

// Sync from code
const results = await wa.syncTemplates(definitions, { dryRun: true });
```

Lower-level helpers: `validateTemplate`, `isValid`, `toCreatePayload`, `toSendPayload`, `toOtpPayload`, `cleanParam`, `normalizePhone`. API errors are thrown as `WhatsAppApiError` with Meta's message, HTTP status and error code.

## Things Meta doesn't tell you up front

Learned the hard way while running templates for a school ERP in India:

- **A template in review cannot be edited.** Only a rejected one can. Fix things *before* you submit — that is what `validate` is for.
- **A deleted name is blocked for about 30 days.** Version your names (`fee_reminder_v1`, `_v2`) instead of deleting and recreating.
- **Meta may change the category.** Friendly or promotional wording ("great news", "don't miss") in a `UTILITY` template can be re-categorised as `MARKETING`, which costs several times more per message. Keep utility text plain and transactional.
- **Authentication templates need a messaging tier.** New numbers on the lowest tier often get "no permission" when creating `AUTHENTICATION` templates even after business verification. Utility templates work in the meantime.
- **The language code must match exactly.** A template created as `en` will not send as `en_US`.
- **Parameters can't contain newlines, tabs or more than four spaces in a row** — the send fails. Use `cleanParam` (the client does it for you).
- **Templates are for business-initiated messages.** Inside the 24-hour window after a user writes to you, you can send free-form messages instead.
- **Use a System User token**, not the 24-hour token from the API setup page.

## Development

```bash
npm install
npm test        # compiles and runs node:test
npm run build   # emits dist/
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © Aniket Sharma
