import React, { Suspense } from 'react';
import { Platform } from 'react-native';
import { getBuildExtensions } from '../build-extensions';
import { createLoadable } from '../screens/loadable';
import ScreenErrorBoundary from '../screens/ScreenErrorBoundary';
import { COMPONENT_IDS, isComponentId, type ComponentId } from './component-ids';
import type { ComponentEntry, ComponentOverrides, ComponentPropsMap } from './types';
import type { LoadableComponent, ScreenErrorReporter } from '../screens/types';

type Options = {
    overrides?: ComponentOverrides;
    platform?: string;
    strict?: boolean;
    warn?: (message: string) => void;
};

function isValidEntry(entry: unknown): entry is ComponentEntry<any> {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as ComponentEntry<any>;
    if (typeof candidate.load !== 'function') return false;
    return candidate.platforms === undefined || Array.isArray(candidate.platforms);
}

/**
 * Checks a build's component overrides: an unknown id or a malformed entry throws
 * in strict mode (development) and is dropped with a warning otherwise.
 */
export function validateComponentOverrides(overrides: unknown, { platform = Platform.OS, strict = typeof __DEV__ !== 'undefined' ? __DEV__ : false, warn = console.warn }: Omit<Options, 'overrides'> = {}): ComponentOverrides {
    const reject = (message: string) => {
        if (strict) throw new Error(message);
        warn(message);
    };
    const accepted: ComponentOverrides = {};
    if (!overrides || typeof overrides !== 'object') return accepted;
    for (const [id, entry] of Object.entries(overrides)) {
        if (!isComponentId(id)) {
            reject(`[component-registry] Unknown component id "${id}". Known ids: ${COMPONENT_IDS.join(', ')}`);
            continue;
        }
        if (!isValidEntry(entry)) {
            reject(`[component-registry] Invalid override for "${id}": expected { load: () => import(...) }.`);
            continue;
        }
        if (entry.platforms && !entry.platforms.includes(platform as never)) continue;
        (accepted as any)[id] = entry;
    }
    return accepted;
}

let buildOverrides: ComponentOverrides | null = null;
const getBuildOverrides = () => (buildOverrides = buildOverrides ?? validateComponentOverrides(getBuildExtensions().components));

const reportError: ScreenErrorReporter = (error, context) => {
    const report = getBuildExtensions().onError;
    if (typeof report === 'function') report(error, context);
    else console.error(`[component-registry] override "${context.id}" failed; falling back to the default.`, error);
};

const overridden = new Map<ComponentId, LoadableComponent>();

/**
 * The component the app renders for a component id.
 *
 * Resolved once, when the defining module loads. With no override the default is
 * returned as is — no wrapper, no cost, which matters for rows in long lists.
 * With one, the override loads lazily and receives the default's props plus
 * `Default`; while it loads, and if it fails to load or throws, the default renders
 * with the same props.
 */
export function componentSlot<Id extends ComponentId, C extends React.ComponentType<ComponentPropsMap[Id]>>(id: Id, Default: C, options: Options = {}): C {
    const overrides = options.overrides ? validateComponentOverrides(options.overrides, options) : getBuildOverrides();
    const entry = overrides[id] as ComponentEntry<Id> | undefined;
    if (!entry) return Default;

    const Override = createLoadable(entry.load as any, `component:${id}`);
    overridden.set(id, Override);
    const DefaultComponent = Default as React.ComponentType<any>;

    const Slot = React.forwardRef<unknown, any>((props, ref) => (
        <ScreenErrorBoundary onError={(error) => reportError(error, { id, source: 'override' })} fallback={() => <DefaultComponent ref={ref} {...props} />}>
            <Suspense fallback={<DefaultComponent ref={ref} {...props} />}>
                <Override ref={ref} {...props} Default={DefaultComponent} />
            </Suspense>
        </ScreenErrorBoundary>
    ));
    Slot.displayName = `ComponentSlot(${id})`;
    return Slot as unknown as C;
}

/** Loads every component override in the build, so none renders its default first. */
export function preloadComponentOverrides(): Promise<void> {
    return Promise.all([...overridden.values()].map((component) => component.preload().catch(() => undefined))).then(() => undefined);
}
