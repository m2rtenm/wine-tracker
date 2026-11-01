import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';

export default function AuthenticatedImage({ src, alt, className }) {
  const auth = useAuth();
  const [loadedImage, setLoadedImage] = useState(null);
  const token = auth.user?.access_token;
  const isProtectedImage = src?.startsWith('/api/wines/');
  const resolvedSrc = isProtectedImage
    ? loadedImage?.src === src && loadedImage?.token === token ? loadedImage.objectUrl : ''
    : src;

  useEffect(() => {
    if (!src?.startsWith('/api/wines/')) return undefined;

    const controller = new AbortController();
    let objectUrl = '';

    const loadImage = async () => {
      try {
        const response = await fetch(src, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Image request failed (${response.status})`);
        }

        const imageBlob = await response.blob();
        const nextObjectUrl = URL.createObjectURL(imageBlob);
        if (controller.signal.aborted) {
          URL.revokeObjectURL(nextObjectUrl);
        } else {
          objectUrl = nextObjectUrl;
          setLoadedImage({ src, token, objectUrl });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to load wine image:', error);
        }
      }
    };

    loadImage();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token]);

  return <img src={resolvedSrc || undefined} alt={alt} className={className} />;
}
