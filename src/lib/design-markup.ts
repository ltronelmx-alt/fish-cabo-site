// Design-only markup hooks (classes / wrappers). Never changes text, links or order.
// - <li> whose content starts with a nested list → class "li-wrap" (no empty orange bullet)
// - 2+ consecutive single-link paragraphs (p.cta) → wrapped in <div class="cta-group"> (equal-width buttons)
export const liWrap = (html: string) => html.replace(/<li>(\s*)<(ul|ol)([\s>])/g, '<li class="li-wrap">$1<$2$3');
export const ctaGroups = (html: string) =>
  html.replace(/(?:<p class="cta">(?:(?!<\/p>)[\s\S])*<\/p>\s*){2,}/g, (run) => `<div class="cta-group">${run.trim()}</div>`);
