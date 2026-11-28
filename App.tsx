/**
 * Root selector.
 *
 * The redesign is built in a parallel tree, so the whole presentation layer is
 * chosen here rather than screen by screen. The two must never share a
 * TamaguiProvider: v2 components read tokens (`$red-600`,
 * `$borderColorWithShadow`) that the Waypoint config does not define, and v3
 * components read tokens (`$surfaceRaised`, `$onPrimary`, the status families)
 * that v2 does not. Mixing them resolves to undefined rather than failing loudly.
 *
 * Set NAVIGATOR_V3=true to build the v3 shell.
 *
 * App.v3.tsx is the only place v3 touches v2. `DriverBridge` adapts the v2 auth
 * and socket contexts into the plain props V3App takes; Phase 2 replaces the
 * data layer and this bridge goes with it.
 */
import React from 'react';

import { isV3Enabled } from './src/v3/flag';
import AppV3 from './App.v3';

/*
 * The v2 app is loaded only when it is the one running. Importing it creates the
 * v2 Tamagui config, and Tamagui keeps a single global config, the last one
 * created: with both loaded, a Fast Refresh that re-ran the v2 config swapped
 * it in under the v3 app, whose themes it lacks ("No theme and no parent?").
 */
function App(): React.JSX.Element {
    if (isV3Enabled()) return <AppV3 />;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { V2App } = require('./App.v2') as typeof import('./App.v2');
    return <V2App />;
}

export default App;
