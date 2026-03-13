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
  MIN_DEAL_AMOUNT
} from '@/config/constants'

export function OfferPage() {
  const { t } = useTranslation()

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('offer.title'),
    description: t('offer.seo_description'),
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
        title={t('offer.seo_title')}
        description={t('offer.seo_description')}
        url="/offer"
        schema={schema}
      />
      <DocumentLayout title={t('offer.title')} date={t('offer.date')}>
      <Section title={t('offer.s1_title')}>
        <Paragraph>{t('offer.s1_p1')}</Paragraph>
        <Paragraph>{t('offer.s1_p2')}</Paragraph>
        <Paragraph>
          <Trans i18nKey="offer.s1_p3" components={{ strong: <strong /> }} />
        </Paragraph>
        <List items={[t('offer.s1_l1'), t('offer.s1_l2'), t('offer.s1_l3')]} />
        <Paragraph>{t('offer.s1_p4')}</Paragraph>
      </Section>

      <Section title={t('offer.s2_title')}>
        <Paragraph>{t('offer.s2_p1')}</Paragraph>
        <Paragraph>
          <Trans i18nKey="offer.s2_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s2_l1'), t('offer.s2_l2'), t('offer.s2_l3'), t('offer.s2_l4'),
            t('offer.s2_l5'), t('offer.s2_l6'), t('offer.s2_l7'), t('offer.s2_l8'),
          ]}
        />
        <Paragraph>
          <Trans i18nKey="offer.s2_p3" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s2_l9'), t('offer.s2_l10'), t('offer.s2_l11'),
            t('offer.s2_l12'), t('offer.s2_l13'),
          ]}
        />
      </Section>

      <Section title={t('offer.s3_title')}>
        <Paragraph>
          <Trans i18nKey="offer.s3_p1" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s3_l1', commissionParams),
            t('offer.s3_l2', commissionParams),
            t('offer.s3_l3', commissionParams),
            t('offer.s3_l4', commissionParams),
          ]}
        />
        <Paragraph>
          <Trans i18nKey="offer.s3_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s3_l5'), t('offer.s3_l6'), t('offer.s3_l7'),
            t('offer.s3_l8'), t('offer.s3_l9'),
          ]}
        />
        <Paragraph>
          <Trans i18nKey="offer.s3_p3" components={{ strong: <strong /> }} />
        </Paragraph>
        <List items={[t('offer.s3_l10'), t('offer.s3_l11'), t('offer.s3_l12')]} />
        <Paragraph>{t('offer.s3_p4')}</Paragraph>
        <Paragraph>
          <Trans i18nKey="offer.s3_p5" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[t('offer.s3_l13'), t('offer.s3_l14'), t('offer.s3_l15'), t('offer.s3_l16')]}
        />
        <Paragraph>
          <Trans i18nKey="offer.s3_p6" components={{ strong: <strong /> }} />
        </Paragraph>
        <Paragraph>{t('offer.s3_p7')}</Paragraph>
      </Section>

      <Section title={t('offer.s4_title')}>
        <Paragraph>
          <Trans i18nKey="offer.s4_p1" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s4_l1'), t('offer.s4_l2'), t('offer.s4_l3'),
            t('offer.s4_l4'), t('offer.s4_l5'),
          ]}
        />
        <Paragraph>
          <Trans i18nKey="offer.s4_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s4_l6'), t('offer.s4_l7'), t('offer.s4_l8'),
            t('offer.s4_l9'), t('offer.s4_l10'),
          ]}
        />
        <Paragraph>
          <Trans i18nKey="offer.s4_p3" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s4_l11'), t('offer.s4_l12'), t('offer.s4_l13'),
            t('offer.s4_l14'), t('offer.s4_l15'), t('offer.s4_l16'),
          ]}
        />
        <Paragraph>
          <Trans i18nKey="offer.s4_p4" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s4_l17', { minAmount: MIN_DEAL_AMOUNT }),
            t('offer.s4_l18'),
            t('offer.s4_l19'),
          ]}
        />
      </Section>

      <Section title={t('offer.s5_title')}>
        <Paragraph>
          <Trans i18nKey="offer.s5_p1" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s5_l1'), t('offer.s5_l2'), t('offer.s5_l3'),
            t('offer.s5_l4'), t('offer.s5_l5'),
          ]}
        />
        <Paragraph>
          <Trans i18nKey="offer.s5_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s5_l6'), t('offer.s5_l7'), t('offer.s5_l8'),
            t('offer.s5_l9'), t('offer.s5_l10'),
          ]}
        />
      </Section>

      <Section title={t('offer.s6_title')}>
        <Paragraph>
          <Trans i18nKey="offer.s6_p1" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s6_l1'), t('offer.s6_l2'), t('offer.s6_l3'),
            t('offer.s6_l4'), t('offer.s6_l5'),
          ]}
        />
        <Paragraph>
          <Trans i18nKey="offer.s6_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s6_l6'), t('offer.s6_l7'), t('offer.s6_l8'),
            t('offer.s6_l9'), t('offer.s6_l10'),
          ]}
        />
      </Section>

      <Section title={t('offer.s7_title')}>
        <Paragraph>{t('offer.s7_p1')}</Paragraph>
        <Paragraph>
          <Trans i18nKey="offer.s7_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s7_l1'), t('offer.s7_l2'), t('offer.s7_l3'),
            t('offer.s7_l4'), t('offer.s7_l5'),
          ]}
        />
        <Paragraph>{t('offer.s7_p3')}</Paragraph>
        <List items={[t('offer.s7_l6'), t('offer.s7_l7'), t('offer.s7_l8')]} />
        <Paragraph>{t('offer.s7_p4')}</Paragraph>
      </Section>

      <Section title={t('offer.s8_title')}>
        <Paragraph>
          <Trans i18nKey="offer.s8_p1" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('offer.s8_l1'), t('offer.s8_l2'), t('offer.s8_l3'),
            t('offer.s8_l4'), t('offer.s8_l5'), t('offer.s8_l6'),
          ]}
        />
        <Paragraph>{t('offer.s8_p2')}</Paragraph>
        <Paragraph>{t('offer.s8_p3')}</Paragraph>
      </Section>

      <Section title={t('offer.s9_title')}>
        <Paragraph>{t('offer.s9_p1')}</Paragraph>
        <List
          items={[
            t('offer.s9_l1'), t('offer.s9_l2'), t('offer.s9_l3'),
            t('offer.s9_l4'), t('offer.s9_l5'), t('offer.s9_l6'),
          ]}
        />
        <Paragraph>{t('offer.s9_p2')}</Paragraph>
      </Section>

      <Section title={t('offer.s10_title')}>
        <Paragraph>{t('offer.s10_p1')}</Paragraph>
        <Paragraph>{t('offer.s10_p2')}</Paragraph>
      </Section>

      <Section title={t('offer.s11_title')}>
        <Paragraph>{t('offer.s11_p1')}</Paragraph>
        <Paragraph>{t('offer.s11_p2')}</Paragraph>
      </Section>

      <Section title={t('offer.s12_title')}>
        <Paragraph>{t('offer.s12_p1')}</Paragraph>
        <Paragraph>{t('offer.s12_p2')}</Paragraph>
        <Paragraph>{t('offer.s12_p3')}</Paragraph>
        <Paragraph>{t('offer.s12_p4')}</Paragraph>
        <Paragraph>{t('offer.s12_p5')}</Paragraph>
      </Section>

      <Section title={t('offer.s13_title')}>
        <Paragraph>{t('offer.s13_p1')}</Paragraph>
        <Paragraph>{t('offer.s13_p2')}</Paragraph>
      </Section>

      <Section title={t('offer.s14_title')}>
        <Paragraph>{t('offer.s14_p1')}</Paragraph>
        <Paragraph>{t('offer.s14_p2')}</Paragraph>
        <Paragraph>{t('offer.s14_p3')}</Paragraph>
      </Section>

      <Section title={t('offer.s15_title')}>
        <Paragraph>{t('offer.s15_p1')}</Paragraph>
        <List items={[t('offer.s15_l1'), t('offer.s15_l2'), t('offer.s15_l3')]} />
      </Section>

      <Section title={t('offer.s16_title')}>
        <Paragraph>{t('offer.s16_p1')}</Paragraph>
        <List
          items={[
            t('offer.s16_l1'), t('offer.s16_l2'), t('offer.s16_l3'),
            t('offer.s16_l4'), t('offer.s16_l5'),
          ]}
        />
      </Section>
    </DocumentLayout>
    </>
  )
}
