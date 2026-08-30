'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowSquareOut,
  ChartLineUp,
  CheckCircle,
  ClockCountdown,
  DeviceMobile,
  LinkSimple,
  MapPin,
  Megaphone,
  PaintBrushBroad,
  ShieldCheck,
} from '@phosphor-icons/react';
import { track } from '../../lib/analytics.js';
import { useLanguage } from '../language-provider.js';
import OkoloBrand from '../okolo-brand.js';
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

const PILOT_STEPS = [
  ['01', 'partnerShowcasePilotStepScope', 'partnerShowcasePilotStepScopeCopy'],
  ['02', 'partnerShowcasePilotStepPreview', 'partnerShowcasePilotStepPreviewCopy'],
  ['03', 'partnerShowcasePilotStepLaunch', 'partnerShowcasePilotStepLaunchCopy'],
];

export default function PartnerShowcase() {
  const { lang, t, chooseLanguage } = useLanguage();
  const contactHref = `mailto:hello@okolo.events?subject=${encodeURIComponent(t.partnerShowcaseMailSubject)}&body=${encodeURIComponent(t.partnerShowcaseMailBody)}`;

  useEffect(() => {
    track('partner_showcase_view', { placement: 'html_showcase' });
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <OkoloBrand />
        <div className={styles.navActions}>
          <div className={styles.languages} aria-label={t.partnerDemoLanguage}>
            {['de', 'en', 'bg'].map((value) => (
              <button key={value} className={lang === value ? styles.languageActive : ''} onClick={() => chooseLanguage(value)}>
                {value.toUpperCase()}
              </button>
            ))}
          </div>
          <a className={styles.navCta} href={contactHref} onClick={() => track('partner_showcase_contact', { placement: 'nav' })}>
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
            <a className={styles.primaryCta} href={contactHref} onClick={() => track('partner_showcase_contact', { placement: 'hero' })}>
              {t.partnerShowcaseTalk} <ArrowRight size={18} weight="bold" />
            </a>
            <Link className={styles.secondaryCta} href="/partners/demo" onClick={() => track('partner_showcase_demo_open', { placement: 'hero' })}>
              {t.partnerShowcaseOpenDemo}
            </Link>
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

      <section className={styles.proofBar} aria-label={t.partnerShowcaseProofLabel}>
        <span><CheckCircle size={17} weight="fill" /> {t.partnerShowcaseProofNoApp}</span>
        <span><CheckCircle size={17} weight="fill" /> {t.partnerShowcaseProofSource}</span>
        <span><CheckCircle size={17} weight="fill" /> {t.partnerShowcaseProofDistribution}</span>
        <span><CheckCircle size={17} weight="fill" /> {t.partnerShowcaseProofReport}</span>
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

      <section className={styles.platformProof}>
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>{t.partnerShowcasePlatformEyebrow}</span>
          <h2>{t.partnerShowcasePlatformTitle}</h2>
          <p>{t.partnerShowcasePlatformCopy}</p>
        </div>
        <div className={styles.platformGrid}>
          <article>
            <MapPin size={24} weight="duotone" />
            <h3>{t.partnerShowcasePlatformMap}</h3>
            <p>{t.partnerShowcasePlatformMapCopy}</p>
            <Link href="/" onClick={() => track('partner_showcase_live_proof_open', { placement: 'map' })}>
              {t.partnerShowcasePlatformMapLink} <ArrowSquareOut size={15} />
            </Link>
          </article>
          <article>
            <ChartLineUp size={24} weight="duotone" />
            <h3>{t.partnerShowcasePlatformDistribution}</h3>
            <p>{t.partnerShowcasePlatformDistributionCopy}</p>
            <Link href="/events/linz/wochenende" onClick={() => track('partner_showcase_live_proof_open', { placement: 'discovery' })}>
              {t.partnerShowcasePlatformDistributionLink} <ArrowSquareOut size={15} />
            </Link>
          </article>
        </div>
      </section>

      <section className={styles.pilot} id="pilot">
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>{t.partnerShowcasePilotEyebrow}</span>
          <h2>{t.partnerShowcasePilotTitle}</h2>
          <p>{t.partnerShowcasePilotCopy}</p>
        </div>
        <div className={styles.pilotGrid}>
          {PILOT_STEPS.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <div><h3>{t[title]}</h3><p>{t[copy]}</p></div>
            </article>
          ))}
        </div>
        <div className={styles.caseStudy}>
          <ShieldCheck size={30} weight="duotone" />
          <div>
            <h3>{t.partnerShowcaseCaseTitle}</h3>
            <p>{t.partnerShowcaseCaseCopy}</p>
          </div>
          <a href={contactHref} onClick={() => track('partner_showcase_contact', { placement: 'pilot' })}>
            {t.partnerShowcasePilotCta} <ArrowRight size={17} weight="bold" />
          </a>
        </div>
      </section>

      <section className={styles.finalCta}>
        <span className={styles.eyebrow}>{t.partnerShowcaseFinalEyebrow}</span>
        <h2>{t.partnerShowcaseFinalTitle}</h2>
        <p>{t.partnerShowcaseFinalCopy}</p>
        <a href={contactHref} onClick={() => track('partner_showcase_contact', { placement: 'final' })}>
          {t.partnerShowcaseTalk} <ArrowRight size={18} weight="bold" />
        </a>
        <small>{t.partnerShowcaseDisclaimer}</small>
      </section>
    </main>
  );
}
