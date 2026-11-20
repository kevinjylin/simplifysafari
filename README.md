# simplifysafari

Applyfill: a Safari extension that autofills job applications on Workday, Greenhouse, Ashby, Lever and other hiring
sites from a profile you save once.

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
Greenhouse applications live on `job-boards.greenhouse.io` (or `boards.greenhouse.io`), so allowing that once covers
every employer, including career sites that show the Greenhouse form in an embedded frame. The same goes for Ashby
(`jobs.ashbyhq.com`) and Lever (`jobs.lever.co`).

Other hiring sites get a generic filler that goes by the form's labels: Workable, SmartRecruiters, BambooHR, JazzHR,
Breezy, Jobvite, iCIMS, Recruitee, Teamtailor, Rippling and Pinpoint load it automatically (allow each site once).
On any other application page, click the toolbar icon and choose **Try on this page**.

The profile page opens on first install; afterwards it's under the toolbar icon → **Edit profile**.

## Use

On an application page an **Applyfill** card appears in the bottom-right corner (on an embedded
Greenhouse form, in the corner of the form's frame). Press **Autofill** on each step of the application. Afterwards the card lists what it could not answer; click an item to jump to that field.

- Fields that already have a value are checked against your profile: kept if they match, replaced if they don't.
  That includes what Workday's résumé parser pre-fills. Where your profile has no value, the form's value stands.
- A job or school on the form that your profile doesn't list (parsers invent these) is flagged, not deleted.
- For questions it doesn't know, add a rule under **Your own answers** in the profile ("question contains…" → answer).
- **Copy field report** copies the page's field labels and what happened to each (no profile data), plus the tag
  structure of any dropdown that couldn't be filled. Useful for working out why a field was missed.

## What it fills

Name, address, phone, source, work experience and education entries (adding as many as your profile has), skills,
websites/LinkedIn, résumé upload, common screening questions (work authorization, sponsorship, 18+, prior employment,
relocation, non-compete, working in person / on-site, U.S. export-control status, whether your spouse or domestic partner has served in the U.S. military), and the voluntary self-identification pages if you choose to save those answers.

On Greenhouse the same, plus "Location (City)" (searched as city, state, country), the phone country code, and
education entries whose school, degree and discipline come from Greenhouse's own lists ("Bachelor of Science" is
matched to "Bachelor's Degree"; a school not found under its full name is searched by parts). Education dates are
filled by year only, since the profile doesn't store months.

On Ashby the same basics, plus its Yes/No buttons and location search. Built-in questions are recognised by Ashby's
own field ids even when the employer rewords them ("Which country do you intend to work from?" is the location).

On Lever the résumé is attached first and Lever is left to read it; the pass after that corrects what Lever guessed
(name, company) instead of racing it. "Current company" is the job marked current in your profile, and "Current
location" is picked from Lever's search ("Oakland, CA, USA").

Consent, terms and "I certify…" checkboxes are never ticked on any site; they're listed for you to tick.

A question is answered only when it asks what you saved. One that looks similar but means something else is listed for
you instead: work authorization or sponsorship for a country other than yours, "confirm you will *not* need
sponsorship", "Have you worked with Kubernetes?" (not "…worked for us?"), relocation *assistance*, a reference's or
emergency contact's name and phone, an employer's address inside a work-history entry. So is a list where two options
fit equally ("Yes, now" / "Yes, in the future").

## Layout

- `extension/` — the web extension (Manifest V3, plain JavaScript, no build step)
  - `src/rules.js` maps a field to a profile value; `src/engine.js` holds the generic fillers and the pass over the page
  - `src/workday/` and `src/greenhouse/`: per site, `fields.js` finds and classifies fields and `fill.js` drives that
    site's controls. The manifest loads one site's pair per page.
  - `src/forms/` finds and fills forms built from ordinary controls (labels, native selects, radio/checkbox groups,
    ARIA comboboxes, shadow DOM). `src/ashby/site.js` and `src/lever/site.js` are small configs on top of it with the
    controls those sites build themselves; `src/generic/site.js` is the config-free version for every other site.
  - `src/content.js` is the on-page card; `options/` is the profile editor; `popup/` is the toolbar popup
- `Applyfill/` — Xcode project wrapping the extension for Safari; it references `extension/` directly, so rebuild
  after editing
- `test/` — `npm test` covers the matching rules; `test/fixture/` is a mock Workday form (React) that the real
  filler is run against: `npm run fixture`, then open `http://localhost:4173/test/fixture/index.html` (blank form)
  or `…/index.html?parsed` (form pre-filled, partly wrongly, as after "Autofill with Resume"), and
  `…/greenhouse.html`, a mock Greenhouse form (filled twice; the second pass must change nothing), and likewise
  `…/ashby.html`, `…/lever.html` and `…/generic.html`

## Status

Workday: verified against the mock form, which imitates Workday's markup and control behaviour as documented by
[job_app_filler](https://github.com/berellevy/job_app_filler). Not yet verified on a live Workday tenant; tenants
differ, so expect to tune `rules.js` and the fillers using field reports from real applications.

Greenhouse: the mock copies markup and dropdown behaviour measured on live job-boards.greenhouse.io postings
(dropdowns that open on key-up, server-side school and location search). Field discovery and answer mapping were
checked on a live posting; a full fill and the résumé upload have only been run against the mock.

Ashby and Lever: the mocks copy markup and control behaviour measured on live postings (Ashby's toggle-to-clear Yes/No
buttons and remote location search; Lever's keydown-triggered location search that empties itself on blur, and its
résumé reader). A full fill has only been run against the mocks.

Other sites: the generic filler has only been run against `generic.html`. Expect misses on sites with unusual
controls; the field report shows what it saw.
