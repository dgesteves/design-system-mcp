import type { Metadata } from 'next';

/**
 * A page's metadata. Next.js replaces nested objects such as `openGraph` rather than merging
 * them with the layout's, so every page sets the whole set here.
 */
export function pageMetadata({
  title,
  socialTitle = `${title} · onsystem`,
  description,
  path,
  image,
}: {
  title: string;
  socialTitle?: string;
  description: string;
  path: string;
  /** An image route from a parent segment; a segment's own opengraph-image is picked up anyway. */
  image?: string | undefined;
}): Metadata {
  const images = image ? [{ url: image, width: 1200, height: 630 }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: 'onsystem',
      title: socialTitle,
      description,
      url: path,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      ...(images ? { images } : {}),
    },
  };
}
