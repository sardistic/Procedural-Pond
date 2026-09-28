'use strict';
// Pond names: what a player may call their pond. Short, plain, and nothing hateful or obscene.
//  - Up to 24 characters: letters (any alphabet), digits, spaces and a little punctuation (- ' ’ . , ! ? &).
//  - Look-alike characters are read as the letters they stand for (0 as o, 4 as a, $ as s...) and
//    repeated letters squeezed, then two lists are checked: roots that aren't allowed anywhere in the
//    name (letters only, run together), and short words that aren't allowed on their own (so that
//    "grape", "cockatoo" or "Scunthorpe"-like names aren't caught by accident). Hate codes in numbers
//    too. The lists are kept encoded so the words aren't sitting in the source as they are.
// Returns the tidied name, or null if it isn't allowed (or empty).

const ANY = Buffer.from('YmVhbmVyLGJpdGNoLGJsb3dqb2IsY2hpbmssY3VudCxkaWxkbyxldGhuaWNsZWFuLGZhZ290LGZ1Y2ssZ2FzdGhlLGdvbGl3b2csaGFuZGpvYixoZW50YWksaGl0bGVyLGppZ2FibyxqaXosa2lrZSxraWxhbGpld3Msa3lrZSxtb3RoZXJmLG5hemksbmVncm9pZCxuaWdhLG5pZ2VyLG5pZ2xldCxudXRzYWNrLHBhZWRvcGhpbCxwZWRvcGhpbCxwb3JjaG1vbmtleSxwb3JuLHJhZ2hlYWQscmV0YXJkLHNhbWJvLHNoZW1hbGUsc2llZ2hlaWwsc2x1dCxzcGVhcmNodWNrZXIsdG93ZWxoZWFkLHRyYW55LHR3YXQsd2Fuayx3ZXRiYWNrLHdoaXRlcG93ZXIsd2hpdGVwcmlkZSx3aG9yZSx6aXBlcmhlYWQ=', 'base64').toString().split(',');
const WORD = new Set(Buffer.from('YW5hbCxjaGlua3MsY29jayxjb2Nrcyxjb29uLGNvb25zLGN1bSxkaWNrLGRpY2tzLGR5a2UsZHlrZXMsZmFnLGZhZ3MsZ29vayxnb29rcyxob21vLGhvbW9zLGphcCxqYXBzLGtpa2VzLGtrayxreXMsbHluY2gsbmVncm8sbmVncm9lcyxuZWdyb3Msbm9uY2UscGFraSxwYWtpcyxwZWRvLHBlZG9zLHBlbmlzLHB1c3NpZXMscHVzc3kscmFwZSxyYXBlZCxyYXBpc3Qsc2V4LHNoaXQsc2hpdHMsc3BpYyxzcGljcyxzcGlrLHRpdHMsdmFnaW5h', 'base64').toString().split(','));
const LOOK = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };
const fold = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[0134579@$!|+8]/g, (c) => LOOK[c] || c);

function nameAllowed(name) {
  const f = fold(name), run = f.replace(/[^a-z]/g, ''), squeezed = run.replace(/(.)\1+/g, '$1');
  if (ANY.some((w) => squeezed.includes(w))) return false;
  if (/k{3}/.test(run) || /(^|\D)(1488|14\s*88|88\s*14)(\D|$)/.test(name)) return false;
  const tokens = f.split(/[^a-z]+/).filter(Boolean).map((t) => t.replace(/(.)\1{2,}/g, '$1$1'));
  return !tokens.some((t) => WORD.has(t));
}

function cleanTitle(v) {
  if (typeof v !== 'string') return null;
  const t = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 24 || !/^[\p{L}\p{N}][\p{L}\p{N} '’\-.,!?&]*$/u.test(t)) return null;
  return nameAllowed(t) ? t : null;
}

module.exports = { cleanTitle, nameAllowed };
