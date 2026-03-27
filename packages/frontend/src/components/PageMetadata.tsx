import { useLocation } from 'react-router'

export const DEFAULT_PAGE_TITLE = 'Infinity Hexagonal Tic-Tac-Toe'
export const DEFAULT_PAGE_DESCRIPTION = 'Play Infinity Hexagonal Tic-Tac-Toe online, host a lobby, join live matches, and review finished games move by move.'

export function getBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined') {
    return import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
  }

  return 'http://localhost:3001'
}

export type PageMetadataProps = {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  ogType: 'website' | 'article';
  robots: string;
}

function buildPageMetadata(
  currentUrl: string,
  overrides: Partial<PageMetadataProps> = {}
): PageMetadataProps {
  return {
    title: overrides.title ?? DEFAULT_PAGE_TITLE,
    description: overrides.description ?? DEFAULT_PAGE_DESCRIPTION,
    url: overrides.url ?? currentUrl.toString(),
    imageUrl: overrides.imageUrl ?? new URL('/favicon.png', currentUrl).toString(),
    ogType: overrides.ogType ?? 'website',
    robots: overrides.robots ?? 'index, follow'
  }
}

function PageMetadata(overrides: Readonly<Partial<PageMetadataProps>>) {
  const location = useLocation();
  const metadata = buildPageMetadata(`${getBaseUrl()}${location.pathname}${location.search}${location.hash}`, overrides)

  return (
    <>
      <title>{metadata.title}</title>
      <meta name="description" content={metadata.description} />
      <meta name="robots" content={metadata.robots} />
      <meta property="og:type" content={metadata.ogType} />
      <meta property="og:title" content={metadata.title} />
      <meta property="og:description" content={metadata.description} />
      <meta property="og:image" content={metadata.imageUrl} />
      <meta property="og:url" content={metadata.url} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={metadata.title} />
      <meta name="twitter:description" content={metadata.description} />
      <meta name="twitter:image" content={metadata.imageUrl} />
      <link rel="canonical" href={metadata.url} />
    </>
  )
}

export default PageMetadata
