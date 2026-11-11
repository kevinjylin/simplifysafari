// Stands in for the extension APIs so the real content scripts run on the mock page.
window.TEST_PROFILE = {
  personal: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '+1 (555) 010-2345',
    address1: '1 Analytical Way',
    city: 'Oakland',
    state: 'CA',
    postalCode: '94607',
    country: 'USA',
  },
  links: { linkedin: 'https://linkedin.com/in/ada', github: 'https://github.com/ada', portfolio: 'https://ada.dev' },
  work: [
    { title: 'Engineer', company: 'Engines Ltd', location: 'Oakland, CA', current: true, startMonth: '3', startYear: '2022', description: 'Built the engine.' },
    { title: 'Intern', company: 'Looms Inc', location: 'Lyon', startMonth: '6', startYear: '2020', endMonth: '9', endYear: '2020', description: 'Punched cards.' },
  ],
  education: [
    { school: 'University of California, Berkeley', degree: 'Bachelor of Science', field: 'Mathematics', gpa: '3.9', startYear: '2016', endYear: '2020' },
  ],
  skills: ['Python', 'SQL', 'Underwater Basket Weaving'],
  questions: { source: 'LinkedIn', authorized: 'Yes', sponsorship: 'No', over18: 'Yes', previouslyEmployed: 'No' },
  eeo: { gender: 'Female', ethnicity: 'Asian', veteran: 'Not a veteran', disability: 'Decline' },
  custom: [{ question: 'salary expectations', answer: '150000' }],
};

window.TEST_RESUME = {
  name: 'cv.txt',
  type: 'text/plain',
  size: 12,
  dataUrl: 'data:text/plain;base64,' + btoa('hello resume'),
};

window.browser = {
  storage: {
    local: {
      get: async () => ({ profile: window.TEST_PROFILE, resume: window.TEST_RESUME }),
      set: async () => {},
      remove: async () => {},
    },
  },
  runtime: { onMessage: { addListener() {} }, sendMessage() {} },
};
