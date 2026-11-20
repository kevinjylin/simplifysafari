// Text normalisation and "which option did the user mean" matching.
// Pure functions, no DOM — also loaded by the node tests.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});

  /** Lowercase, strip accents and punctuation, collapse whitespace. */
  AF.norm = function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9+]+/g, ' ')
      .trim();
  };

  // Tested against normalised text, so "don't" is "don t".
  AF.DECLINE =
    /\b(decline|do not wish|don t wish|not wish to|prefer not|choose not|do not want to answer|not to (answer|disclose|say|identify|specify|self identify))\b/;

  const ACCEPT = 40;
  // An option that only mentions the answer may be its opposite: "Non-White", "Not Hispanic or Latino".
  const NEGATION = /\b(not|non|no|except|excluding|other than)\b/;

  function score(option, want) {
    const o = AF.norm(option);
    if (!o) return 0;
    if (want instanceof RegExp) return want.test(o) ? 85 : 0;
    const a = AF.norm(want);
    if (!a) return 0;
    if (o === a) return 100;
    if (a === 'decline') return AF.DECLINE.test(o) ? 85 : 0;
    // "Yes" should pick "Yes, I am authorized…" but never "Not applicable".
    if (a === 'yes' || a === 'no') return o.split(' ')[0] === a ? 90 : 0;
    if (o.startsWith(a + ' ')) return 80;
    if (a.startsWith(o + ' ')) return 70;
    if (NEGATION.test(o) && !NEGATION.test(a)) return 0;
    if ((' ' + o + ' ').includes(' ' + a + ' ')) return 60;
    const ot = new Set(o.split(' '));
    const at = new Set(a.split(' '));
    let both = 0;
    for (const t of at) if (ot.has(t)) both++;
    const jaccard = both / (ot.size + at.size - both);
    return jaccard >= 0.7 ? Math.round(50 * jaccard) + 5 : 0;
  }

  /**
   * Several different options matched a candidate equally well. Choosing the
   * shortest is right for "United States" against "United States of America"
   * and "United States Minor Outlying Islands", but a guess when:
   *   - the answer is Yes/No and the options are "Yes, now" / "Yes, in the future";
   *   - the options merely contain the answer ("East Asian" / "South Asian" for "Asian");
   *   - the candidate says it must single out one option (`unique`).
   */
  function isGuess(cand, bestScore) {
    if (cand instanceof RegExp) return Boolean(cand.unique);
    const a = AF.norm(cand);
    return a === 'yes' || a === 'no' || bestScore <= 60;
  }

  /** An answer may be one string/regex or a list of them in priority order. */
  AF.candidates = function candidates(want) {
    if (want == null) return [];
    return (Array.isArray(want) ? want : [want]).filter((c) => c instanceof RegExp || String(c).trim() !== '');
  };

  /**
   * Index of the option that best matches the answer, or -1.
   * Earlier candidates win over later ones regardless of score; among options
   * that tie for a candidate, the shortest wins, unless picking one of them
   * would be a guess (see isGuess), in which case that candidate picks nothing.
   */
  AF.bestOption = function bestOption(options, want) {
    const normed = options.map(AF.norm);
    for (const cand of AF.candidates(want)) {
      let best = -1;
      let bestScore = 0;
      let bestLen = Infinity;
      let tied = new Set();
      options.forEach((opt, i) => {
        const s = score(opt, cand);
        if (s < ACCEPT || s < bestScore) return;
        if (s > bestScore) tied = new Set();
        tied.add(normed[i]);
        const len = normed[i].length;
        if (s > bestScore || len < bestLen) {
          best = i;
          bestScore = s;
          bestLen = len;
        }
      });
      if (best >= 0 && !(tied.size > 1 && isGuess(cand, bestScore))) return best;
    }
    return -1;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
