import { DocumentLayout, Section, Paragraph, List } from '@/components/shared/DocumentLayout'
import { SEO } from '@/components/SEO'
import { Trans, useTranslation } from 'react-i18next'

export function PrivacyPage() {
  const { t } = useTranslation()

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('privacy.title'),
    description: t('privacy.seo_description'),
    dateModified: '2025-12-04',
  }

  return (
    <>
      <SEO
        title={t('privacy.seo_title')}
        description={t('privacy.seo_description')}
        url="/privacy"
        schema={schema}
      />
      <DocumentLayout title={t('privacy.title')} date={t('privacy.date')}>
      <Section title={t('privacy.s1_title')}>
        <Paragraph>{t('privacy.s1_p1')}</Paragraph>
        <Paragraph>{t('privacy.s1_p2')}</Paragraph>
        <Paragraph>{t('privacy.s1_p3')}</Paragraph>
      </Section>

      <Section title={t('privacy.s2_title')}>
        <Paragraph>
          <Trans i18nKey="privacy.s2_p1" components={{ strong: <strong /> }} />
        </Paragraph>
        <List items={[t('privacy.s2_l1'), t('privacy.s2_l2'), t('privacy.s2_l3')]} />

        <Paragraph>
          <Trans i18nKey="privacy.s2_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('privacy.s2_l4'), t('privacy.s2_l5'), t('privacy.s2_l6'),
            t('privacy.s2_l7'), t('privacy.s2_l8'),
          ]}
        />

        <Paragraph>
          <Trans i18nKey="privacy.s2_p3" components={{ strong: <strong /> }} />
        </Paragraph>
        <List items={[t('privacy.s2_l9'), t('privacy.s2_l10'), t('privacy.s2_l11')]} />

        <Paragraph>
          <Trans i18nKey="privacy.s2_p4" components={{ strong: <strong /> }} />
        </Paragraph>
        <List items={[t('privacy.s2_l12'), t('privacy.s2_l13'), t('privacy.s2_l14')]} />
      </Section>

      <Section title={t('privacy.s3_title')}>
        <Paragraph>{t('privacy.s3_p1')}</Paragraph>
        <List
          items={[
            t('privacy.s3_l1'), t('privacy.s3_l2'), t('privacy.s3_l3'),
            t('privacy.s3_l4'), t('privacy.s3_l5'), t('privacy.s3_l6'), t('privacy.s3_l7'),
          ]}
        />

        <Paragraph>{t('privacy.s3_p2')}</Paragraph>
        <List
          items={[t('privacy.s3_l8'), t('privacy.s3_l9'), t('privacy.s3_l10'), t('privacy.s3_l11')]}
        />
      </Section>

      <Section title={t('privacy.s4_title')}>
        <Paragraph>
          <Trans i18nKey="privacy.s4_p1" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[t('privacy.s4_l1'), t('privacy.s4_l2'), t('privacy.s4_l3'), t('privacy.s4_l4')]}
        />

        <Paragraph>
          <Trans i18nKey="privacy.s4_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[
            t('privacy.s4_l5'), t('privacy.s4_l6'), t('privacy.s4_l7'),
            t('privacy.s4_l8'), t('privacy.s4_l9'),
          ]}
        />
      </Section>

      <Section title={t('privacy.s5_title')}>
        <Paragraph>{t('privacy.s5_p1')}</Paragraph>
        <List items={[t('privacy.s5_l1'), t('privacy.s5_l2'), t('privacy.s5_l3')]} />
        <Paragraph>{t('privacy.s5_p2')}</Paragraph>
      </Section>

      <Section title={t('privacy.s6_title')}>
        <Paragraph>{t('privacy.s6_p1')}</Paragraph>
        <Paragraph>{t('privacy.s6_p2')}</Paragraph>
        <List
          items={[t('privacy.s6_l1'), t('privacy.s6_l2'), t('privacy.s6_l3'), t('privacy.s6_l4')]}
        />
        <Paragraph>{t('privacy.s6_p3')}</Paragraph>
      </Section>

      <Section title={t('privacy.s7_title')}>
        <Paragraph>{t('privacy.s7_p1')}</Paragraph>
        <List
          items={[
            t('privacy.s7_l1'), t('privacy.s7_l2'), t('privacy.s7_l3'),
            t('privacy.s7_l4'), t('privacy.s7_l5'),
          ]}
        />

        <Paragraph>
          <Trans i18nKey="privacy.s7_p2" components={{ strong: <strong /> }} />
        </Paragraph>
        <List
          items={[t('privacy.s7_l6'), t('privacy.s7_l7'), t('privacy.s7_l8'), t('privacy.s7_l9')]}
        />

        <Paragraph>{t('privacy.s7_p3')}</Paragraph>
      </Section>

      <Section title={t('privacy.s8_title')}>
        <Paragraph>{t('privacy.s8_p1')}</Paragraph>
        <Paragraph>{t('privacy.s8_p2')}</Paragraph>
        <Paragraph>{t('privacy.s8_p3')}</Paragraph>
      </Section>

      <Section title={t('privacy.s9_title')}>
        <Paragraph>{t('privacy.s9_p1')}</Paragraph>
        <Paragraph>{t('privacy.s9_p2')}</Paragraph>
        <Paragraph>{t('privacy.s9_p3')}</Paragraph>
      </Section>

      <Section title={t('privacy.s10_title')}>
        <Paragraph>{t('privacy.s10_p1')}</Paragraph>
        <Paragraph>{t('privacy.s10_p2')}</Paragraph>
        <Paragraph>{t('privacy.s10_p3')}</Paragraph>
      </Section>

      <Section title={t('privacy.s11_title')}>
        <Paragraph>{t('privacy.s11_p1')}</Paragraph>
        <List
          items={[
            t('privacy.s11_l1'), t('privacy.s11_l2'), t('privacy.s11_l3'),
            t('privacy.s11_l4'), t('privacy.s11_l5'), t('privacy.s11_l6'),
          ]}
        />
        <Paragraph>{t('privacy.s11_p2')}</Paragraph>
      </Section>

      <Section title={t('privacy.s12_title')}>
        <Paragraph>{t('privacy.s12_p1')}</Paragraph>
        <List
          items={[t('privacy.s12_l1'), t('privacy.s12_l2'), t('privacy.s12_l3'), t('privacy.s12_l4')]}
        />
      </Section>

      <Section title={t('privacy.s13_title')}>
        <Paragraph>{t('privacy.s13_p1')}</Paragraph>
        <Paragraph>{t('privacy.s13_p2')}</Paragraph>
        <Paragraph>{t('privacy.s13_p3')}</Paragraph>
        <Paragraph>{t('privacy.s13_p4')}</Paragraph>
      </Section>

      <Section title={t('privacy.s14_title')}>
        <Paragraph>{t('privacy.s14_p1')}</Paragraph>
        <List items={[t('privacy.s14_l1'), t('privacy.s14_l2'), t('privacy.s14_l3')]} />
        <Paragraph>{t('privacy.s14_p2')}</Paragraph>
      </Section>

      <Section title={t('privacy.s15_title')}>
        <Paragraph>{t('privacy.s15_p1')}</Paragraph>
        <List items={[t('privacy.s15_l1'), t('privacy.s15_l2')]} />
      </Section>

      <Section title={t('privacy.s16_title')}>
        <Paragraph>{t('privacy.s16_p1')}</Paragraph>
        <Paragraph>{t('privacy.s16_p2')}</Paragraph>
        <Paragraph>{t('privacy.s16_p3')}</Paragraph>
      </Section>
    </DocumentLayout>
    </>
  )
}
