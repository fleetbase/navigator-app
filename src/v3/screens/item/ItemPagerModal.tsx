/**
 * The order's items, one at a time, over the order — design round 3
 * (ItemCombined.dc.html, ItemCombinedScroll.dc.html, ItemCombinedScanned.dc.html).
 *
 * A modal over the dimmed order screen, which stays visible behind. It is a
 * pager: a header (close, "Item 1 of 2", dots, how many are scanned), then the
 * items side by side, each a card (see ItemCard); the driver swipes between
 * them and the next one's edge shows at the side. Each card scrolls up and
 * down on its own, with its scan footer staying put.
 *
 * Its shape is not a bottom sheet (a header floats above a card), so it is
 * built on React Native's Modal the way SheetModal is, keeping SheetModal's
 * rule: the dimming **fades**, and only the content moves.
 *
 * "Scan now" opens the scanner inside the modal. A code it reads is sent as
 * scan proof for that item (`capture-qr` with the item as the subject), and
 * the scan state everywhere on the modal is read back from the order's proofs
 * and this phone's own record (data/useItemScans).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions, type FlatList as RNFlatList, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack, useTheme } from 'tamagui';
import { FlatList } from '../../ui/Scroll';
import { Body } from '../../ui/Text';
import { useTranslation } from '../../i18n/useTranslation';
import { useEditableEntityFields, entityIdOf, type EntityRecord, type OrderStop } from '../../data';
import { useItemScans, entityScanIdOf } from '../../data/useItemScans';
import { Glyph } from '../jobs/parts';
import { ItemCard, ItemIcon } from './ItemCard';
import { ItemScanner, PhotoViewer, type ScanTarget } from './ItemOverlays';

const IN_MS = 240;
const OUT_MS = 180;
/** How far below its resting place the content starts. Enough to read as rising, not the whole screen. */
const TRAVEL = 48;
/** The modal's side margin, and the gap between two cards: together they leave the next card's edge in view. */
const GUTTER = 16;
const CARD_GAP = 10;
const PEEK = 34;
/** The dimming and what is written straight on it are the same in every theme: it is dark over any order screen. */
const SCRIM = 'rgba(3,6,10,0.74)';
const ON_SCRIM = '#FFFFFF';
const ON_SCRIM_QUIET = 'rgba(255,255,255,0.45)';
/** More dots than this do not fit beside the title; the title's count says it instead. */
const MAX_DOTS = 12;

export interface ItemPagerModalProps {
    visible: boolean;
    onClose: () => void;
    orderId: string;
    /** The order's items, as its payload carries them. */
    entities: unknown[];
    /** The order's waypoints, to name where each item is going. */
    stops?: OrderStop[];
    /** The item to open at. */
    initialIndex?: number;
    /** The step that asks for a scan, when the order's next step does. */
    scanNeed?: string;
    openUrl: (url: string) => Promise<unknown>;
}

export function ItemPagerModal({ visible, onClose, ...body }: ItemPagerModalProps) {
    const progress = useRef(new Animated.Value(0)).current;
    // Mounted from the moment it opens until its closing animation has finished.
    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        let cancelled = false;
        if (visible) setMounted(true);
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled) return;
                if (reduced) {
                    progress.setValue(visible ? 1 : 0);
                    if (!visible) setMounted(false);
                    return;
                }
                Animated.timing(progress, {
                    toValue: visible ? 1 : 0,
                    duration: visible ? IN_MS : OUT_MS,
                    easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
                    useNativeDriver: true,
                }).start(({ finished }) => {
                    if (finished && !visible && !cancelled) setMounted(false);
                });
            });
        return () => {
            cancelled = true;
        };
    }, [visible, progress]);

    return (
        <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.root} testID="item-modal">
                {/* The dimming: fades, never moves. */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]} pointerEvents="none" />
                {/* The header and the cards: the only things that move. Nothing is fetched until the modal is opened. */}
                {mounted ? (
                    <Animated.View style={[styles.content, { opacity: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [TRAVEL, 0] }) }] }]}>
                        <PagerBody onClose={onClose} {...body} />
                    </Animated.View>
                ) : null}
            </View>
        </Modal>
    );
}

/**
 * The keyboard, for a field edited inside the modal.
 *
 * `visible` is true while it is up, on both platforms: the footer and the hint
 * give their room to the field. On iOS the card's own scroll view moves the
 * field clear of the keyboard. On Android a modal's window normally resizes
 * itself; where it does not (a window drawn edge to edge), `pad` is the
 * keyboard's height, to be kept clear at the foot of the modal. Which of the
 * two happened is read from the modal's own height: `onLayout` goes on its root.
 */
function useKeyboard() {
    const [visible, setVisible] = useState(false);
    const [pad, setPad] = useState(0);
    const up = useRef(false);
    const restHeight = useRef(0);
    const liveHeight = useRef(0);

    const onLayout = useCallback((event: LayoutChangeEvent) => {
        const height = event.nativeEvent.layout.height;
        liveHeight.current = height;
        if (!up.current) restHeight.current = height;
    }, []);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
            up.current = true;
            setVisible(true);
            if (Platform.OS !== 'android') return;
            const height = event?.endCoordinates?.height ?? 0;
            // Given a moment to resize; if the modal is still as tall as it was, the keyboard is over it.
            timer = setTimeout(() => {
                if (up.current && height > 0 && liveHeight.current >= restHeight.current - 24) setPad(height);
            }, 120);
        });
        const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
            up.current = false;
            if (timer) clearTimeout(timer);
            setVisible(false);
            setPad(0);
        });
        return () => {
            if (timer) clearTimeout(timer);
            show.remove();
            hide.remove();
        };
    }, []);

    return { visible, pad, onLayout };
}

function PagerBody({ onClose, orderId, entities, stops, initialIndex = 0, scanNeed, openUrl }: Omit<ItemPagerModalProps, 'visible'>) {
    const { t } = useTranslation();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const { visible: keyboardUp, pad: keyboardPad, onLayout: onRootLayout } = useKeyboard();

    const items = useMemo(() => entities.filter((entity): entity is EntityRecord => !!entity && typeof entity === 'object'), [entities]);
    const count = items.length;
    const start = Math.min(Math.max(0, initialIndex), Math.max(0, count - 1));
    const [index, setIndex] = useState(start);
    const [listHeight, setListHeight] = useState(0);
    const listRef = useRef<RNFlatList<EntityRecord>>(null);

    // One answer for the whole order, asked once: which fields its type lets a driver change.
    const { isEditable } = useEditableEntityFields(orderId);
    const scans = useItemScans(orderId);
    const [scanning, setScanning] = useState<ScanTarget | null>(null);
    const [photo, setPhoto] = useState<{ uri: string; name?: string } | null>(null);

    /*
     * The payload's copy of an item is sparse (often without the id it is
     * scanned under); each card passes up the fuller record once it has
     * loaded, so the count in the header covers every item a card has shown.
     */
    const [resolved, setResolved] = useState<Record<number, EntityRecord>>({});
    const resolve = useCallback((position: number, entity: EntityRecord) => {
        setResolved((previous) => (previous[position] === entity ? previous : { ...previous, [position]: entity }));
    }, []);

    // With one item the card takes the width; with more, the next one's edge shows.
    const cardWidth = Math.max(0, count > 1 ? width - GUTTER - CARD_GAP - PEEK : width - GUTTER * 2);
    const pitch = cardWidth + CARD_GAP;
    const trailing = Math.max(0, width - GUTTER - pitch);

    const scannable = items.map((item, position) => entityScanIdOf(resolved[position] ?? item));
    const scannedCount = scannable.filter((subjectId) => !!scans.scanOf(subjectId)).length;
    const showScanCount = scannable.some(Boolean);

    const onScroll = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (pitch <= 0) return;
            const next = Math.min(Math.max(0, Math.round(event.nativeEvent.contentOffset.x / pitch)), Math.max(0, count - 1));
            setIndex((previous) => (previous === next ? previous : next));
        },
        [pitch, count]
    );

    const scanSubject = scanning?.subjectId;
    const sendScan = scans.scan;
    const onCode = useCallback((code: string) => sendScan(scanSubject as string, code), [sendScan, scanSubject]);
    const closeScanner = useCallback(() => setScanning(null), []);

    const top = Math.max(insets.top, GUTTER) + 4;
    const bottom = Math.max(insets.bottom, GUTTER);
    const ink = theme.textPrimary?.val as string;
    const secondaryInk = theme.textSecondary?.val as string;

    return (
        <View style={[styles.fill, { paddingBottom: keyboardPad }]} onLayout={onRootLayout}>
            {/* Tapping the dimmed order behind closes the modal, as it does every sheet. */}
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('itemDetail.close')} testID="item-modal-dismiss" />

            <XStack alignItems="center" gap={12} height={48} marginTop={top} marginHorizontal={GUTTER} pointerEvents="box-none" testID="item-pager-header">
                <YStack
                    width={48}
                    height={48}
                    borderRadius={24}
                    flexShrink={0}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor="$background"
                    borderWidth={1}
                    borderColor="$border"
                    onPress={onClose}
                    pressStyle={{ opacity: 0.7 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('itemDetail.close')}
                    testID="item-close"
                >
                    <Glyph name="close" size={18} strokeWidth={2.6} color={ink} />
                </YStack>
                <YStack flex={1} minWidth={0} gap={6} pointerEvents="none">
                    <Body fontSize={17} lineHeight={20} fontWeight="800" tabular color={ON_SCRIM} numberOfLines={1} testID="item-position">
                        {t('itemDetail.position', { index: index + 1, total: count })}
                    </Body>
                    {count > 1 && count <= MAX_DOTS ? (
                        <XStack alignItems="center" gap={6} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                            {items.map((_, position) => (
                                <YStack key={position} width={position === index ? 24 : 6} height={6} borderRadius={3} backgroundColor={position === index ? ON_SCRIM : ON_SCRIM_QUIET} />
                            ))}
                        </XStack>
                    ) : null}
                </YStack>
                {showScanCount ? (
                    <XStack alignItems="center" gap={6} height={32} paddingHorizontal={12} flexShrink={0} borderRadius={16} backgroundColor="$background" borderWidth={1} borderColor="$border" pointerEvents="none" testID="item-scan-count">
                        <ItemIcon name="scan" size={14} color={secondaryInk} />
                        <Body fontSize={13} lineHeight={16} fontWeight="800" tabular tone="secondary" numberOfLines={1}>
                            {t('itemDetail.scannedCount', { scanned: scannedCount, total: count })}
                        </Body>
                    </XStack>
                ) : null}
            </XStack>

            <View style={styles.pager} onLayout={(event) => setListHeight(Math.round(event.nativeEvent.layout.height))} pointerEvents="box-none">
                {/* Drawn once its height is known: a card is as tall as the room between the header and the foot. */}
                {listHeight > 0 && count > 0 ? (
                    <FlatList<EntityRecord>
                        ref={listRef}
                        data={items}
                        horizontal
                        keyExtractor={(item, position) => `${entityIdOf(item) ?? 'item'}-${position}`}
                        // Snaps a card at a time; a card narrower than the screen is what lets the next one show.
                        snapToInterval={pitch}
                        snapToAlignment="start"
                        decelerationRate="fast"
                        disableIntervalMomentum
                        bounces={false}
                        overScrollMode="never"
                        // Swiping is for moving between items; while a field is being typed in, the card stays put.
                        scrollEnabled={count > 1 && !keyboardUp}
                        keyboardShouldPersistTaps="handled"
                        initialScrollIndex={start}
                        getItemLayout={(_, position) => ({ length: pitch, offset: pitch * position, index: position })}
                        initialNumToRender={2}
                        windowSize={5}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        contentContainerStyle={{ paddingLeft: GUTTER, paddingRight: trailing }}
                        style={{ height: listHeight }}
                        renderItem={({ item, index: position }) => (
                            <View style={[{ width: pitch, height: listHeight, paddingRight: CARD_GAP, opacity: position === index ? 1 : 0.8 }, styles.shadow]}>
                                <ItemCard
                                    entityId={entityIdOf(item)}
                                    seed={item}
                                    stops={stops}
                                    isEditable={isEditable}
                                    scanOf={scans.scanOf}
                                    scansLoading={scans.isLoading}
                                    scansFailed={scans.failed}
                                    scanNeed={scanNeed}
                                    onScan={setScanning}
                                    onOpenPhoto={setPhoto}
                                    onResolved={(entity) => resolve(position, entity)}
                                    openUrl={openUrl}
                                    hideFooter={keyboardUp}
                                />
                            </View>
                        )}
                        testID="item-pager"
                    />
                ) : null}
            </View>

            {/* Under the cards, on the dimming: there is more than one. Gone while the keyboard needs the room. */}
            {keyboardUp ? null : (
                <XStack alignItems="center" justifyContent="center" gap={6} minHeight={16} marginTop={count > 1 ? 14 : 0} marginBottom={bottom} pointerEvents="none">
                    {count > 1 ? (
                        <>
                            <Body fontSize={13} lineHeight={16} fontWeight="700" color={ON_SCRIM} opacity={0.75} numberOfLines={1} testID="item-swipe-hint">
                                {index < count - 1 ? t('itemDetail.swipeNext') : t('itemDetail.swipeBack')}
                            </Body>
                            {index < count - 1 ? <ItemIcon name="arrow" size={14} color={ON_SCRIM_QUIET} strokeWidth={2.6} /> : null}
                        </>
                    ) : null}
                </XStack>
            )}

            {photo ? <PhotoViewer uri={photo.uri} name={photo.name} onClose={() => setPhoto(null)} topInset={insets.top} /> : null}
            {scanning ? <ItemScanner item={scanning} onCode={onCode} onClose={closeScanner} topInset={insets.top} bottomInset={insets.bottom} /> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    fill: { flex: 1 },
    content: { flex: 1 },
    backdrop: { backgroundColor: SCRIM },
    pager: { flex: 1, marginTop: 12 },
    shadow: { shadowColor: '#000000', shadowOpacity: 0.6, shadowRadius: 22, shadowOffset: { width: 0, height: 18 } },
});

export default ItemPagerModal;
