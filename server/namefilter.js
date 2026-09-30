'use strict';
// Pond names: what a player may call their pond (and so its address, pond.nz/its-name). Short, plain, and nothing
// hateful, obscene, sexual, cruel or pretending to be the site. Filtered heavily:
//  - Up to 24 characters: letters (any alphabet), digits, spaces and a little punctuation (- ' ’ . , ! ? &).
//  - Look-alike characters are read as the letters they stand for (0 as o, 4 as a, $ as s, Cyrillic and Greek
//    letters that look Latin as Latin...), marks and invisible characters stripped, and repeated letters squeezed;
//    then the name is checked run together (and backwards) for roots that aren't allowed anywhere, word by word
//    for words that aren't allowed on their own (so "grape", "cockatoo" or "Scunthorpe"-like names aren't caught by
//    accident), for hate codes and juvenile numbers, and for addresses (web, mail, phone) and long numbers.
//  - The lists are kept encoded so the words aren't sitting in the source as they are.
// Returns the tidied name, or null if it isn't allowed (or empty).

const decode = (b) => Buffer.from(b, 'base64').toString().split(',');
const ANY = [...decode('YmVhbmVyLGJpdGNoLGJsb3dqb2IsY2hpbmssY3VudCxkaWxkbyxldGhuaWNsZWFuLGZhZ290LGZ1Y2ssZ2FzdGhlLGdvbGl3b2csaGFuZGpvYixoZW50YWksaGl0bGVyLGppZ2FibyxqaXosa2lrZSxraWxhbGpld3Msa3lrZSxtb3RoZXJmLG5hemksbmVncm9pZCxuaWdhLG5pZ2VyLG5pZ2xldCxudXRzYWNrLHBhZWRvcGhpbCxwZWRvcGhpbCxwb3JjaG1vbmtleSxwb3JuLHJhZ2hlYWQscmV0YXJkLHNhbWJvLHNoZW1hbGUsc2llZ2hlaWwsc2x1dCxzcGVhcmNodWNrZXIsdG93ZWxoZWFkLHRyYW55LHR3YXQsd2Fuayx3ZXRiYWNrLHdoaXRlcG93ZXIsd2hpdGVwcmlkZSx3aG9yZSx6aXBlcmhlYWQ='), ...decode('ZnVrLGZ1cSxwaHVrLGZjdWssc2hpdCxiYXN0YXJkLGJvbGxvY2ssdmlicmF0b3Isb3JnYXNtLG1hc3R1cmIsZWphY3VsLG1pbGYsaW5jZXN0LG1vbGVzdCxiZXN0aWFsLGJlYXN0aWFsLG5lY3JvcGhpbCx6b29waGlsLG5zZncsb25seWZhbnMsamloYWQsdGVycm9yaXN0LGdlbm9jaWQsc3VpY2lkLGtpbGx5b3Vyc2VsZixjdXR5b3Vyc2VsZixzZWxmaGFybSxjb2NhaW5lLGhhbGZicmVlZCxyZWRza2luLHNxdWF3LG1vbmdvbG9pZCxkYXJraWUsa2FmZmlyLGthZmlyLHNoeWxvY2ssY2hpbmFtYW4sc2xhbnRleWUsc2FuZG5pZyxuaWdnLHNwYXN0aWMsYnVra2FrZSxjdW1zaG90LHRpdHR5LHRpdHRpZXMsYm9vYmllcyxzY3JvdHVtLHRlc3RpY2wsZXJvdGljLGZldGlzaCxib25kYWdlLGhvb2tlcixwcm9zdGl0dXQsc3RyaXBwZXIsbG9saXRhLHN3YXN0aWthLGFyeWFuLHdoaXRlcHJpZGUsd2hpdGVwb3dlcg==')];
const WORD = new Set([...decode('YW5hbCxjaGlua3MsY29jayxjb2Nrcyxjb29uLGNvb25zLGN1bSxkaWNrLGRpY2tzLGR5a2UsZHlrZXMsZmFnLGZhZ3MsZ29vayxnb29rcyxob21vLGhvbW9zLGphcCxqYXBzLGtpa2VzLGtrayxreXMsbHluY2gsbmVncm8sbmVncm9lcyxuZWdyb3Msbm9uY2UscGFraSxwYWtpcyxwZWRvLHBlZG9zLHBlbmlzLHB1c3NpZXMscHVzc3kscmFwZSxyYXBlZCxyYXBpc3Qsc2V4LHNoaXQsc2hpdHMsc3BpYyxzcGljcyxzcGlrLHRpdHMsdmFnaW5h'), ...decode('YXNzLGFzc2VzLGFyc2UsYXJzZXMsdGl0LGJvb2IsYm9vYnMsc2V4eSxudWRlLG51ZGVzLG5ha2VkLGhvcm55LHRob3QsaG9lLGhvZXMsc2xhZyxza2FuayxwaW1wLHdvcCxkYWdvLHlpZCxrbXMsYmRzbSxtZXRoLGlzaXMsbmF6aXMsc3Msc3BheixneXAsZmFwLHNwZXJtLHNlbWVuLGJqLHd0ZixzdGZ1LGd0Zm8saWRpb3QsbW9yb24sc3R1cGlkLGxvc2VyLHJhY2lzdCxzZXgsc2V4dWFsLHN0YWxpbixvc2FtYSxpbmp1bixob25reSxjb29ucyxjbGl0LGFudXMsaGVyb2luLGFkbWluLGFkbWluaXN0cmF0b3IsbW9kZXJhdG9yLG1vZCxtb2RzLG9mZmljaWFs')]);
const LOOK = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e', '£': 'l', '¡': 'i' };
// Cyrillic and Greek letters that look like Latin ones.
const GLYPH = { а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', γ: 'y' };
const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ​-‏⁠﻿]/g, '').toLowerCase()
  .replace(/[Ͱ-ϿЀ-ӿԀ-ԯɑ-ɡ]/g, (c) => GLYPH[c] || c).replace(/[0134579@$!|+8€£¡]/g, (c) => LOOK[c] || c);

function nameAllowed(name) {
  const f = fold(name), run = f.replace(/[^a-z]/g, ''), squeezed = run.replace(/(.)\1+/g, '$1'), back = [...squeezed].reverse().join('');
  if (ANY.some((w) => squeezed.includes(w) || run.includes(w) || back.includes(w))) return false;
  if (/k{3}/.test(run) || /x{3}/.test(run)) return false;
  // Hate codes and juvenile numbers, and anything that reads as an address or a long number.
  if (/(^|\D)(1488|14\s*88|88\s*14|88|69|420|666)(\D|$)/.test(name) || /\d{5,}/.test(name.replace(/[\s.-]/g, ''))) return false;
  if (/(https?|www|\.(com|net|org|nz|io|gg|xyz|ru|co)\b|pond\s*\.?\s*nz|discord\.|@)/i.test(name)) return false;
  const tokens = f.split(/[^a-z]+/).filter(Boolean).map((t) => t.replace(/(.)\1{2,}/g, '$1$1'));
  return !tokens.some((t) => WORD.has(t) || WORD.has(t.replace(/(.)\1+/g, '$1')));
}

function cleanTitle(v) {
  if (typeof v !== 'string') return null;
  const t = v.normalize('NFC').replace(/[​-‏⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 24 || !/^[\p{L}\p{N}][\p{L}\p{N} '’\-.,!?&]*$/u.test(t)) return null;
  if (/([^\s])\1{3,}/u.test(t) || /[.,!?&'’-]{3,}/.test(t)) return null; // (no runs of the same letter or of punctuation)
  return nameAllowed(t) ? t : null;
}

module.exports = { cleanTitle, nameAllowed };
