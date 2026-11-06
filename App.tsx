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
import { V2App } from './App.v2';

function App(): React.JSX.Element {
    return isV3Enabled() ? <AppV3 /> : <V2App />;
}

export default App;
