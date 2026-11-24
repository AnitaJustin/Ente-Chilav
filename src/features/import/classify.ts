// Suggests a category for a payment. The order of preference is:
//   1. something you've told the app to remember for this merchant
//   2. what the app already knows about common merchants (Swiggy, Uber, Netflix...)
//   3. for a payment to a person, "Sent to people"
//   4. otherwise "Other expense" / "Other income", flagged so you notice and choose
// It only ever suggests. You see every category before anything is saved.

import { merchantKey } from '../../db/rules';
import type { TxType } from '../../db/types';
import { BUSINESS_WORDS, CREDIT_KEYWORDS, DEBIT_KEYWORDS, type KeywordGroup } from './merchants';

export type RuleLike = { merchantKey: string; categoryName: string };
export type SuggestionSource = 'rule' | 'keyword' | 'person' | 'fallback';
export type Suggestion = { categoryName: string; source: SuggestionSource };

// A remembered merchant matches if its name is the same, or appears in the payment's name.
export function matchRule(rules: RuleLike[], name: string): RuleLike | null {
  const key = merchantKey(name);
  if (!key) return null;
  const exact = rules.find((r) => r.merchantKey === key);
  if (exact) return exact;
  const compact = key.replace(/ /g, '');
  let best: RuleLike | null = null;
  for (const r of rules) {
    const rk = r.merchantKey;
    const inside = ` ${key} `.includes(` ${rk} `) || (rk.replace(/ /g, '').length >= 5 && compact.includes(rk.replace(/ /g, '')));
    if (inside && (!best || rk.length > best.merchantKey.length)) best = r;
  }
  return best;
}

// How strongly a phrase matches a name: its length, or 0 for no match.
function phraseScore(key: string, compact: string, phrase: string): number {
  if (` ${key} `.includes(` ${phrase} `)) return phrase.length;
  const flat = phrase.replace(/ /g, '');
  // longer phrases may match even when the text reader has glued the words together ("bigbasket", "thirdwavecoffee")
  if (flat.length >= 5 && compact.includes(flat)) return flat.length - 0.5;
  return 0;
}

function keywordMatch(groups: KeywordGroup[], name: string): string | null {
  const key = merchantKey(name);
  if (!key) return null;
  const compact = key.replace(/ /g, '');
  let best: { category: string; score: number } | null = null;
  for (const g of groups) {
    for (const w of g.words) {
      const score = phraseScore(key, compact, w);
      if (score > 0 && (!best || score > best.score)) best = { category: g.category, score };
    }
  }
  return best ? best.category : null;
}

// "Rohan Sharma" yes. "Uber India" or "Sri Krishna Stores" no.
export function looksLikePerson(name: string): boolean {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 3) return false;
  return tokens.every((t) => {
    if (!/^[A-Za-z][A-Za-z.'-]+$/.test(t)) return false; // letters only (no digits, & or @)
    if (BUSINESS_WORDS.has(t.toLowerCase().replace(/[.'-]/g, ''))) return false;
    return /^[A-Z]/.test(t); // capitalised, as names are
  });
}

export function suggestCategory(name: string, type: TxType, rules: RuleLike[]): Suggestion {
  const rule = matchRule(rules, name);
  if (rule) return { categoryName: rule.categoryName, source: 'rule' };

  const known = keywordMatch(type === 'credit' ? CREDIT_KEYWORDS : DEBIT_KEYWORDS, name);
  if (known) return { categoryName: known, source: 'keyword' };

  if (type === 'debit' && looksLikePerson(name)) return { categoryName: 'Sent to people', source: 'person' };
  return { categoryName: type === 'debit' ? 'Other expense' : 'Other income', source: 'fallback' };
}
