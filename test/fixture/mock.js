// A React page that imitates how Workday's application form is built and how
// its controls behave, so the filler can be exercised without a real tenant:
//   - every field sits in <div data-automation-id="formField-…">
//   - text inputs are controlled and commit on blur
//   - dropdowns are a button plus a listbox rendered elsewhere in <body>
//   - search prompts select on Enter, or show a result list when ambiguous
//   - date boxes ignore typing and only respond to arrow keys
// Committed values are mirrored into window.__wd for the assertions in run.js.
//
// With ?parsed in the URL the form starts the way Workday leaves it after
// "Autofill with Resume": mostly filled in, partly wrong.
(function () {
  const { useState, useRef, createElement: h } = React;

  const PARSED = new URLSearchParams(location.search).has('parsed');
  /** A starting value that only exists in the résumé-parsed variant. */
  const pre = (value) => (PARSED ? value : undefined);

  const store = (window.__wd = {});
  function commit(name, value) {
    store[name] = value;
    document.getElementById('state').textContent = JSON.stringify(store, null, 2);
  }

  function Wrap({ id, label, required, htmlFor, children }) {
    return h(
      'div',
      { 'data-automation-id': 'formField-' + id, className: 'ff' },
      label && h('label', { htmlFor }, label, required && h('abbr', null, '*')),
      children
    );
  }

  function Text({ name, id, label, required, textarea, initial }) {
    const [value, setValue] = useState(initial || '');
    const inputId = 'in-' + name;
    return h(
      Wrap,
      { id, label, required, htmlFor: inputId },
      h(textarea ? 'textarea' : 'input', {
        id: inputId,
        type: textarea ? undefined : 'text',
        value,
        'aria-required': required ? 'true' : undefined,
        onChange: (e) => setValue(e.target.value),
        onBlur: (e) => commit(name, e.target.value),
      })
    );
  }

  // `via: 'mousedown'` models a control that ignores `click` and reacts to the
  // mouse going down, which a plain element.click() never triggers.
  function Dropdown({ name, id, label, options, required, onChoose, initial, via = 'click' }) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(initial || '');
    const on = (handler) => (via === 'mousedown' ? { onMouseDown: handler } : { onClick: handler });
    const listId = 'list-' + name;
    const choose = (option) => {
      setValue(option);
      setOpen(false);
      commit(name, option);
      if (onChoose) onChoose(option);
    };
    return h(
      Wrap,
      { id, label, required },
      h(
        'button',
        { type: 'button', 'aria-haspopup': 'listbox', 'aria-controls': listId, 'aria-expanded': open ? 'true' : undefined, ...on(() => setOpen(!open)) },
        value || 'Select One'
      ),
      open &&
        ReactDOM.createPortal(
          h(
            'ul',
            { id: listId, role: 'listbox', onKeyDown: (e) => e.key === 'Escape' && setOpen(false) },
            ['Select One', ...options].map((option) =>
              h('li', { key: option, role: 'option', ...on(() => option !== 'Select One' && choose(option)) }, h('div', null, option))
            )
          ),
          document.body
        )
    );
  }

  function Search({ name, id, label, options, multi, initial }) {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(initial || []);
    const [results, setResults] = useState(null);
    const containerId = 'ms-' + name;
    const choose = (option) => {
      const next = multi ? [...selected, option] : [option];
      setSelected(next);
      setResults(null);
      setQuery('');
      commit(name, multi ? next : option);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setResults(null);
      if (e.key !== 'Enter') return;
      const term = e.target.value.trim().toLowerCase();
      if (!term) return;
      const matches = options.filter((o) => o.toLowerCase().includes(term) && !selected.includes(o));
      if (matches.length === 1) choose(matches[0]);
      else setResults(matches);
    };
    return h(
      Wrap,
      { id, label },
      h(
        'div',
        { 'data-automation-id': 'multiSelectContainer', id: containerId },
        selected.length > 0 && h('ul', { 'data-automation-id': 'selectedItemList' }, selected.map((s) => h('li', { key: s }, s))),
        h('input', { 'data-automation-id': 'searchBox', placeholder: 'Search', value: query, onChange: (e) => setQuery(e.target.value), onKeyDown })
      ),
      results &&
        ReactDOM.createPortal(
          h(
            'div',
            { 'data-automation-widget': 'wd-popup', className: 'popup' },
            h(
              'div',
              { 'data-associated-widget': containerId },
              results.length
                ? results.map((o) => h('div', { key: o, 'data-automation-id': 'promptOption', onClick: () => choose(o) }, o))
                : h('div', null, 'No Items.')
            )
          ),
          document.body
        )
    );
  }

  function DateField({ name, id, label, parts, initial }) {
    const [, rerender] = useState(0);
    const values = useRef(initial || {});
    const step = (part) => (e) => {
      if (e.key !== 'ArrowUp') return;
      e.preventDefault();
      values.current = { ...values.current, [part]: (parseInt(e.currentTarget.value, 10) || 0) + 1 };
      commit(name, values.current);
      rerender((n) => n + 1);
    };
    return h(
      Wrap,
      { id, label },
      h(
        'div',
        { 'data-automation-id': 'dateInputWrapper' },
        parts.map((part) =>
          h('input', {
            key: part,
            role: 'spinbutton',
            'aria-label': part,
            'data-automation-id': `dateSection${part}-input`,
            placeholder: part === 'Year' ? 'YYYY' : part === 'Month' ? 'MM' : 'DD',
            value: values.current[part] ?? '',
            onChange: () => {}, // typing is ignored, as on Workday
            onKeyDown: step(part),
          })
        )
      )
    );
  }

  function Choices({ name, id, legend, options, kind, initial }) {
    const [value, setValue] = useState(initial ?? null);
    return h(
      'div',
      { 'data-automation-id': 'formField-' + id, className: 'ff' },
      h(
        'fieldset',
        null,
        h('legend', null, legend),
        options.map((option, i) =>
          h(
            'div',
            { key: option },
            h('input', {
              type: kind,
              id: `${name}-${i}`,
              name: kind === 'radio' ? name : undefined,
              checked: value === option,
              'aria-checked': String(value === option),
              onChange: () => {
                setValue(option);
                commit(name, option);
              },
            }),
            h('label', { htmlFor: `${name}-${i}` }, option)
          )
        )
      )
    );
  }

  function Checkbox({ name, id, label, initial, onToggle }) {
    const [checked, setChecked] = useState(Boolean(initial));
    return h(
      'div',
      { 'data-automation-id': 'formField-' + id, className: 'ff' },
      h('input', {
        type: 'checkbox',
        id: 'cb-' + name,
        checked,
        onChange: (e) => {
          setChecked(e.target.checked);
          commit(name, e.target.checked);
          if (onToggle) onToggle(e.target.checked);
        },
      }),
      h('label', { htmlFor: 'cb-' + name, style: { display: 'inline', fontWeight: 400 } }, ' ' + label)
    );
  }

  function Upload({ name, id, initial }) {
    const [fileName, setFileName] = useState(initial || null);
    const onChange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      commit(name, { name: file.name, size: file.size, text: await file.text() });
      setFileName(file.name);
    };
    return h(
      'div',
      { 'data-automation-id': 'formField-' + id, className: 'ff' },
      h('div', { 'data-automation-id': 'file-upload-drop-zone' }, 'Drop file here ', h('input', { type: 'file', 'data-automation-id': 'file-upload-input-ref', onChange })),
      fileName && h('div', { 'data-automation-id': 'file-upload-item' }, h('div', { 'data-automation-id': 'file-upload-item-name' }, fileName))
    );
  }

  function Repeating({ title, initial = 0, render }) {
    const [count, setCount] = useState(initial);
    return h(
      'div',
      { role: 'group' },
      h('h3', null, title),
      Array.from({ length: count }, (_, i) => h('div', { key: i, role: 'group' }, h('h4', null, `${title} ${i + 1}`), render(i + 1))),
      h('button', { type: 'button', 'data-automation-id': 'add-button', onClick: () => setCount(count + 1) }, count ? 'Add Another' : 'Add')
    );
  }

  // What the résumé parser "found": a mangled title, a wrong start date, a
  // description with the whole projects section glued on, and a job that isn't one.
  const PARSED_WORK = {
    1: { title: 'La Metro Jun', company: 'Engines Ltd', from: { Month: 1, Year: 2025 }, description: 'Built the engine. PROJECTS Side project one. Side project two.' },
    2: { title: 'Intern', company: 'Looms Inc', from: { Month: 6, Year: 2020 }, to: { Month: 9, Year: 2020 } },
    3: { title: 'Projects', company: 'Personal' },
  };

  function WorkEntry({ n }) {
    const was = pre(PARSED_WORK[n]) || {};
    const [current, setCurrent] = useState(false);
    return [
      h(Text, { key: 'a', name: `work${n}.title`, id: 'jobTitle', label: 'Job Title', required: true, initial: was.title }),
      h(Text, { key: 'b', name: `work${n}.company`, id: 'companyName', label: 'Company', required: true, initial: was.company }),
      h(Text, { key: 'c', name: `work${n}.location`, id: 'location', label: 'Location' }),
      h(Checkbox, { key: 'd', name: `work${n}.current`, id: 'currentlyWorkHere', label: 'I currently work here', onToggle: setCurrent }),
      h(DateField, { key: 'e', name: `work${n}.from`, id: 'startDate', label: 'From', parts: ['Month', 'Year'], initial: was.from }),
      // Workday removes the end date while "I currently work here" is ticked.
      !current && h(DateField, { key: 'f', name: `work${n}.to`, id: 'endDate', label: 'To', parts: ['Month', 'Year'], initial: was.to }),
      h(Text, { key: 'g', name: `work${n}.description`, id: 'roleDescription', label: 'Role Description', textarea: true, initial: was.description }),
    ];
  }

  const YES_NO = ['Yes', 'No'];

  function App() {
    const [country, setCountry] = useState('');
    return h(
      'form',
      { onSubmit: (e) => e.preventDefault() },
      h('h2', null, 'My Information'),
      h(Search, { name: 'source', id: 'source', label: 'How Did You Hear About Us?', options: ['LinkedIn', 'LinkedIn Ads', 'Company Website', 'Referral'] }),
      h(Choices, { name: 'previousWorker', id: 'candidateIsPreviousWorker', kind: 'radio', legend: 'Have you previously worked for Acme as an employee or contractor?*', options: YES_NO, initial: pre('Yes') }),
      h(Dropdown, { name: 'country', id: 'country', label: 'Country', required: true, onChoose: setCountry, initial: pre('United States of America'), options: ['Canada', 'United States Minor Outlying Islands', 'United States of America'] }),
      h(Text, { name: 'firstName', id: 'legalName--firstName', label: 'First Name', required: true, initial: pre('Ada') }),
      h(Text, { name: 'middleName', id: 'legalName--middleName', label: 'Middle Name' }),
      h(Text, { name: 'lastName', id: 'legalName--lastName', label: 'Last Name', required: true, initial: pre('LOVELACE') }),
      h(Checkbox, { name: 'preferredName', id: 'preferredCheck', label: 'I have a preferred name' }),
      h(Text, { name: 'address1', id: 'addressLine1', label: 'Address Line 1', required: true }),
      h(Text, { name: 'city', id: 'city', label: 'City', required: true }),
      // Appears only once a country is chosen, like Workday's region list.
      (country || PARSED) && h(Dropdown, { key: country, name: 'state', id: 'countryRegion', label: 'State', required: true, options: ['Alabama', 'California', 'Colorado', 'New York'] }),
      h(Text, { name: 'postalCode', id: 'postalCode', label: 'Postal Code', required: true }),
      h(Text, { name: 'email', id: 'email', label: 'Email Address', initial: 'existing@example.com' }),
      h(Dropdown, { name: 'phoneType', id: 'phoneType', label: 'Phone Device Type', required: true, via: 'mousedown', options: ['Home', 'Mobile', 'Work'] }),
      h(Search, { name: 'phoneCode', id: 'country-phone-code', label: 'Country Phone Code', options: ['United States of America (+1)', 'Canada (+1)', 'United Kingdom (+44)'] }),
      h(Text, { name: 'phone', id: 'phoneNumber', label: 'Phone Number', required: true, initial: pre('(555) 010-2345') }),
      h(Text, { name: 'extension', id: 'extension', label: 'Phone Extension' }),

      h('h2', null, 'My Experience'),
      h(Repeating, { title: 'Work Experience', initial: PARSED ? 3 : 0, render: (n) => h(WorkEntry, { key: n, n }) }),
      h(Repeating, {
        title: 'Education',
        initial: 1,
        render: (n) => [
          h(Search, { key: 'a', name: `edu${n}.school`, id: 'schoolItem', label: 'School or University', initial: pre(['University of California, Los Angeles']), options: ['University of California, Berkeley', 'University of California, Los Angeles'] }),
          h(Dropdown, { key: 'b', name: `edu${n}.degree`, id: 'degree', label: 'Degree', initial: pre('Master of Science'), options: ['Associate of Arts', 'Bachelor of Science', 'Master of Science'] }),
          h(Search, { key: 'c', name: `edu${n}.field`, id: 'field-of-study', label: 'Field of Study', initial: pre(['Mathematics']), options: ['Mathematics', 'Applied Mathematics', 'Physics'] }),
          h(Text, { key: 'd', name: `edu${n}.gpa`, id: 'gradeAverage', label: 'Overall Result (GPA)' }),
          h(DateField, { key: 'e', name: `edu${n}.from`, id: 'firstYearAttended', label: 'From', parts: ['Year'] }),
          h(DateField, { key: 'f', name: `edu${n}.to`, id: 'lastYearAttended', label: 'To (Actual or Expected)', parts: ['Year'], initial: pre({ Year: 2021 }) }),
        ],
      }),
      h('h3', null, 'Skills'),
      h(Search, { name: 'skills', id: 'skills', label: 'Type to Add Skills', multi: true, initial: pre(['JavaScript']), options: ['Python', 'Python Scripting', 'SQL', 'JavaScript'] }),
      h('h3', null, 'Resume/CV'),
      h(Upload, { name: 'resume', id: 'attachments', initial: pre('cv.txt') }),
      h(Repeating, { title: 'Websites', render: (n) => h(Text, { name: `site${n}.url`, id: 'url', label: 'URL' }) }),
      h('h3', null, 'Social Network URLs'),
      h(Text, { name: 'linkedin', id: 'linkedInAccount', label: 'LinkedIn' }),

      h('h2', null, 'Application Questions'),
      h(Dropdown, { name: 'q.authorized', id: 'a1f3', required: true, label: 'Are you legally authorized to work in the United States?', options: YES_NO }),
      h(Dropdown, { name: 'q.sponsorship', id: 'b2e4', required: true, label: 'Will you now or in the future require sponsorship for employment visa status?', options: ['Yes, I will require sponsorship', 'No, I will not require sponsorship'] }),
      h(Dropdown, { name: 'q.noSponsor', id: 'c3d5', label: 'Are you authorized to work in the US without the need for sponsorship?', options: YES_NO }),
      h(Dropdown, { name: 'q.over18', id: 'd4c6', label: 'Are you at least 18 years of age?', options: YES_NO }),
      h(Dropdown, { name: 'q.shift', id: 'e5b7', required: true, label: 'Which shift do you prefer?', initial: pre('Day'), options: ['Day', 'Night'] }),
      h(Dropdown, { name: 'q.relocate', id: 'f6a8', label: 'Are you willing to relocate?', options: YES_NO }),
      h(Text, { name: 'q.salary', id: 'a7b9', label: 'What are your salary expectations?' }),
      h(Text, { name: 'q.why', id: 'b8c0', label: 'Why do you want to work here?', textarea: true }),

      h('h2', null, 'Voluntary Disclosures'),
      h(Dropdown, {
        name: 'eeo.ethnicity', id: 'ethnicity', label: 'Please select the ethnicity which most accurately describes how you identify yourself.',
        options: ['Asian (Not Hispanic or Latino) (United States of America)', 'Hispanic or Latino (United States of America)', 'White (Not Hispanic or Latino) (United States of America)', 'I do not wish to answer'],
      }),
      h(Dropdown, { name: 'eeo.gender', id: 'gender', label: 'Gender', initial: pre('Male'), options: ['Male', 'Female', 'I do not wish to answer'] }),
      h(Dropdown, {
        name: 'eeo.veteran', id: 'veteranStatus', label: 'Veteran Status',
        options: ['I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERAN LISTED ABOVE', 'I IDENTIFY AS A VETERAN, JUST NOT A PROTECTED VETERAN', 'I AM NOT A VETERAN', 'I DO NOT WISH TO SELF-IDENTIFY'],
      }),
      h(Checkbox, { name: 'consent', id: 'acceptTermsAndAgreements', label: 'Yes, I have read and consent to the terms and conditions' }),

      h('h2', null, 'Self Identify'),
      h(Text, { name: 'self.name', id: 'name', label: 'Name', required: true }),
      h(DateField, { name: 'self.date', id: 'dateSignedOn', label: 'Date', parts: ['Month', 'Day', 'Year'] }),
      h(Choices, {
        name: 'self.disability', id: 'disabilityStatus', kind: 'checkbox', legend: 'Please check one of the boxes below: disability status',
        options: ['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer'],
      })
    );
  }

  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
