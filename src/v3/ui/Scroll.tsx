/**
 * The app's scroll containers.
 *
 * iOS lets a scroll view be pulled and bounce even when everything fits on screen,
 * which makes a short screen feel loose. These only move when their content
 * overflows. A list with pull-to-refresh is the exception: the pull is the gesture.
 */
import { forwardRef } from 'react';
import { FlatList as RNFlatList, ScrollView as RNScrollView, type FlatListProps, type ScrollViewProps } from 'react-native';

export const ScrollView = forwardRef<RNScrollView, ScrollViewProps>(function ScrollView(props, ref) {
    return <RNScrollView ref={ref} alwaysBounceVertical={Boolean(props.refreshControl)} alwaysBounceHorizontal={false} overScrollMode="auto" {...props} />;
});
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ScrollView = RNScrollView;

function FlatListInner<T>(props: FlatListProps<T>, ref: React.ForwardedRef<RNFlatList<T>>) {
    const refreshes = Boolean(props.refreshControl || props.onRefresh);
    return <RNFlatList ref={ref} alwaysBounceVertical={refreshes} alwaysBounceHorizontal={false} overScrollMode="auto" {...props} />;
}

export const FlatList = forwardRef(FlatListInner) as <T>(props: FlatListProps<T> & { ref?: React.ForwardedRef<RNFlatList<T>> }) => React.ReactElement;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type FlatList<T = unknown> = RNFlatList<T>;
