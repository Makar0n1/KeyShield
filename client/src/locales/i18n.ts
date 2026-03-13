import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ru from './ru.json'
import en from './en.json'
import uk from './uk.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ru: { translation: ru },
      en: { translation: en },
      uk: { translation: uk },
    },
    lng: 'ru',
    fallbackLng: 'ru',
    supportedLngs: ['ru', 'en', 'uk'],
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
