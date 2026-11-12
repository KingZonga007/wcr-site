// Fills {{name}} placeholders in an email template. A line that uses a
// placeholder with no value is dropped entirely, so optional pieces (a
// pre-save button, a Scripture line) simply disappear when there's nothing
// to show instead of leaving a broken link or an empty label.
export function fillTemplate(text, vars) {
  return text
    .split('\n')
    .filter((line) => [...line.matchAll(/\{\{(\w+)\}\}/g)].every(([, k]) => vars[k] !== undefined && vars[k] !== null && vars[k] !== ''))
    .map((line) => line.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k])))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// True if a draft still has template markers in it, so it must not be sent.
export function hasUnfilledMarkers(text) {
  return /\{\{\w+\}\}|\[WRITE:/.test(text);
}
