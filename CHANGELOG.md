# Changelog

## 0.1.0 — 2026-11-09

- First release.
- `validateTemplate` with checks for names, language codes, variable order and gaps, start/end variables, examples, headers, footers and buttons.
- `toCreatePayload`, `toSendPayload`, `toOtpPayload`, `cleanParam`, `normalizePhone`.
- `WhatsAppTemplatesClient`: list (with paging), create, sync, send, send OTP.
- `wa-templates` CLI: `validate`, `sync [--submit]`, `status`.
