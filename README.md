# simplifysafari

Applyfill: a Safari extension that autofills Workday job applications from a profile you save once.

Your profile and résumé are stored in the extension's local storage on this Mac. Nothing is sent anywhere, and the
extension never clicks Next, Save or Submit, and never ticks consent boxes.

## Install

```bash
./scripts/build.sh
```

```bash
open build/Build/Products/Debug/Applyfill.app
```

Then in Safari: **Settings → Extensions → enable Applyfill**. The first time you open a Workday application, click
the Applyfill toolbar icon and choose **Always Allow on This Website** (each employer has its own Workday address).

The profile page opens on first install; afterwards it's under the toolbar icon → **Edit profile**.

## Use

On a Workday application page an **Applyfill** card appears in the bottom-right corner. Press **Autofill** on each
step of the application. Afterwards the card lists what it could not answer; click an item to jump to that field.

- Fields that already have a value are left alone.
- For questions it doesn't know, add a rule under **Your own answers** in the profile ("question contains…" → answer).
- **Copy field report** copies the page's field labels and what happened to each (no profile data). Useful for
  working out why a field was missed.

## What it fills

Name, address, phone, source, work experience and education entries (adding as many as your profile has), skills,
websites/LinkedIn, résumé upload, common screening questions (work authorization, sponsorship, 18+, prior employment,
relocation, non-compete), and the voluntary self-identification pages if you choose to save those answers.

## Layout

- `extension/` — the web extension (Manifest V3, plain JavaScript, no build step)
  - `src/workday/fields.js` finds and classifies fields, `rules.js` maps a field to a profile value, `fill.js` drives
    each kind of control
  - `src/content.js` is the on-page card; `options/` is the profile editor; `popup/` is the toolbar popup
- `Applyfill/` — Xcode project wrapping the extension for Safari; it references `extension/` directly, so rebuild
  after editing
- `test/` — `node --test` covers the matching rules; `test/fixture/` is a mock Workday form (React) that the real
  filler is run against: `python3 -m http.server 4173`, then open
  `http://localhost:4173/test/fixture/index.html`

## Status

Verified against the mock form, which imitates Workday's markup and control behaviour as documented by
[job_app_filler](https://github.com/berellevy/job_app_filler). Not yet verified on a live Workday tenant; tenants
differ, so expect to tune `rules.js` and the fillers using field reports from real applications.
