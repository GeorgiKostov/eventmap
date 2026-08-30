import { CATS } from '../../lib/icons.js';
import { sectionsOf } from '../../lib/digest.js';
import { availableDigestItems } from '../../lib/seo-pages.js';
import DiscoveryEventLink from './event-link.js';
import styles from './events.module.css';

function usefulTeaser(value) {
  const teaser = String(value || '').trim();
  if (!teaser || /^Am Wochenende geht es um /i.test(teaser)) return null;
  return teaser;
}

function highlightWhen(item, event) {
  if (!event?.ongoing || !event.ends_at) return item.when;
  const end = new Date(`${event.ends_at.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(end.getTime())) return item.when;
  const label = new Intl.DateTimeFormat('de-AT', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(end);
  return `Läuft bis ${label}`;
}

export default function WeekendHighlights({ digest, events, returnPath }) {
  const items = availableDigestItems(digest, events);
  if (!items.length) return null;
  const groups = sectionsOf(items, 'de');
  const eventsById = new Map(events.map((event) => [String(event.id), event]));
  let position = 0;

  return (
    <section aria-labelledby="weekend-highlights" className={styles.highlights}>
      <p className={styles.sectionEyebrow}>Okolo-Auswahl · {items.length} Tipps</p>
      <h2 id="weekend-highlights" className={styles.sectionTitle}>Unsere Empfehlungen für dieses Wochenende</h2>
      <p className={styles.sectionIntro}>Eine kurze Auswahl aus dem aktuellen Wochenendprogramm. Die vollständige, laufend aktualisierte Liste folgt darunter.</p>

      {groups.map((group) => (
        <div key={group.key || 'all'} className={styles.highlightGroup}>
          {group.title && <h3 className={styles.highlightGroupTitle}>{group.title}</h3>}
          <ol className={styles.highlightGrid}>
            {group.items.map((item) => {
              position += 1;
              const color = CATS[item.cat]?.color || '#C93A5B';
              const teaser = usefulTeaser(item.teaser);
              const when = highlightWhen(item, eventsById.get(String(item.id)));
              return (
                <li key={item.id} className={styles.highlightCard} style={{ '--event-color': color }}>
                  <DiscoveryEventLink id={item.id} returnPath={returnPath} className={styles.highlightLink}>
                    <span className={styles.highlightNumber} aria-hidden="true">{position}</span>
                    <span className={styles.highlightBody}>
                      <span className={styles.highlightTitle}>{item.title}</span>
                      <span className={styles.highlightMeta}>{when}{item.venue ? ` · ${item.venue}` : ''}</span>
                      {teaser && <span className={styles.highlightTeaser}>{teaser}</span>}
                      {item.badges?.length > 0 && (
                        <span className={styles.highlightBadges}>
                          {item.badges.map((badge) => <span key={badge} className={styles.highlightBadge}>{badge}</span>)}
                        </span>
                      )}
                    </span>
                  </DiscoveryEventLink>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
