import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';

let nextImageRequestAt = 0;

function waitForImageRequestSlot(signal) {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextImageRequestAt);
  nextImageRequestAt = scheduledAt + 125;
  const delay = scheduledAt - now;

  if (delay === 0) return Promise.resolve();
  if (signal.aborted) return Promise.reject(new DOMException('Request aborted', 'AbortError'));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException('Request aborted', 'AbortError'));
    };

    signal.addEventListener('abort', abort, { once: true });
  });
}

export default function AuthenticatedImage({ src, alt, className }) {
  const auth = useAuth();
  const [loadedImage, setLoadedImage] = useState(null);
  const token = auth.user?.access_token;
  const isProtectedImage = src?.startsWith('/api/wines/');
  const resolvedSrc = isProtectedImage
    ? loadedImage?.src === src && loadedImage?.token === token ? loadedImage.signedUrl : ''
    : src;

  useEffect(() => {
    if (!src?.startsWith('/api/wines/')) return undefined;

    const controller = new AbortController();

    const loadImage = async () => {
      try {
        await waitForImageRequestSlot(controller.signal);
        const response = await fetch(src, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Image request failed (${response.status})`);
        }

        const { imageUrl } = await response.json();
        if (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
          throw new Error('Image response did not contain a valid URL');
        }

        if (!controller.signal.aborted) {
          setLoadedImage({ src, token, signedUrl: imageUrl });
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
    };
  }, [src, token]);

  return <img src={resolvedSrc || undefined} alt={alt} className={className} />;
}
