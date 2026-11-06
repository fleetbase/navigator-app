/** react-native-i18n is i18n-js plus the device's language, which a browser provides directly. */
import I18n from 'i18n-js';

const languages = () => (navigator.languages?.length ? [...navigator.languages] : [navigator.language ?? 'en']);

I18n.locale = languages()[0];

export const getLanguages = async () => languages();

export default I18n;
