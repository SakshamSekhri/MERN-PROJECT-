export function restoreVercelApiPath(url) {
  const parsed = new URL(url, 'http://pixelverse.local');
  const route = parsed.searchParams.get('pv_route');
  if (route === null) return url;
  parsed.searchParams.delete('pv_route');
  if (!route || route.startsWith('/') || route.includes('..') || route.includes('\\'))
    return '/api/invalid-route';
  return `/api/${route}${parsed.search}`;
}
