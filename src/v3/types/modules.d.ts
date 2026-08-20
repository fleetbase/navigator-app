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
