import Link from 'next/link';
import styles from './events.module.css';

export default function EventsBrand() {
  return (
    <Link href="/" className={styles.brand} aria-label="Okolo — zur Event-Karte">
      <span className={styles.brandMark} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path fillRule="evenodd" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
        </svg>
      </span>
      <span className={styles.brandName}>okolo<span className={styles.brandDot}>.</span></span>
    </Link>
  );
}
