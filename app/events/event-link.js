'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Keep the crawlable href canonical. A normal in-app click carries the return
// context in the navigated URL, while Google and open-in-new-tab see /event/id.
export default function DiscoveryEventLink({ id, returnPath, children, style }) {
  const router = useRouter();
  const href = `/event/${id}`;
  return (
    <Link
      href={href}
      style={style}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        router.push(`${href}?from=${encodeURIComponent(returnPath)}`);
      }}
    >
      {children}
    </Link>
  );
}
