import { DocumentLayout, Section, Paragraph, List } from '@/components/shared/DocumentLayout'
import { SEO } from '@/components/SEO'
import { Trans, useTranslation } from 'react-i18next'
import {
  COMMISSION_TIER_1_MAX,
  COMMISSION_TIER_1_FIXED,
  COMMISSION_TIER_2_MAX,
  COMMISSION_TIER_2_RATE,
  COMMISSION_TIER_3_MAX,
  COMMISSION_TIER_3_RATE,
  COMMISSION_TIER_4_RATE,
  AUTO_BAN_LOSS_STREAK,
  MIN_DEAL_AMOUNT
} from '@/config/constants'

export function TermsPage() {
  const { t } = useTranslation()

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('terms.title'),
    description: t('terms.seo_description'),
    dateModified: '2025-12-04',
  }

  const commissionParams = {
    tier1Max: COMMISSION_TIER_1_MAX,
    tier1Fixed: COMMISSION_TIER_1_FIXED,
    tier2Rate: (COMMISSION_TIER_2_RATE * 100).toFixed(1),
    tier2Max: COMMISSION_TIER_2_MAX,
    tier3Rate: (COMMISSION_TIER_3_RATE * 100).toFixed(0),
    tier3Max: COMMISSION_TIER_3_MAX,
    tier4Rate: (COMMISSION_TIER_4_RATE * 100).toFixed(1),
  }

  return (
    <>
      <SEO
        title={t('terms.seo_title')}
        description={t('terms.seo_description')}
        url="/terms"
        schema={schema}
      />
      <DocumentLayout title={t('terms.title')} date={t('terms.date')}>
      <Section title={t('terms.s1_title')}>
        <Paragraph>{t('terms.s1_p1')}</Paragraph>
        <Paragraph>{t('terms.s1_p2')}</Paragraph>
        <Paragraph>{t('terms.s1_p3')}</Paragraph>
      </Section>

      <Section title={t('terms.s2_title')}>
        <Paragraph>{t('terms.s2_p1')}</Paragraph>
        <Paragraph>{t('terms.s2_p2')}</Paragraph>
        <List items={[t('terms.s2_l1'), t('terms.s2_l2'), t('terms.s2_l3'), t('terms.s2_l4')]} />
        <Paragraph>{t('terms.s2_p3')}</Paragraph>
      </Section>

      <Section title={t('terms.s3_title')}>
        <Paragraph>{t('terms.s3_p1')}</Paragraph>
        <Paragraph>{t('terms.s3_p2')}</Paragraph>
        <List items={[t('terms.s3_l1'), t('terms.s3_l2'), t('terms.s3_l3'), t('terms.s3_l4')]} />
        <Paragraph>{t('terms.s3_p3')}</Paragraph>
      </Section>

      <Section title={t('terms.s4_title')}>
        <Paragraph>{t('terms.s4_p1')}</Paragraph>
        <Paragraph>{t('terms.s4_p2')}</Paragraph>
        <List items={[t('terms.s4_l1'), t('terms.s4_l2'), t('terms.s4_l3')]} />
        <Paragraph>
          <Trans i18nKey="terms.s4_p3" components={{ strong: <strong /> }} />
        </Paragraph>
        <Paragraph>{t('terms.s4_p4')}</Paragraph>
        <List items={[t('terms.s4_l4'), t('terms.s4_l5'), t('terms.s4_l6')]} />
        <Paragraph>{t('terms.s4_p5', { minAmount: MIN_DEAL_AMOUNT })}</Paragraph>
        <Paragraph>{t('terms.s4_p6')}</Paragraph>
        <Paragraph>{t('terms.s4_p7')}</Paragraph>
      </Section>

      <Section title={t('terms.s5_title')}>
        <Paragraph>{t('terms.s5_p1')}</Paragraph>
        <Paragraph>{t('terms.s5_p2')}</Paragraph>
        <Paragraph>{t('terms.s5_p3')}</Paragraph>
        <List items={[t('terms.s5_l1'), t('terms.s5_l2')]} />
        <Paragraph>{t('terms.s5_p4')}</Paragraph>
        <Paragraph>{t('terms.s5_p5')}</Paragraph>
      </Section>

      <Section title={t('terms.s6_title')}>
        <Paragraph>{t('terms.s6_p1')}</Paragraph>
        <List
          items={[
            t('terms.s6_l1', commissionParams),
            t('terms.s6_l2', commissionParams),
            t('terms.s6_l3', commissionParams),
            t('terms.s6_l4', commissionParams),
          ]}
        />
        <Paragraph>{t('terms.s6_p2')}</Paragraph>
        <List items={[t('terms.s6_l5'), t('terms.s6_l6'), t('terms.s6_l7'), t('terms.s6_l8')]} />
        <Paragraph>{t('terms.s6_p3')}</Paragraph>
        <Paragraph>{t('terms.s6_p4')}</Paragraph>
        <List items={[t('terms.s6_l9'), t('terms.s6_l10'), t('terms.s6_l11')]} />
        <Paragraph>{t('terms.s6_p5')}</Paragraph>
        <Paragraph>
          <Trans i18nKey="terms.s6_p6" components={{ strong: <strong /> }} />
        </Paragraph>
      </Section>

      <Section title={t('terms.s7_title')}>
        <Paragraph>{t('terms.s7_p1')}</Paragraph>
        <List items={[t('terms.s7_l1'), t('terms.s7_l2'), t('terms.s7_l3')]} />
        <Paragraph>{t('terms.s7_p2')}</Paragraph>
        <List items={[t('terms.s7_l4'), t('terms.s7_l5'), t('terms.s7_l6')]} />
        <Paragraph>{t('terms.s7_p3')}</Paragraph>
        <Paragraph>{t('terms.s7_p4')}</Paragraph>
        <Paragraph>{t('terms.s7_p5')}</Paragraph>
        <Paragraph>{t('terms.s7_p6')}</Paragraph>
      </Section>

      <Section title={t('terms.s8_title')}>
        <Paragraph>{t('terms.s8_p1')}</Paragraph>
        <List
          items={[
            t('terms.s8_l1', { banStreak: AUTO_BAN_LOSS_STREAK }),
            t('terms.s8_l2'),
            t('terms.s8_l3'),
          ]}
        />
        <Paragraph>{t('terms.s8_p2')}</Paragraph>
        <List items={[t('terms.s8_l4'), t('terms.s8_l5'), t('terms.s8_l6')]} />
        <Paragraph>{t('terms.s8_p3')}</Paragraph>
      </Section>

      <Section title={t('terms.s9_title')}>
        <Paragraph>{t('terms.s9_p1')}</Paragraph>
        <Paragraph>{t('terms.s9_p2')}</Paragraph>
        <List
          items={[
            t('terms.s9_l1'), t('terms.s9_l2'), t('terms.s9_l3'), t('terms.s9_l4'),
            t('terms.s9_l5'), t('terms.s9_l6'), t('terms.s9_l7'), t('terms.s9_l8'),
          ]}
        />
        <Paragraph>{t('terms.s9_p3')}</Paragraph>
        <Paragraph>{t('terms.s9_p4')}</Paragraph>
      </Section>

      <Section title={t('terms.s10_title')}>
        <Paragraph>{t('terms.s10_p1')}</Paragraph>
        <Paragraph>
          <Trans i18nKey="terms.s10_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <Paragraph>
          <Trans i18nKey="terms.s10_p3" components={{ strong: <strong /> }} />
        </Paragraph>
        <Paragraph>{t('terms.s10_p4')}</Paragraph>
        <List
          items={[
            t('terms.s10_l1'), t('terms.s10_l2'), t('terms.s10_l3'),
            t('terms.s10_l4'), t('terms.s10_l5'),
          ]}
        />
        <Paragraph>
          <Trans i18nKey="terms.s10_p5" components={{ strong: <strong /> }} />
        </Paragraph>
        <Paragraph>{t('terms.s10_p6')}</Paragraph>
      </Section>

      <Section title={t('terms.s11_title')}>
        <Paragraph>{t('terms.s11_p1')}</Paragraph>
        <List
          items={[
            t('terms.s11_l1'), t('terms.s11_l2'), t('terms.s11_l3'),
            t('terms.s11_l4'), t('terms.s11_l5'), t('terms.s11_l6'),
          ]}
        />
        <Paragraph>{t('terms.s11_p2')}</Paragraph>
        <List items={[t('terms.s11_l7'), t('terms.s11_l8'), t('terms.s11_l9')]} />
      </Section>

      <Section title={t('terms.s12_title')}>
        <Paragraph>{t('terms.s12_p1')}</Paragraph>
        <Paragraph>{t('terms.s12_p2')}</Paragraph>
        <Paragraph>{t('terms.s12_p3')}</Paragraph>
      </Section>

      <Section title={t('terms.s13_title')}>
        <Paragraph>{t('terms.s13_p1')}</Paragraph>
        <List items={[t('terms.s13_l1'), t('terms.s13_l2')]} />
      </Section>

      <Section title={t('terms.s14_title')}>
        <Paragraph>{t('terms.s14_p1')}</Paragraph>
        <Paragraph>{t('terms.s14_p2')}</Paragraph>
      </Section>

      <Section title={t('terms.s15_title')}>
        <Paragraph>{t('terms.s15_p1')}</Paragraph>
        <Paragraph>{t('terms.s15_p2')}</Paragraph>
        <Paragraph>{t('terms.s15_p3')}</Paragraph>
      </Section>
    </DocumentLayout>
    </>
  )
}
