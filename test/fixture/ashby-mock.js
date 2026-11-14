// A React page that imitates an Ashby application form (jobs.ashbyhq.com) as
// measured on a live posting:
//   - questions are .ashby-application-form-field-entry blocks (fieldset for
//     radio/checkbox groups) with a .ashby-application-form-question-title label
//     that has a _required_ class when required
//   - Yes/No questions are two aria-pressed toggle buttons; pressing the chosen
//     one again clears the answer
//   - location is a combobox that searches a "server" as you type, lists
//     role="option" results in a listbox named by aria-controls, and shows the
//     chosen place again when it loses focus
//   - built-in questions have _systemfield_* ids; the employer can reword them
// Committed values go to window.__store via commit().
(function () {
  const { useState, useRef, useEffect, createElement: h } = React;
  const cls = (...xs) => xs.filter(Boolean).join(' ');

  function Title({ htmlFor, required, children }) {
    return h('label', { htmlFor, className: cls('_heading_f7cvd_52', required && '_required_f7cvd_91', 'ashby-application-form-question-title') }, children);
  }
  const Entry = (props, ...children) => h('div', { className: '_fieldEntry_1e3gg_28 ashby-application-form-field-entry', ...props }, ...children);

  function Text({ name, id, label, required, textarea, type = 'text', description }) {
    const [value, setValue] = useState('');
    return Entry(
      null,
      h(Title, { htmlFor: id, required }, label),
      description && h('div', { className: 'ashby-application-form-question-description' }, h('p', null, description)),
      h(textarea ? 'textarea' : 'input', {
        id,
        name: id,
        type: textarea ? undefined : type,
        className: textarea ? 'ashby-application-form-input-textarea' : 'ashby-application-form-input-text',
        placeholder: 'Type here...',
        value,
        onChange: (e) => setValue(e.target.value),
        onBlur: (e) => commit(name, e.target.value),
      })
    );
  }

  function YesNo({ name, id, label, required }) {
    const [value, setValue] = useState(null);
    const press = (v) => {
      const next = value === v ? null : v; // pressing the chosen one clears it
      setValue(next);
      commit(name, next);
    };
    return Entry(
      null,
      h(Title, { htmlFor: id, required }, label),
      h(
        'div',
        { className: '_container_1svni_28 _yesno_1e3gg_148 ashby-application-form-input-yesno' },
        ['yes', 'no'].map((v) =>
          h('button', { key: v, type: 'button', 'data-option': v, 'aria-pressed': String(value === v), className: 'ashby-application-form-input-yesno-option', onClick: () => press(v) }, v === 'yes' ? 'Yes' : 'No')
        ),
        h('input', { type: 'checkbox', className: '_input_1svni_78', tabIndex: -1, name: id, checked: value === 'yes', readOnly: true, style: { position: 'absolute', opacity: 0, width: 1, height: 1 } })
      )
    );
  }

  const PLACES = [
    'Oakland, California, United States',
    'Oakland, Maryland, United States',
    'Oakland Park, Florida, United States',
    'Oakland, New Jersey, United States',
  ];

  function Location({ name, id, label, required }) {
    const [chosen, setChosen] = useState('');
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const timer = useRef(null);
    useEffect(() => {
      clearTimeout(timer.current);
      if (!query) return setResults([]);
      timer.current = setTimeout(() => setResults(PLACES.filter((p) => p.toLowerCase().includes(query.toLowerCase()))), 400);
      return undefined;
    }, [query]);
    const listId = id + '-listbox';
    return Entry(
      null,
      h(Title, { htmlFor: id, required }, label),
      h(
        'div',
        { className: '_inputContainer_d7ago_28', style: { position: 'relative' } },
        h('input', {
          id,
          role: 'combobox',
          'aria-haspopup': 'listbox',
          'aria-expanded': String(open),
          'aria-autocomplete': 'list',
          'aria-controls': open ? listId : undefined,
          className: 'ashby-application-form-input-autocomplete',
          placeholder: 'Start typing...',
          value: focused ? query : chosen,
          onFocus: () => {
            setFocused(true);
            setQuery('');
          },
          onChange: (e) => {
            setQuery(e.target.value);
            setOpen(true);
          },
          onBlur: () =>
            setTimeout(() => {
              setFocused(false);
              setOpen(false);
            }, 150),
        }),
        open &&
          h(
            'div',
            { id: listId, role: 'listbox', className: 'ashby-mock-listbox' },
            results.length
              ? results.map((p) =>
                  h('div', {
                    key: p,
                    role: 'option',
                    'aria-selected': 'false',
                    className: 'ashby-application-form-input-autocomplete-popup-result',
                    onClick: () => {
                      setChosen(p);
                      setOpen(false);
                      setFocused(false);
                      commit(name, p);
                    },
                  }, p)
                )
              : h('div', null, query ? 'No results' : '')
          )
      )
    );
  }

  function Resume({ name, id, label, required }) {
    const [file, setFile] = useState(null);
    return Entry(
      null,
      h(Title, { htmlFor: id, required }, label),
      h(
        'div',
        { role: 'presentation', className: 'ashby-application-form-input-file' },
        file
          ? h('div', { className: 'ashby-application-form-input-file-name' }, file.name, h('button', { type: 'button' }, 'Replace'))
          : h(
              'div',
              { className: 'ashby-application-form-input-file-dropzone' },
              h('input', {
                type: 'file',
                id,
                style: { position: 'absolute', opacity: 0, width: 1, height: 1 },
                onChange: async (e) => {
                  const f = e.target.files[0];
                  if (!f) return;
                  setFile(f);
                  commit(name, { name: f.name, size: f.size, text: await f.text() });
                },
              }),
              h('button', { type: 'button' }, 'Upload File'),
              h('p', null, 'or drag and drop here')
            )
      )
    );
  }

  function Group({ name, label, kind, options }) {
    const [picked, setPicked] = useState([]);
    const groupId = 'grp-' + name;
    return h(
      'fieldset',
      { className: `_container_1258i_28 _fieldEntry_1e3gg_28 ashby-application-form-input-${kind === 'radio' ? 'radio' : 'checkbox'}-group` },
      h(Title, { htmlFor: groupId }, label),
      options.map((o, i) => {
        const id = `${groupId}-${i}`;
        return h(
          'div',
          { key: o, className: 'ashby-application-form-input-group-option' },
          h('input', {
            type: kind,
            id,
            name: kind === 'radio' ? groupId : o,
            checked: picked.includes(o),
            onChange: (e) => {
              const next = kind === 'radio' ? [o] : e.target.checked ? [...picked, o] : picked.filter((x) => x !== o);
              setPicked(next);
              commit(name, kind === 'radio' ? o : next);
            },
          }),
          h('label', { htmlFor: id }, o)
        );
      })
    );
  }

  const Section = (title, ...children) =>
    h(
      'div',
      { className: '_section_5yu8i_86 ashby-application-form-section-container' },
      h('div', { className: 'ashby-application-form-section-header' }, h('h2', { className: 'ashby-application-form-section-header-title' }, title)),
      ...children
    );

  function App() {
    return h(
      'div',
      { className: '_jobPostingForm_5yu8i_402 ashby-application-form-container' },
      Section(
        'Basic Info',
        h(Text, { name: 'name', id: '_systemfield_name', label: 'Name', required: true }),
        h(Text, { name: 'email', id: '_systemfield_email', label: 'Email', type: 'email', required: true }),
        h(Text, { name: 'phone', id: '_systemfield_phone', label: 'Phone number', type: 'tel' }),
        h(Resume, { name: 'resume', id: '_systemfield_resume', label: 'Resume', required: true }),
        h(Text, { name: 'linkedin', id: 'q-linkedin', label: 'LinkedIn Profile', required: true }),
        h(Location, { name: 'location', id: '_systemfield_location', label: 'Which country do you intend to work from?', required: true })
      ),
      Section(
        'Your Background',
        h(YesNo, { name: 'q.authorized', id: 'q-auth', label: 'Are you legally authorized to work in the United States?', required: true }),
        h(YesNo, { name: 'q.sponsorship', id: 'q-sponsor', label: 'Will you now or in the future require sponsorship to work in the US?', required: true }),
        h(YesNo, { name: 'q.relocate', id: 'q-relocate', label: 'Are you open to relocating to New York?' }),
        h(Text, { name: 'q.why', id: 'q-why', label: 'What excites you about this role?', textarea: true, required: true }),
        h(Text, { name: 'q.salary', id: 'q-salary', label: 'What are your salary expectations?' })
      ),
      Section(
        'Diversity Survey',
        h(Group, { name: 'eeo.gender', label: 'What is your gender identity?', kind: 'radio', options: ['Man', 'Woman', 'Non-binary', 'I prefer not to say'] }),
        h(Group, { name: 'eeo.race', label: 'Which ethnicity(ies) do you identify with? Please select all that apply.', kind: 'checkbox', options: ['Asian or Asian American', 'Black or African American', 'Hispanic or Latino', 'White'] }),
        h(Group, { name: 'eeo.age', label: 'What is your current age?', kind: 'radio', options: ['Under 30', '30-39', '40 and over'] })
      ),
      h('button', { type: 'button', className: 'ashby-application-form-submit-button', onClick: () => commit('submitted', true) }, 'Submit Application')
    );
  }

  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})();
