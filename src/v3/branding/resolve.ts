import { ZodEffects, ZodNullable, ZodObject, ZodOptional, ZodRecord } from 'zod';
import type { ZodTypeAny } from 'zod';
import { contrastRatio, mix } from './color';
import { DEFAULT_BRANDING } from './defaults';
import { brandPresets, legibleOn, schemePalettes, SCHEMES, type SchemeName, type StatusTone } from '../theme/palette';
import { BRANDING_SCHEMA_VERSION, BRANDING_SECTIONS } from './schema';
import type { AssetReference, BrandingConfig, BrandingScreens, BrandingSection, FontFamily } from './schema';

export type BrandingSource = {
    /** Label used in issues, e.g. `legacy-env`, `navigator.brand.ts`, `preview`, `remote`. */
    name: string;
    config: unknown;
    /** Revert overridden colours that fail contrast checks instead of only reporting them. */
    enforceContrast?: boolean;
};

export type BrandingIssue = { source: string; path: string; message: string };

export type TokenOverrideGroup = 'all' | 'lightModes' | 'darkModes' | SchemeName;

export type ResolvedBranding = {
    schemaVersion: typeof BRANDING_SCHEMA_VERSION;
    name?: string;
    colors: {
        preset: string;
        primary: string;
        primaryDeep: string;
        onPrimary: string;
        sunlightPrimary: string;
        /** Token overrides per scheme, already layered (all → mode → scheme). */
        tokens: Record<SchemeName, Record<string, string>>;
    };
    appearance: { defaultScheme: 'system' | SchemeName; schemes: SchemeName[]; allowUserToggle: boolean };
    typography: { body?: FontFamily; heading?: FontFamily; mono?: FontFamily; scale: number };
    shape: { radius: { compact: number; hero: number } };
    assets: { logo?: AssetReference | null };
    boot: { background: string };
    navigation: { tabs: string[]; defaultTab: string; tabOverrides: Partial<Record<string, { icon?: string; labelKey?: string }>> };
    account: { hiddenLinks: string[] };
    features: { earnings: boolean };
    statuses: Record<string, { tone: StatusTone; labelKey?: string }>;
    screens: BrandingScreens;
};

/** Entries the account menu always keeps: a driver must be able to change settings and get help. */
export const REQUIRED_ACCOUNT_LINKS = ['Settings', 'Help'];

const isPlainObject = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

// Values at these paths are replaced as a whole rather than merged (an asset
// `{ url }`, a font family's faces).
const ATOMIC_PATHS = [/^assets\.[^.]+$/, /^typography\.(body|heading|mono)$/];

function deepMerge<T>(base: T, override: unknown, path = ''): T {
    if (!isPlainObject(base) || !isPlainObject(override)) return (override === undefined ? base : override) as T;
    const result: Record<string, any> = { ...base };
    for (const [key, value] of Object.entries(override)) {
        const childPath = path ? `${path}.${key}` : key;
        const atomic = ATOMIC_PATHS.some((pattern) => pattern.test(childPath));
        result[key] = !atomic && isPlainObject(value) && isPlainObject(result[key]) ? deepMerge(result[key], value, childPath) : value;
    }
    return result as T;
}

const describe = (error: any) => error.issues.map((issue: any) => `${issue.path.join('.') || '(value)'}: ${issue.message}`).join('; ');

function unwrap(schema: ZodTypeAny): ZodTypeAny {
    let current: any = schema;
    while (current instanceof ZodOptional || current instanceof ZodNullable || current instanceof ZodEffects) {
        current = current instanceof ZodEffects ? current.innerType() : current.unwrap();
    }
    return current;
}

/**
 * Validates a value against its schema. When an object or record is invalid,
 * each child is validated on its own so one bad value (e.g. an invalid colour)
 * drops only that value instead of the whole section.
 */
function sanitize(schema: ZodTypeAny, value: unknown, path: string, source: string, issues: BrandingIssue[]): unknown {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;

    const inner = unwrap(schema);
    if (!isPlainObject(value) || !(inner instanceof ZodObject || inner instanceof ZodRecord)) {
        issues.push({ source, path, message: describe(parsed.error) });
        return undefined;
    }

    const kept: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}.${key}`;
        let childSchema: ZodTypeAny | undefined;
        if (inner instanceof ZodObject) {
            childSchema = (inner.shape as Record<string, ZodTypeAny>)[key];
        } else if (inner.keySchema.safeParse(key).success) {
            childSchema = inner.valueSchema;
        }
        if (!childSchema) {
            issues.push({ source, path: childPath, message: 'Unknown or invalid key' });
            continue;
        }
        const sanitizedChild = sanitize(childSchema, child, childPath, source, issues);
        if (sanitizedChild !== undefined) kept[key] = sanitizedChild;
    }

    // Re-check container-level rules (e.g. maximum entries) on what was kept.
    const recheck = schema.safeParse(kept);
    if (!recheck.success) {
        issues.push({ source, path, message: describe(recheck.error) });
        return undefined;
    }
    return Object.keys(kept).length ? recheck.data : undefined;
}

function sanitizeSource(source: BrandingSource, issues: BrandingIssue[]): BrandingConfig | null {
    const { name, config } = source;
    if (!isPlainObject(config)) {
        issues.push({ source: name, path: '', message: 'Branding config must be an object' });
        return null;
    }
    if (config.schemaVersion !== BRANDING_SCHEMA_VERSION) {
        issues.push({ source: name, path: 'schemaVersion', message: `Unsupported schema version ${String(config.schemaVersion)}; expected ${BRANDING_SCHEMA_VERSION}` });
        return null;
    }

    const sanitized: BrandingConfig = { schemaVersion: BRANDING_SCHEMA_VERSION };
    for (const [key, value] of Object.entries(config)) {
        if (key === 'schemaVersion' || value === undefined) continue;
        if (key === 'name') {
            if (typeof value === 'string' && value.length <= 80) sanitized.name = value;
            else issues.push({ source: name, path: 'name', message: 'Expected a string of at most 80 characters' });
            continue;
        }
        if (!(key in BRANDING_SECTIONS)) {
            issues.push({ source: name, path: key, message: 'Unknown section' });
            continue;
        }
        const section = sanitize(BRANDING_SECTIONS[key as BrandingSection] as ZodTypeAny, value, key, name, issues);
        if (section !== undefined) (sanitized as any)[key] = section;
    }
    return sanitized;
}

const WHITE = '#FFFFFF';
const INK = '#0B1017';

/**
 * Brand colours: the preset's, with any explicit field over it. Fields a source
 * did not give follow a custom `primary` rather than the preset, so a brand that
 * names only its colour still gets a matching deep, on-colour and sunlight step.
 */
function resolveBrandColors(colors: Record<string, any>) {
    const preset = brandPresets[colors.preset] ?? brandPresets.fleetbase;
    const primary: string = colors.primary ?? preset.primary;
    const custom = colors.primary !== undefined && colors.primary !== preset.primary;
    const contrastOn = (background: string) => ((contrastRatio(WHITE, background) ?? 0) >= (contrastRatio(INK, background) ?? 0) ? WHITE : INK);
    return {
        preset: colors.preset,
        primary,
        primaryDeep: colors.primaryDeep ?? (custom ? mix(primary, '#000000', 0.2).toUpperCase() : preset.primaryDeep),
        onPrimary: colors.onPrimary ?? (custom ? contrastOn(primary) : preset.onPrimary),
        sunlightPrimary: colors.sunlightPrimary ?? (custom ? legibleOn(primary, WHITE).toUpperCase() : preset.sunlightPrimary),
    };
}

/** Layers token overrides the way the theme applies them: all → mode → scheme. */
function layerTokens(groups: Partial<Record<TokenOverrideGroup, Record<string, string>>>): Record<SchemeName, Record<string, string>> {
    const out = {} as Record<SchemeName, Record<string, string>>;
    for (const scheme of SCHEMES) {
        const mode = schemePalettes[scheme].isDark ? groups.darkModes : groups.lightModes;
        out[scheme] = { ...groups.all, ...mode, ...groups[scheme] };
    }
    return out;
}

type ContrastCheck = { scheme: SchemeName; foreground: string; background: string; minimum: number; path: string };

/**
 * Resolves branding from sources in increasing priority (defaults are applied
 * first automatically). Invalid values are dropped with an issue, so resolution
 * always produces a complete, valid branding.
 */
export function resolveBranding(sources: BrandingSource[], { fonts = [] as string[] } = {}): { branding: ResolvedBranding; issues: BrandingIssue[] } {
    const issues: BrandingIssue[] = [];
    let merged: any = DEFAULT_BRANDING;
    const enforced: BrandingSource[] = [];

    for (const source of sources) {
        const sanitized = sanitizeSource(source, issues);
        if (!sanitized) continue;
        merged = deepMerge(merged, sanitized);
        if (source.enforceContrast) enforced.push({ ...source, config: sanitized });
    }

    // ── colours, and their contrast ─────────────────────────────────────────
    let brand = resolveBrandColors(merged.colors);
    let tokenGroups: Partial<Record<TokenOverrideGroup, Record<string, string>>> = merged.colors.tokens ?? {};
    let tokens = layerTokens(tokenGroups);

    const checks = (): ContrastCheck[] => {
        const list: ContrastCheck[] = [];
        for (const scheme of SCHEMES) {
            if (scheme === 'night') continue; // amber by design, never branded
            const base = { ...schemePalettes[scheme], ...tokens[scheme] };
            const primary = scheme === 'sunlight' ? brand.sunlightPrimary : brand.primary;
            // Brand-colour buttons carry bold 15pt+ labels: large text, 3:1.
            list.push({ scheme, foreground: brand.onPrimary, background: primary, minimum: 3, path: `colors.${scheme}.onPrimary/primary` });
            list.push({ scheme, foreground: base.textPrimary, background: base.background, minimum: 4.5, path: `colors.${scheme}.textPrimary/background` });
            list.push({ scheme, foreground: base.textPrimary, background: base.surface, minimum: 4.5, path: `colors.${scheme}.textPrimary/surface` });
            list.push({ scheme, foreground: base.textSecondary, background: base.background, minimum: 3, path: `colors.${scheme}.textSecondary/background` });
        }
        list.push({ scheme: 'sunlight', foreground: brand.sunlightPrimary, background: WHITE, minimum: 4.5, path: 'colors.sunlightPrimary/white' });
        return list;
    };

    const failing = () => checks().filter((c) => (contrastRatio(c.foreground, c.background) ?? Infinity) < c.minimum);

    if (enforced.length && failing().length) {
        // A source that must not ship unreadable colours (a preview, later a remote
        // config) has its colour overrides undone, and the check runs again.
        const enforcedColors = enforced.map((s) => (s.config as BrandingConfig).colors).filter(Boolean);
        const strip = (colors: Record<string, any>) => {
            const out = { ...colors };
            for (const c of enforcedColors) for (const key of ['primary', 'primaryDeep', 'onPrimary', 'sunlightPrimary', 'preset']) if (c && key in c) delete out[key];
            return out;
        };
        const before = failing().map((c) => c.path);
        brand = resolveBrandColors({ preset: DEFAULT_BRANDING.colors.preset, ...strip(merged.colors) });
        tokenGroups = Object.fromEntries(
            Object.entries(tokenGroups).map(([group, values]) => [group, Object.fromEntries(Object.entries(values).filter(([key]) => !enforcedColors.some((c) => (c?.tokens as any)?.[group]?.[key] !== undefined)))])
        );
        tokens = layerTokens(tokenGroups);
        issues.push({ source: enforced.map((s) => s.name).join(', '), path: 'colors', message: `Colours reverted: ${before.join(', ')} below the contrast minimum` });
    }

    for (const check of failing()) {
        const ratio = contrastRatio(check.foreground, check.background);
        issues.push({ source: 'colors', path: check.path, message: `Contrast ${ratio === null ? '?' : ratio.toFixed(2)}:1 is below ${check.minimum}:1` });
    }

    // ── appearance ──────────────────────────────────────────────────────────
    const schemes: SchemeName[] = SCHEMES.filter((scheme) => merged.appearance.schemes.includes(scheme));
    let defaultScheme: 'system' | SchemeName = merged.appearance.defaultScheme;
    if (defaultScheme === 'system' ? !(schemes.includes('dark') && schemes.includes('light')) : !schemes.includes(defaultScheme)) {
        issues.push({ source: 'appearance', path: 'appearance.defaultScheme', message: `"${defaultScheme}" is not among appearance.schemes; using ${schemes[0]}` });
        defaultScheme = schemes[0];
    }

    // ── typography: every named face must be bundled ────────────────────────
    const shipped = new Set([...fonts, 'Archivo-Regular', 'Archivo-Medium', 'Archivo-SemiBold', 'Archivo-Bold', 'Archivo-ExtraBold', 'JetBrainsMono-Regular', 'JetBrainsMono-Medium', 'JetBrainsMono-SemiBold']);
    const typography = { ...merged.typography };
    for (const role of ['body', 'heading', 'mono'] as const) {
        const family: FontFamily | undefined = typography[role];
        if (!family) continue;
        const missing = Object.values(family.faces).filter((face) => !shipped.has(face as string));
        if (missing.length) {
            issues.push({ source: 'typography', path: `typography.${role}`, message: `No font file for ${missing.join(', ')} in brand/fonts; using the default ${role} font` });
            delete typography[role];
        }
    }

    // ── navigation and account: what must always be there ───────────────────
    const tabs: string[] = merged.navigation.tabs.filter((tab: string, index: number, all: string[]) => all.indexOf(tab) === index);
    if (!tabs.includes('Account')) {
        issues.push({ source: 'navigation', path: 'navigation.tabs', message: 'Account is always shown (sign-out and settings live there); added it' });
        tabs.push('Account');
    }
    const hiddenLinks = merged.account.hiddenLinks.filter((link: string) => {
        if (!REQUIRED_ACCOUNT_LINKS.includes(link)) return true;
        issues.push({ source: 'account', path: 'account.hiddenLinks', message: `${link} cannot be hidden` });
        return false;
    });

    const branding: ResolvedBranding = {
        schemaVersion: BRANDING_SCHEMA_VERSION,
        name: merged.name,
        colors: { ...brand, tokens },
        appearance: { defaultScheme, schemes, allowUserToggle: merged.appearance.allowUserToggle },
        typography,
        shape: merged.shape,
        assets: merged.assets,
        boot: merged.boot,
        navigation: { tabs, defaultTab: merged.navigation.defaultTab, tabOverrides: merged.navigation.tabOverrides },
        account: { hiddenLinks },
        features: merged.features,
        statuses: merged.statuses,
        screens: merged.screens,
    };
    return { branding, issues };
}

