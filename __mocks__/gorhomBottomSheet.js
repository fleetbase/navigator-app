/**
 * @gorhom/bottom-sheet stub for jest.
 *
 * The real library pulls reanimated 4 → react-native-worklets, which reaches for
 * a TurboModule proxy at import time (NativeWorklets.native.js → loadUnpackers).
 * Mocking the worklets surface deeply turned into whack-a-mole
 * (createSerializable, shareableMappingCache, …), so the stub sits at the
 * library boundary instead: sheet *contents* still render and can be asserted,
 * only the gesture/animation shell is replaced.
 */
const React = require('react');
const { View, TextInput, FlatList, ScrollView } = require('react-native');

const passthrough = (name) => {
    const C = React.forwardRef(({ children, ...props }, ref) =>
        React.createElement(View, { ...props, ref, testID: props.testID ?? name }, children)
    );
    C.displayName = name;
    return C;
};

const BottomSheet = React.forwardRef(({ children, ...props }, ref) => {
    React.useImperativeHandle(ref, () => ({
        snapToPosition: () => {},
        snapToIndex: () => {},
        expand: () => {},
        collapse: () => {},
        close: () => {},
        forceClose: () => {},
    }));
    return React.createElement(View, { ...props, testID: 'bottom-sheet' }, children);
});
BottomSheet.displayName = 'BottomSheet';

module.exports = {
    __esModule: true,
    default: BottomSheet,
    BottomSheetModal: BottomSheet,
    BottomSheetView: passthrough('BottomSheetView'),
    BottomSheetModalProvider: passthrough('BottomSheetModalProvider'),
    BottomSheetBackdrop: passthrough('BottomSheetBackdrop'),
    BottomSheetFlatList: FlatList,
    BottomSheetScrollView: ScrollView,
    BottomSheetTextInput: TextInput,
    useBottomSheet: () => ({ close: () => {}, expand: () => {} }),
    useBottomSheetModal: () => ({ dismiss: () => {} }),
};
