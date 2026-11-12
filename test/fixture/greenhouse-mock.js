// A React page that imitates the Greenhouse application form
// (job-boards.greenhouse.io) as measured on live postings, so the filler can be
// exercised offline:
//   - fields are .text-input-wrapper / .select / .file-upload / fieldset blocks
//   - dropdowns are react-select comboboxes whose open state the page keeps:
//     they open on key-up of an ordinary key or mouse-up on the control, close
//     on Escape key-up or blur, and ignore mouse-down
//   - school and location search a "server" as you type (Loading…, then results)
//   - the phone country list shows only the dial code once chosen
//   - education entries are numbered in their ids (school--0) with "Add another"
// Committed values are mirrored into window.__gh for the assertions.
(function () {
  const { useState, useRef, useEffect, createElement: h } = React;

  const store = (window.__gh = {});
  function commit(name, value) {
    store[name] = value;
    document.getElementById('state').textContent = JSON.stringify(store, null, 2);
  }

  const Req = () => h('span', null, '*');

  function Text({ name, id, label, required, textarea, type = 'text' }) {
    const [value, setValue] = useState('');
    return h(
      'div',
      { className: 'text-input-wrapper' },
      h(
        'div',
        { className: 'input-wrapper' },
        h('label', { id: id + '-label', className: 'label', htmlFor: id }, label, required && h(Req)),
        h(textarea ? 'textarea' : 'input', {
          id,
          className: 'input',
          type: textarea ? undefined : type,
          value,
          'aria-required': required ? 'true' : 'false',
          'aria-label': label,
          onChange: (e) => setValue(e.target.value),
          onBlur: (e) => commit(name, e.target.value),
        })
      )
    );
  }

  const SCHOOLS = [
    'Berkeley College',
    'Dominican University of California',
    'Stanford University',
    'University of California - Berkeley',
    'University of California - Davis',
    'University of California - Los Angeles',
  ];
  const PLACES = [
    'Oakland, California, United States',
    'Oakland Park, Florida, United States',
    'Oakland, New Jersey, United States',
    'Lyon, Auvergne-Rhône-Alpes, France',
  ];
  // The first page a remote list shows before anything is typed.
  const FIRST_PAGE = ['Aalborg University', 'Aalto University', 'Aarhus University'];

  /**
   * react-select as Greenhouse configures it. `remote` lists are searched
   * after a delay instead of filtered locally; `display` is what the control
   * shows once an option is chosen (the phone country shows "+1").
   */
  function Select({ name, id, label, options = [], remote, multi, required, display = (o) => o }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [value, setValue] = useState(multi ? [] : '');
    const [results, setResults] = useState(remote ? FIRST_PAGE : options);
    const [loading, setLoading] = useState(false);
    const timer = useRef(null);

    useEffect(() => {
      if (!remote) {
        setResults(options.filter((o) => o.toLowerCase().includes(query.toLowerCase())));
        return undefined;
      }
      if (!query) {
        setResults(FIRST_PAGE);
        return undefined;
      }
      setLoading(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setResults(remote.filter((o) => o.toLowerCase().includes(query.toLowerCase())));
        setLoading(false);
      }, 500);
      return () => clearTimeout(timer.current);
    }, [query]);

    const choose = (option) => {
      const next = multi ? [...value, option] : option;
      setValue(next);
      setQuery('');
      if (!multi) setOpen(false);
      commit(name, next);
    };
    const chosen = multi ? value : value ? [value] : [];
    const listId = `react-select-${id}-listbox`;

    return h(
      'div',
      { className: 'select' },
      h(
        'div',
        { className: 'select__container' },
        h('label', { id: id + '-label', className: 'label select__label', htmlFor: id }, label, required && h(Req)),
        h(
          'div',
          { className: 'select-shell' },
          h(
            'div',
            {
              className: 'select__control',
              // Greenhouse toggles its own open state on mouse-up; mouse-down does nothing.
              onMouseUp: () => setOpen(!open),
            },
            h(
              'div',
              { className: 'select__value-container' },
              multi
                ? value.map((v) => h('div', { key: v, className: 'select__multi-value' }, h('div', { className: 'select__multi-value__label' }, v)))
                : value && !query
                  ? h('div', { className: 'select__single-value' }, display(value))
                  : !query && h('div', { className: 'select__placeholder' }, 'Select...'),
              h('input', {
                id,
                className: 'select__input',
                role: 'combobox',
                'aria-expanded': open ? 'true' : 'false',
                'aria-controls': open ? listId : undefined,
                'aria-labelledby': id + '-label',
                'aria-required': required ? 'true' : 'false',
                value: query,
                onChange: (e) => setQuery(e.target.value),
                onKeyUp: (e) => (e.code === 'Escape' || e.code === 'Tab' ? setOpen(false) : e.code !== 'Enter' && setOpen(true)),
                onBlur: () => setOpen(false),
              })
            ),
            h('div', { className: 'select__indicators' }, h('button', { type: 'button', 'aria-label': 'Toggle flyout', tabIndex: -1, onClick: () => setOpen(!open) }, '▾'))
          ),
          open &&
            h(
              'div',
              { className: 'select__menu' },
              h(
                'div',
                { className: 'select__menu-list', role: 'listbox', id: listId },
                loading
                  ? h('div', { className: 'select__menu-notice select__menu-notice--loading' }, 'Loading...')
                  : results.length
                    ? results.map((o, i) =>
                        h(
                          'div',
                          {
                            key: o,
                            id: `react-select-${id}-option-${i}`,
                            role: 'option',
                            className: 'select__option' + (chosen.includes(o) ? ' select__option--is-selected' : ''),
                            onClick: () => choose(o),
                          },
                          o
                        )
                      )
                    : h('div', { className: 'select__menu-notice select__menu-notice--no-options' }, 'No options')
              )
            )
        )
      )
    );
  }

  function Upload({ name, id, label, required }) {
    const [file, setFile] = useState(null);
    const onChange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      setFile(f.name);
      commit(name, { name: f.name, size: f.size, text: await f.text() });
    };
    return h(
      'div',
      { className: 'file-upload', role: 'group', 'aria-required': required ? 'true' : 'false', 'aria-labelledby': 'upload-label-' + id },
      h('div', { id: 'upload-label-' + id, className: 'label upload-label' }, label, required && h('span', { className: 'required' }, '*')),
      file
        ? h(
            'div',
            { className: 'file-upload__filename' },
            file,
            h('button', { type: 'button', 'aria-label': 'Remove file', onClick: () => setFile(null) }, '×')
          )
        : h(
            'div',
            { className: 'button-container' },
            h('button', { type: 'button', className: 'btn' }, 'Attach'),
            h('input', { id, type: 'file', className: 'visually-hidden', onChange }),
            h('button', { type: 'button', className: 'btn' }, 'Dropbox')
          )
    );
  }

  function Checkboxes({ name, id, legend, options }) {
    const [checked, setChecked] = useState([]);
    return h(
      'fieldset',
      { id, className: 'checkbox', 'aria-required': 'false' },
      h('legend', { className: 'label' }, legend),
      options.map((o, i) =>
        h(
          'div',
          { key: o, className: 'checkbox__wrapper' },
          h('input', {
            id: `${id}_${i}`,
            type: 'checkbox',
            checked: checked.includes(o),
            onChange: (e) => {
              const next = e.target.checked ? [...checked, o] : checked.filter((c) => c !== o);
              setChecked(next);
              commit(name, next);
            },
          }),
          h('label', { htmlFor: `${id}_${i}` }, o)
        )
      )
    );
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DEGREES = ["Associate's Degree", "Bachelor's Degree", 'Doctor of Philosophy (Ph.D.)', "Master's Degree", 'Other'];
  const DISCIPLINES = ['Biology', 'Computer Science', 'Mathematics', 'Physics'];

  function EducationEntry({ i }) {
    const n = i + 1;
    return h(
      'div',
      { className: 'education--form' },
      h(Select, { name: `edu${n}.school`, id: `school--${i}`, label: 'School', remote: SCHOOLS, required: true }),
      h(Select, { name: `edu${n}.degree`, id: `degree--${i}`, label: 'Degree', options: DEGREES, required: true }),
      h(Select, { name: `edu${n}.discipline`, id: `discipline--${i}`, label: 'Discipline', options: DISCIPLINES, required: true }),
      h(Select, { name: `edu${n}.startMonth`, id: `start-month--${i}`, label: 'Start date month', options: MONTHS }),
      h(Text, { name: `edu${n}.startYear`, id: `start-year--${i}`, label: 'Start date year', type: 'number' }),
      h(Select, { name: `edu${n}.endMonth`, id: `end-month--${i}`, label: 'End date month', options: MONTHS }),
      h(Text, { name: `edu${n}.endYear`, id: `end-year--${i}`, label: 'End date year', type: 'number' })
    );
  }

  function Education() {
    const [count, setCount] = useState(1);
    return h(
      'div',
      { className: 'education--container' },
      Array.from({ length: count }, (_, i) => h(EducationEntry, { key: i, i })),
      h('button', { type: 'button', className: 'add-another-button', onClick: () => setCount(count + 1) }, 'Add another')
    );
  }

  const wrap = (child) => h('div', { className: 'field-wrapper' }, child);
  const YES_NO = ['Yes', 'No'];

  function App() {
    return h(
      'form',
      { id: 'application-form', className: 'application--form', onSubmit: (e) => e.preventDefault() },
      h('h2', null, 'Apply for this job'),
      h(
        'div',
        { className: 'application--questions' },
        wrap(h(Text, { name: 'firstName', id: 'first_name', label: 'First Name', required: true })),
        wrap(h(Text, { name: 'lastName', id: 'last_name', label: 'Last Name', required: true })),
        wrap(h(Text, { name: 'preferredName', id: 'preferred_name', label: 'Preferred First Name' })),
        wrap(h(Text, { name: 'email', id: 'email', label: 'Email', required: true })),
        h(
          'div',
          null,
          h(
            'fieldset',
            { className: 'phone-input' },
            h('legend', { className: 'visually-hidden' }, 'Phone'),
            h(Select, {
              name: 'phoneCountry',
              id: 'country',
              label: 'Country',
              options: ['United States +1', 'Afghanistan +93', 'Canada +1', 'United States Minor Outlying Islands +1'],
              display: (o) => o.replace(/^.* (\+\d+)$/, '$1'),
            }),
            h(Text, { name: 'phone', id: 'phone', label: 'Phone', type: 'tel', required: true })
          )
        ),
        wrap(h(Select, { name: 'location', id: 'candidate-location', label: 'Location (City)', remote: PLACES, required: true })),
        wrap(h(Upload, { name: 'resume', id: 'resume', label: 'Resume/CV', required: true })),
        wrap(h(Upload, { name: 'coverLetter', id: 'cover_letter', label: 'Cover Letter' }))
      ),
      h(Education),
      h(
        'div',
        { className: 'application--questions' },
        wrap(h(Text, { name: 'linkedin', id: 'question_1', label: 'LinkedIn Profile' })),
        wrap(h(Text, { name: 'website', id: 'question_2', label: 'Website' })),
        wrap(h(Text, { name: 'source', id: 'question_3', label: 'How did you hear about this job?' })),
        wrap(h(Select, { name: 'q.authorized', id: 'question_4', label: 'Are you legally authorized to work in the United States?', options: YES_NO, required: true })),
        wrap(h(Select, { name: 'q.sponsorship', id: 'question_5', label: 'Will you now or in the future require visa sponsorship?', options: YES_NO, required: true })),
        wrap(h(Select, { name: 'q.relocate', id: 'question_6', label: 'Are you open to relocation for this role?', options: YES_NO, required: true })),
        wrap(h(Text, { name: 'q.why', id: 'question_7', label: 'Why do you want to work here?', textarea: true, required: true })),
        wrap(h(Text, { name: 'q.salary', id: 'question_8', label: 'What are your salary expectations?' })),
        wrap(h(Checkboxes, { name: 'q.lengths', id: 'question_9[]', legend: 'Which residency lengths would work for you?', options: ['Six weeks', 'Three months', 'Six months'] }))
      ),
      h(
        'div',
        { id: 'demographic-section', className: 'demographic--container' },
        h('h3', { className: 'section-header' }, 'Voluntary Self Identification'),
        h(Select, { name: 'eeo.gender', id: '4001', label: 'Gender', options: ['Male', 'Female', "I don't wish to answer"], required: true }),
        h(Select, {
          name: 'eeo.race',
          id: '4002',
          label: 'Race and Ethnicity',
          options: ['American Indian or Alaska Native', "I don't wish to answer", 'Asian', 'Black or African American', 'White'],
          required: true,
        }),
        h(Select, {
          name: 'eeo.veteran',
          id: '4003',
          label: 'Veteran Status',
          options: ['I am not a protected veteran', 'I identify as one or more of the classifications of a protected veteran', "I don't wish to answer"],
        }),
        h(Select, {
          name: 'eeo.disability',
          id: '4004',
          label: 'Disability Status',
          options: ['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', "I don't wish to answer"],
        }),
        h(Select, { name: 'eeo.lgbtq', id: '4005', label: 'I consider myself a member of the LGBTQ+ community. (optional)', options: ['Yes', 'No', "I don't wish to answer"] })
      ),
      h('button', { type: 'submit', onClick: () => commit('submitted', true) }, 'Submit application')
    );
  }

  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
