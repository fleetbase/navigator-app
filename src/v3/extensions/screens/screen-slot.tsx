import React, { Suspense } from 'react';
import ScreenErrorBoundary from './ScreenErrorBoundary';
import { useScreenRegistry } from './ScreenRegistryContext';
import type { ScreenId } from './screen-ids';

const slots = new Map<ScreenId, React.ComponentType<any>>();

/**
 * Returns the component a navigator registers for a screen id.
 *
 * The component is stable per id, so it is safe to pass to `component=` (see the
 * screen-identity note in navigation/DriverTabs.tsx). At render time it resolves
 * the default screen, a compiled-in override, or a selected variant from the
 * registry in context. If an override fails to load or render, the default screen
 * renders with the same props; if the default fails too, the provider's load-error
 * view renders. New route params clear a caught failure.
 */
export function screenSlot(id: ScreenId): React.ComponentType<any> {
    const existing = slots.get(id);
    if (existing) return existing;

    const ScreenSlot = (props: any) => {
        const { registry, variants, renderLoading, renderLoadError, onError } = useScreenRegistry();
        const { Component, Default, source } = registry.resolve(id, variants[id]);
        const resetKey = props.route?.params;
        const renderDefault = () => <Default {...props} DefaultScreen={Default} />;

        return (
            <ScreenErrorBoundary
                key={`${id}:default`}
                resetKey={resetKey}
                onError={(error) => onError(error, { id, source: 'default' })}
                fallback={(error) => renderLoadError(id, error)}
            >
                <Suspense fallback={renderLoading(id)}>
                    {source === 'default' ? (
                        renderDefault()
                    ) : (
                        <ScreenErrorBoundary
                            key={`${id}:${source}`}
                            resetKey={resetKey}
                            onError={(error) => onError(error, { id, source })}
                            fallback={renderDefault}
                        >
                            <Component {...props} DefaultScreen={Default} />
                        </ScreenErrorBoundary>
                    )}
                </Suspense>
            </ScreenErrorBoundary>
        );
    };

    ScreenSlot.displayName = `ScreenSlot(${id})`;
    slots.set(id, ScreenSlot);
    return ScreenSlot;
}
