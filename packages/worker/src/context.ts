import RULESET from './RULESET.md';

/**
 * The one deliberate manual-sync point: edit this with your own site's real
 * content after copying this Worker. It can't be auto-generated from your
 * site's own data files, since this Worker doesn't share a build step with
 * your frontend — if your services/projects change, remember to update this
 * too.
 */
const SITE_CONTEXT = `## About
(Replace this with a short description of your organization or site.)

## Services / Projects
- (List the real things this assistant should be able to talk about.)

## Contact
- (Name a real contact channel — an email address or contact page URL — that
  the assistant should point visitors to when it doesn't have an answer.
  This must match the fallback contact channel referenced in RULESET.md.)
`;

export const SYSTEM_CONTEXT = `${RULESET}\n\n${SITE_CONTEXT}`;
