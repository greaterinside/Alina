/**
 * {{variable}} placeholder support for saved prompts — deliberately a
 * simple, literal substitution, not a templating engine. Variable names
 * are word characters only (letters/digits/underscore); order returned
 * is first-appearance order, deduped, so a UI form asks for each one once
 * even if it's used more than once in the body.
 */
export function extractPromptVariables(body: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of body.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      names.push(match[1]);
    }
  }
  return names;
}

/** Replaces every {{name}} in body with values[name] — a variable with no supplied value is left as-is rather than silently blanked. */
export function hydratePromptVariables(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, name) => (values[name]?.trim() ? values[name] : match));
}
