// index.native.tsx
import { AppRegistry } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import App from './App';
import { name as appName } from './app.json';

import { enableGlobalTracking } from './src/utils/activityInterceptor';

// Enable global tracking of user interactions
enableGlobalTracking();

AppRegistry.registerComponent(appName, () => App);
