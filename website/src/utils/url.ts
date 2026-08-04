/**
 * `build.format: 'file'` fa sì che, in fase di generazione statica,
 * `Astro.url.pathname` valga `/piattaforma.html` e non `/piattaforma`.
 *
 * Chiunque confronti il percorso corrente con un href di navigazione deve
 * quindi normalizzarlo prima, altrimenti nessun confronto va a segno.
 */
export function cleanPath(pathname: string): string {
  return (
    pathname
      .replace(/\/index\.html$/, '/')
      .replace(/\.html$/, '')
      .replace(/\/+$/, '') || '/'
  );
}

/** `true` se `href` è la pagina corrente o una sua sottopagina. */
export function isActivePath(current: string, href: string): boolean {
  const path = cleanPath(current);
  return path === href || path.startsWith(`${href}/`);
}
