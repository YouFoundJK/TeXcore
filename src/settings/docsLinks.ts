/**
 * @file docsLinks.ts
 * @brief Shared helpers for adding documentation links to settings descriptions.
 */

import {
  createLinksFragment,
  createMarkdownLinksFragment,
  LinkItem,
  linkItemsToSegments
} from './linkTextFragments';

export interface DocsLink {
  text: string;
  path: string;
}

const DOCS_ROOT = 'https://youfoundjk.github.io/ObsiTeXcore/';

export function toDocsUrl(path: string): string {
  return `${DOCS_ROOT}${path.replace(/^\/+/, '')}`;
}

export function createDocsLinksFragment(
  links: DocsLink[],
  prefix = 'Learn more'
): DocumentFragment {
  const doc = window.activeDocument ?? window.activeWindow?.document ?? window.document;
  if (!doc) {
    return new DocumentFragment();
  }
  if (links.length === 0) {
    return doc.createDocumentFragment();
  }

  const fragment = doc.createDocumentFragment();
  fragment.append(prefix, ' ');

  const linkItems: LinkItem[] = links.map(link => ({
    text: link.text,
    href: toDocsUrl(link.path)
  }));

  fragment.append(createLinksFragment(linkItemsToSegments(linkItems), { betweenLinksText: ' | ' }));
  return fragment;
}

export function createDescWithDocs(description: string, links: DocsLink[]): DocumentFragment {
  const doc = window.activeDocument ?? window.activeWindow?.document ?? window.document;
  if (!doc) {
    return createMarkdownLinksFragment(description);
  }
  const fragment = doc.createDocumentFragment();
  fragment.append(createMarkdownLinksFragment(description));
  if (links.length > 0) {
    fragment.append(' ');
    fragment.append(createDocsLinksFragment(links));
  }
  return fragment;
}
