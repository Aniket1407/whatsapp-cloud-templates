# Contributing

Thanks for helping. Bug reports, new validation rules and fixes are all welcome.

## Reporting a rejection the validator missed

If Meta rejected a template that `wa-templates validate` passed, open an issue with:

- the template definition (replace anything private),
- the rejection reason shown in WhatsApp Manager or returned by the API,
- the category and language.

These reports are the best way to make the validator more useful.

## Pull requests

1. Fork and create a branch.
2. `npm install`, then make your change.
3. Add or update tests in `test/` — every validation rule should have one.
4. `npm test` must pass.
5. Keep runtime dependencies at zero.

Please never commit access tokens, WABA IDs or phone numbers from a real account.
