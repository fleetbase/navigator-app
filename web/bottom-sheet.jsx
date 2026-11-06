/**
 * @gorhom/bottom-sheet, for the web. The package depends on native gesture and
 * layout behaviour, so this keeps its API and motion rather than its internals:
 * snap points, drag the handle to dismiss, and `onAnimate(from, to)`.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FlatList, ScrollView, TextInput, View } from 'react-native';

const SPRING = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';
const DISMISS_DISTANCE = 96;

const toHeight = (snap) => (typeof snap === 'number' ? `${snap}px` : snap);

const BottomSheet = forwardRef(function BottomSheet(
    { index = -1, snapPoints = ['50%'], onAnimate, onChange, onClose, enablePanDownToClose = true, style, backgroundStyle, handleIndicatorStyle, children },
    ref
) {
    const [current, setCurrent] = useState(index);
    const [height, setHeight] = useState(index >= 0 ? toHeight(snapPoints[index]) : undefined);
    const [dragY, setDragY] = useState(null);
    // Mounted a frame before it slides, or the browser has no start position to animate from.
    const [visible, setVisible] = useState(index >= 0);
    const [raised, setRaised] = useState(index >= 0);
    const drag = useRef(null);

    const moveTo = useCallback(
        (next, nextHeight) => {
            setCurrent((previous) => {
                if (previous !== next) {
                    onAnimate?.(previous, next);
                    onChange?.(next);
                    if (next < 0) onClose?.();
                }
                return next;
            });
            if (nextHeight) setHeight(nextHeight);
        },
        [onAnimate, onChange, onClose]
    );

    const close = useCallback(() => moveTo(-1), [moveTo]);

    useImperativeHandle(
        ref,
        () => ({
            snapToIndex: (next) => moveTo(next, toHeight(snapPoints[next])),
            snapToPosition: (position) => moveTo(0, toHeight(position)),
            expand: () => moveTo(snapPoints.length - 1, toHeight(snapPoints[snapPoints.length - 1])),
            collapse: () => moveTo(0, toHeight(snapPoints[0])),
            close,
            forceClose: close,
        }),
        [close, moveTo, snapPoints]
    );

    const open = current >= 0;

    useEffect(() => {
        if (open) {
            setVisible(true);
            const frame = requestAnimationFrame(() => setRaised(true));
            const onKey = (event) => event.key === 'Escape' && close();
            window.addEventListener('keydown', onKey);
            return () => {
                cancelAnimationFrame(frame);
                window.removeEventListener('keydown', onKey);
            };
        }
        setRaised(false);
        const timer = setTimeout(() => setVisible(false), 240);
        return () => clearTimeout(timer);
    }, [open, close]);

    if (!visible) return null;

    const handlers = enablePanDownToClose
        ? {
              onPointerDown: (event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = event.clientY;
                  setDragY(0);
              },
              onPointerMove: (event) => {
                  if (drag.current !== null) setDragY(Math.max(0, event.clientY - drag.current));
              },
              onPointerUp: (event) => {
                  const distance = drag.current === null ? 0 : event.clientY - drag.current;
                  drag.current = null;
                  setDragY(null);
                  if (distance > DISMISS_DISTANCE) close();
              },
          }
        : {};

    const transform = !raised ? 'translateY(100%)' : dragY ? `translateY(${dragY}px)` : 'translateY(0)';

    return (
        <View
            style={[
                { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1000, height, overflow: 'hidden', borderTopLeftRadius: 15, borderTopRightRadius: 15, boxShadow: '0 -8px 32px rgba(12, 21, 36, 0.18)' },
                style,
                { flex: undefined, transform, transition: dragY === null ? SPRING : 'none' },
                backgroundStyle,
            ]}
        >
            <div {...handlers} style={{ padding: '10px 0', display: 'flex', justifyContent: 'center', touchAction: 'none', cursor: 'grab', flexShrink: 0 }}>
                <View style={[{ width: 30, height: 4, borderRadius: 4, backgroundColor: '#9ca3af' }, handleIndicatorStyle]} />
            </div>
            {children}
        </View>
    );
});

export const BottomSheetView = View;
export const BottomSheetScrollView = ScrollView;
export const BottomSheetFlatList = FlatList;
export const BottomSheetTextInput = TextInput;
export const BottomSheetModalProvider = ({ children }) => <>{children}</>;
export const BottomSheetBackdrop = () => null;

export default BottomSheet;
