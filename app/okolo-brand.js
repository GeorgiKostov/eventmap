import Link from 'next/link';

function channelSuffix(handle) {
  if (!handle) return '.';
  const suffix = String(handle).replace(/^okolo/i, '');
  return suffix ? (suffix.startsWith('.') ? suffix : `.${suffix}`) : '.';
}

export default function OkoloBrand({
  href = '/',
  channelHandle = null,
  qualifier = null,
  ariaLabel = 'Okolo',
  className = '',
}) {
  const classes = ['okolo-brand', className].filter(Boolean).join(' ');
  const content = (
    <>
      <span className="okolo-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path fillRule="evenodd" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
        </svg>
      </span>
      <span className="okolo-brand-name">okolo<span className="okolo-brand-suffix">{channelSuffix(channelHandle)}</span></span>
      {qualifier ? <span className="okolo-brand-qualifier">{qualifier}</span> : null}
    </>
  );

  if (href == null) return <span className={classes}>{content}</span>;
  return <Link href={href} className={classes} aria-label={ariaLabel}>{content}</Link>;
}
