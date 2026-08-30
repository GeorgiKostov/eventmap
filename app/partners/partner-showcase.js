'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ChartLineUp,
  ClockCountdown,
  DeviceMobile,
  LinkSimple,
  MapPin,
  Megaphone,
  PaintBrushBroad,
} from '@phosphor-icons/react';
import { track } from '../../lib/analytics.js';
import { useLanguage } from '../language-provider.js';
import styles from './partners.module.css';

const FEATURES = [
  ['partnerShowcaseFeatureUrl', 'partnerShowcaseFeatureUrlCopy', LinkSimple],
  ['partnerShowcaseFeatureBrand', 'partnerShowcaseFeatureBrandCopy', PaintBrushBroad],
  ['partnerShowcaseFeatureFilter', 'partnerShowcaseFeatureFilterCopy', MapPin],
  ['partnerShowcaseFeatureSchedule', 'partnerShowcaseFeatureScheduleCopy', ClockCountdown],
  ['partnerShowcaseFeatureMobile', 'partnerShowcaseFeatureMobileCopy', Megaphone],
  ['partnerShowcaseFeatureMeasure', 'partnerShowcaseFeatureMeasureCopy', ChartLineUp],
];

const PACKAGE = [
  ['01', 'partnerShowcaseLayerBrand', 'partnerShowcaseLayerBrandCopy'],
  ['02', 'partnerShowcaseLayerProgramme', 'partnerShowcaseLayerProgrammeCopy'],
  ['03', 'partnerShowcaseLayerProof', 'partnerShowcaseLayerProofCopy'],
];

export default function PartnerShowcase() {
  const { lang, t, chooseLanguage } = useLanguage();

  useEffect(() => {
    track('partner_showcase_view', { placement: 'html_showcase' });
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.wordmark} href="/" aria-label="Okolo">okolo<span>.</span></Link>
        <div className={styles.navActions}>
          <div className={styles.languages} aria-label={t.partnerDemoLanguage}>
            {['de', 'en', 'bg'].map((value) => (
              <button key={value} className={lang === value ? styles.languageActive : ''} onClick={() => chooseLanguage(value)}>
                {value.toUpperCase()}
              </button>
            ))}
          </div>
          <a className={styles.navCta} href="mailto:hello@okolo.events?subject=Festival%20map%20partnership" onClick={() => track('partner_showcase_contact', { placement: 'nav' })}>
            {t.partnerShowcaseTalk} <ArrowRight size={15} weight="bold" />
          </a>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{t.partnerShowcaseEyebrow}</span>
          <h1>{t.partnerShowcaseTitle}<span>{t.partnerShowcaseTitleAccent}</span></h1>
          <p>{t.partnerShowcaseIntro}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/partners/demo" onClick={() => track('partner_showcase_demo_open', { placement: 'hero' })}>
              {t.partnerShowcaseOpenDemo} <ArrowRight size={18} weight="bold" />
            </Link>
            <a className={styles.secondaryCta} href="#package">{t.partnerShowcaseSeePackage}</a>
          </div>
          <div className={styles.heroFacts}>
            <span><MapPin size={16} weight="fill" /> {t.partnerShowcaseFactCity}</span>
            <span><DeviceMobile size={16} weight="fill" /> {t.partnerShowcaseFactScreens}</span>
            <span><ChartLineUp size={16} weight="fill" /> {t.partnerShowcaseFactProof}</span>
          </div>
        </div>

        <div className={styles.browserFrame}>
          <div className={styles.browserBar}>
            <span className={styles.browserDots} aria-hidden="true"><i /><i /><i /></span>
            <span>okolo.events/yourfestival</span>
            <Link href="/partners/demo" aria-label={t.partnerShowcaseOpenDemo}><ArrowRight size={15} /></Link>
          </div>
          <Link
            className={styles.demoPreview}
            href="/partners/demo"
            aria-label={t.partnerShowcaseOpenDemo}
            onClick={() => track('partner_showcase_demo_open', { placement: 'hero_preview' })}
          >
            <Image
              className={styles.desktopPreview}
              src="/partners/festival-map-showcase.webp"
              alt={t.partnerShowcaseFrameTitle}
              width={1280}
              height={720}
              priority
            />
            <Image
              className={styles.mobilePreview}
              src="/partners/festival-map-showcase-mobile.webp"
              alt={t.partnerShowcaseFrameTitle}
              width={390}
              height={844}
              priority
            />
          </Link>
        </div>
      </section>

      <section className={styles.useCase}>
        <div>
          <span className={styles.eyebrow}>{t.partnerShowcaseUseCaseEyebrow}</span>
          <h2>{t.partnerShowcaseUseCaseTitle}</h2>
          <p>{t.partnerShowcaseUseCaseCopy}</p>
        </div>
        <ol className={styles.timeline}>
          <li><strong>14:00</strong><span>{t.partnerShowcaseMomentOne}</span></li>
          <li><strong>14:05</strong><span>{t.partnerShowcaseMomentTwo}</span></li>
          <li><strong>15:00</strong><span>{t.partnerShowcaseMomentThree}</span></li>
        </ol>
      </section>

      <section className={styles.features}>
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>{t.partnerShowcaseFeaturesEyebrow}</span>
          <h2>{t.partnerShowcaseFeaturesTitle}</h2>
          <p>{t.partnerShowcaseFeaturesCopy}</p>
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map(([title, copy, Icon]) => (
            <article key={title}>
              <Icon size={24} weight="duotone" />
              <h3>{t[title]}</h3>
              <p>{t[copy]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.package} id="package">
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>{t.partnerShowcasePackageEyebrow}</span>
          <h2>{t.partnerShowcasePackageTitle}</h2>
          <p>{t.partnerShowcasePackageCopy}</p>
        </div>
        <div className={styles.packageGrid}>
          {PACKAGE.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{t[title]}</h3>
              <p>{t[copy]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <span className={styles.eyebrow}>{t.partnerShowcaseFinalEyebrow}</span>
        <h2>{t.partnerShowcaseFinalTitle}</h2>
        <p>{t.partnerShowcaseFinalCopy}</p>
        <a href="mailto:hello@okolo.events?subject=Festival%20map%20partnership" onClick={() => track('partner_showcase_contact', { placement: 'final' })}>
          {t.partnerShowcaseTalk} <ArrowRight size={18} weight="bold" />
        </a>
        <small>{t.partnerShowcaseDisclaimer}</small>
      </section>
    </main>
  );
}
