// The saved profile. Everything lives in the extension's local storage on this
// device; nothing is sent anywhere.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const api = root.browser ?? root.chrome;

  AF.defaultProfile = () => ({
    version: 1,
    personal: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      phoneType: 'Mobile',
      phoneCountryCode: 'United States of America (+1)',
      address1: '',
      address2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'United States of America',
    },
    links: { linkedin: '', github: '', portfolio: '', other: '' },
    work: [],
    education: [],
    skills: [],
    questions: {
      source: '',
      authorized: '',
      sponsorship: '',
      over18: '',
      previouslyEmployed: '',
      relocate: '',
      nonCompete: '',
    },
    eeo: { gender: '', ethnicity: '', hispanic: '', veteran: '', disability: '' },
    custom: [],
  });

  AF.emptyWork = () => ({
    title: '',
    company: '',
    location: '',
    current: false,
    startMonth: '',
    startYear: '',
    endMonth: '',
    endYear: '',
    description: '',
  });
  AF.emptyEducation = () => ({ school: '', degree: '', field: '', gpa: '', startYear: '', endYear: '' });
  AF.emptyCustom = () => ({ question: '', answer: '' });

  /** Fill in any keys a stored (possibly older) profile is missing. */
  AF.normalizeProfile = function normalizeProfile(stored) {
    const base = AF.defaultProfile();
    const p = stored && typeof stored === 'object' ? stored : {};
    for (const group of ['personal', 'links', 'questions', 'eeo']) {
      base[group] = { ...base[group], ...(p[group] || {}) };
    }
    base.work = (Array.isArray(p.work) ? p.work : []).map((w) => ({ ...AF.emptyWork(), ...w }));
    base.education = (Array.isArray(p.education) ? p.education : []).map((e) => ({ ...AF.emptyEducation(), ...e }));
    base.custom = (Array.isArray(p.custom) ? p.custom : []).map((c) => ({ ...AF.emptyCustom(), ...c }));
    base.skills = (Array.isArray(p.skills) ? p.skills : []).map((s) => String(s).trim()).filter(Boolean);
    return base;
  };

  AF.loadProfile = async function loadProfile() {
    const { profile } = await api.storage.local.get('profile');
    return AF.normalizeProfile(profile);
  };

  AF.saveProfile = (profile) => api.storage.local.set({ profile });

  // The résumé is kept under its own key so autosaving the form doesn't
  // rewrite a megabyte of base64 on every keystroke.
  AF.loadResume = async function loadResume() {
    const { resume } = await api.storage.local.get('resume');
    return resume && resume.dataUrl ? resume : null;
  };

  AF.saveResume = (resume) => (resume ? api.storage.local.set({ resume }) : api.storage.local.remove('resume'));

  AF.hasBasics = (profile) => Boolean(profile.personal.firstName && profile.personal.lastName && profile.personal.email);
})(globalThis);
