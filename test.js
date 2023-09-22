import('react-native').then(() => {
    import('@fleetbase/react-native-mapbox-navigation').then((MapboxNavigation) => {
        console.log('[MapboxNavigation]', MapboxNavigation);
    });
});
