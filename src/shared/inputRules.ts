/**
 * Characters each kind of text field accepts while the user types.
 *
 * Note: These match the save-time patterns in `schemas.ts`, `sales.ts` and `wholesale.ts`, so a
 * value that can be typed can also be saved. Blocking as you type is a convenience; the schemas
 * remain the safeguard because pasted or older values still pass through them.
 */
export const inputRules = {
  /** People: letters (including ñ and accents), spaces, period, comma, apostrophe and hyphen. */
  personName: {
    allowed: /[\p{L} .,'-]/u,
    description: 'letters, spaces, periods, commas, apostrophes and hyphens'
  },
  /** Medicine names, categories, formulations, pharmacy and supplier names. */
  catalogText: {
    allowed: /[\p{L}0-9 .,&()/'%+:-]/u,
    description: "letters, numbers, spaces and . , & ( ) / ' % + : -"
  },
  /** Mobile and landline numbers: digits only. */
  phone: { allowed: /[0-9]/, description: 'numbers' },
  /** Landline numbers keep the usual area-code brackets, spaces and dashes. */
  telephone: { allowed: /[0-9 ()+-]/, description: 'numbers, spaces, brackets, dashes and +' },
  /** Senior Citizen and PWD ID numbers. */
  discountId: { allowed: /[A-Za-z0-9]/, description: 'letters and numbers' },
  /** Batch, invoice, payment and other document references. */
  reference: {
    allowed: /[A-Za-z0-9 ./#_()-]/,
    description: 'letters, numbers, spaces and - / . # _ ( )'
  },
  /** Sign-in usernames. */
  username: {
    allowed: /[A-Za-z0-9._-]/,
    description: 'letters, numbers, dots, dashes and underscores'
  },
  /** Email addresses keep their special characters; only spaces are removed. */
  email: { allowed: /\S/, description: 'any character except spaces' }
} as const

export type InputRule = keyof typeof inputRules

/**
 * Removes characters the rule does not allow. `blocked` lists the distinct characters removed, so
 * the field can say which ones are not accepted.
 */
export function filterInput(rule: InputRule, value: string): { value: string; blocked: string[] } {
  const { allowed } = inputRules[rule]
  const blocked = new Set<string>()
  let result = ''
  for (const character of value) {
    if (allowed.test(character)) result += character
    else blocked.add(character === ' ' ? 'space' : character)
  }
  return { value: result, blocked: [...blocked] }
}
