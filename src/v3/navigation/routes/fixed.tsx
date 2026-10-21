/**
 * Routes that are deliberately not overridable, so navigators import them directly.
 *
 * The permissions primer carries the store-mandated background-location
 * disclosure (Google Play's prominent-disclosure policy, Apple's purpose
 * strings); a client build must not be able to replace or drop it.
 */
import PermissionsPrimerScreen from '../../screens/PermissionsPrimerScreen';
import type { Nav } from '../session';

export function PermissionsPrimer({ navigation }: { navigation: Nav }) {
    return <PermissionsPrimerScreen onDone={navigation.goBack} />;
}
