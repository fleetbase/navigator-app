/**
 * Ambient declarations for untyped runtime dependencies.
 * `inflected` ships no types and has no @types package.
 */
declare module 'inflected' {
    export function titleize(input: string): string;
    export function humanize(input: string): string;
    export function pluralize(input: string, count?: number): string;
    export function singularize(input: string): string;
    export function camelize(input: string, uppercaseFirstLetter?: boolean): string;
    export function underscore(input: string): string;
    export function dasherize(input: string): string;
    export function capitalize(input: string): string;
}

/**
 * i18n-js v3 ships no types and has no @types package on this version.
 * Only the surface v3 uses is declared.
 */
declare module 'i18n-js' {
    interface I18nStatic {
        locale: string;
        defaultLocale: string;
        fallbacks: boolean;
        translations: Record<string, object>;
        missingTranslation: (scope: string) => string;
        t(scope: string, options?: Record<string, unknown>): string;
        translate(scope: string, options?: Record<string, unknown>): string;
    }
    const I18n: I18nStatic;
    export default I18n;
}
