/**
 * The signing surface of the proof-by-signature screen (design round 3,
 * SignatureA and SignatureB).
 *
 * A LIGHT pad with DARK ink in every colour scheme: dark ink on a light pad is
 * the easiest to make and to read, and it is what the saved image looks like.
 * Everything around the pad follows the theme; nothing in here does.
 *
 * It is drawn by the app (touches in, SVG paths out), not by a WebView:
 *
 *   - the pad owns its touches: it takes the responder on touch down and does
 *     not give it up, so nothing around it can scroll or swipe mid-signature;
 *   - the strokes are held as points, so the screen can tell a signature from a
 *     stray dot, and can carry what was signed from the upright pad to the wide
 *     one and back (`refitInk`);
 *   - touch positions are read in the pad's own coordinates (`locationX`,
 *     `locationY`), which stay right when the whole layout is drawn turned on
 *     its side. The browser build works them out itself (see `pointOf`).
 *
 * The image that is sent is a PNG of the ink alone on white, cropped to the
 * signature: `react-native-svg` renders it on the phone (`toDataURL`), a canvas
 * in the browser.
 */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { XStack } from 'tamagui';
import { Body } from '../../ui/Text';
import { ProofIcon } from './parts';

/** The pad's own colours: the same in every scheme. */
export const PAD = {
    surface: '#F2F5F9',
    ink: '#0A0F17',
    line: '#8896AB',
    hint: '#5F7191',
    note: '#3A4A63',
    paper: '#FFFFFF',
} as const;

const INK_WIDTH = 3.2;
const PAD_RADIUS = 22;
/** A new point is kept once the finger has moved this far: closer ones are the sensor's noise. */
const MIN_STEP = 1.2;
/** The sent image fits in this box (in points; the phone renders it at its own pixel density). */
const EXPORT_MAX_WIDTH = 320;
const EXPORT_MAX_HEIGHT = 160;
const EXPORT_MARGIN = 12;
/** How long the phone is given to render the image before the send is called off. */
const EXPORT_TIMEOUT_MS = 4000;

/** One stroke: its points as `x0, y0, x1, y1…` in the pad's coordinates, and the path drawn through them. */
export interface Stroke {
    points: number[];
    d: string;
}

/** What has been signed, and the pad it was signed on (strokes only mean something on a pad of that size). */
export interface Ink {
    strokes: Stroke[];
    width: number;
    height: number;
    /** The signing line's distance from the pad's top. */
    base: number;
}

export const NO_INK: Ink = { strokes: [], width: 0, height: 0, base: 0 };
const NO_STROKES: Stroke[] = [];

const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * The path through a stroke's points: curves through the midpoints, so a fast
 * stroke stays round instead of showing its corners. A single point is a dot.
 */
export function pathOf(points: number[]): string {
    const count = points.length / 2;
    if (count < 1) return '';
    let d = `M${round(points[0])} ${round(points[1])}`;
    if (count === 1) return `${d}l0.1 0`;
    for (let i = 1; i < count; i += 1) {
        const px = points[2 * i - 2];
        const py = points[2 * i - 1];
        const mx = (px + points[2 * i]) / 2;
        const my = (py + points[2 * i + 1]) / 2;
        d += i === 1 ? `L${round(mx)} ${round(my)}` : `Q${round(px)} ${round(py)} ${round(mx)} ${round(my)}`;
    }
    return `${d}L${round(points[2 * count - 2])} ${round(points[2 * count - 1])}`;
}

/** How much ink there is: the length drawn, and the box it sits in. */
export function inkMetrics(strokes: Stroke[]): { length: number; minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
    let length = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const stroke of strokes) {
        const points = stroke.points;
        for (let i = 0; i < points.length; i += 2) {
            const x = points[i];
            const y = points[i + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            if (i >= 2) length += Math.hypot(x - points[i - 2], y - points[i - 1]);
        }
    }
    if (minX === Infinity) return { length: 0, minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    return { length, minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Less ink than this, in all, is a dot or a tick and not a signature: about a centimetre and a quarter of line. */
export const MIN_INK_LENGTH = 80;
/** Ink that all sits inside a box smaller than this (its longer side) is a scribble on one spot: about half a centimetre. */
export const MIN_INK_SPAN = 32;

/**
 * Is this a signature, or a mark too small to count?
 *
 * The rule, in full: the strokes together are at least 80 points long, and
 * the ink is at least 32 points across one way or the other. Two initials pass
 * easily; a dot, a tick or a dab on one spot does not.
 */
export function isSignature(strokes: Stroke[]): boolean {
    const ink = inkMetrics(strokes);
    return ink.length >= MIN_INK_LENGTH && Math.max(ink.width, ink.height) >= MIN_INK_SPAN;
}

/**
 * Carries what was signed onto a pad of another shape (upright to wide, or
 * back). The signature keeps its proportions and its place against the signing
 * line; it is made smaller only when it would not fit, never larger.
 */
export function refitInk(ink: Ink, width: number, height: number, base: number): Ink {
    if (!ink.strokes.length || ink.width <= 0 || ink.height <= 0) return { strokes: ink.strokes, width, height, base };
    const box = inkMetrics(ink.strokes);
    const margin = 12;
    const scale = Math.min(1, (width - 2 * margin) / Math.max(box.width, 1), (height - 2 * margin) / Math.max(box.height, 1));
    const fittedWidth = box.width * scale;
    const fittedHeight = box.height * scale;
    const centre = (box.minX + box.maxX) / 2;
    // Across: the same share of the way along the pad. Down: the same distance from the signing line.
    const newCentre = clamp((centre / ink.width) * width, margin + fittedWidth / 2, Math.max(margin + fittedWidth / 2, width - margin - fittedWidth / 2));
    const newTop = clamp(base + (box.minY - ink.base) * scale, margin, Math.max(margin, height - margin - fittedHeight));
    const strokes = ink.strokes.map((stroke) => {
        const points = stroke.points.map((value, index) => (index % 2 === 0 ? newCentre + (value - centre) * scale : newTop + (value - box.minY) * scale));
        return { points, d: pathOf(points) };
    });
    return { strokes, width, height, base };
}

/** The part of the pad that is sent, and the size it is rendered at. */
interface ExportFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    outWidth: number;
    outHeight: number;
}

function exportFrameOf(strokes: Stroke[], padWidth: number, padHeight: number): ExportFrame | null {
    if (!strokes.length || padWidth <= 0 || padHeight <= 0) return null;
    const box = inkMetrics(strokes);
    const width = box.width + 2 * EXPORT_MARGIN;
    const height = box.height + 2 * EXPORT_MARGIN;
    const fit = Math.min(Math.min(EXPORT_MAX_WIDTH, padWidth) / width, Math.min(EXPORT_MAX_HEIGHT, padHeight) / height);
    return { x: box.minX - EXPORT_MARGIN, y: box.minY - EXPORT_MARGIN, width, height, outWidth: Math.max(1, Math.round(width * fit)), outHeight: Math.max(1, Math.round(height * fit)) };
}

/** The browser's way to the same image: the strokes drawn on a canvas. Bare base64, no `data:` prefix. */
function canvasImageOf(strokes: Stroke[], frame: ExportFrame): string | null {
    if (typeof document === 'undefined') return null;
    try {
        const density = 2;
        const canvas = document.createElement('canvas');
        canvas.width = frame.outWidth * density;
        canvas.height = frame.outHeight * density;
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.fillStyle = PAD.paper;
        context.fillRect(0, 0, canvas.width, canvas.height);
        const scale = (frame.outWidth / frame.width) * density;
        context.setTransform(scale, 0, 0, scale, -frame.x * scale, -frame.y * scale);
        context.strokeStyle = PAD.ink;
        context.lineWidth = INK_WIDTH;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        for (const stroke of strokes) {
            const points = stroke.points;
            const count = points.length / 2;
            if (!count) continue;
            context.beginPath();
            context.moveTo(points[0], points[1]);
            if (count === 1) context.lineTo(points[0] + 0.1, points[1]);
            for (let i = 1; i < count; i += 1) {
                const mx = (points[2 * i - 2] + points[2 * i]) / 2;
                const my = (points[2 * i - 1] + points[2 * i + 1]) / 2;
                if (i === 1) context.lineTo(mx, my);
                else context.quadraticCurveTo(points[2 * i - 2], points[2 * i - 1], mx, my);
            }
            if (count > 1) context.lineTo(points[2 * count - 2], points[2 * count - 1]);
            context.stroke();
        }
        const url = canvas.toDataURL('image/png');
        const comma = url.indexOf(',');
        return comma > -1 ? url.slice(comma + 1) : null;
    } catch {
        return null;
    }
}

/** The strokes already finished. Kept apart from the one being drawn, so a finger moving does not redraw them. */
const FinishedInk = memo(function FinishedInk({ strokes }: { strokes: Stroke[] }) {
    return (
        <>
            {strokes.map((stroke, index) => (
                <Path key={index} d={stroke.d} fill="none" stroke={PAD.ink} strokeWidth={INK_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
            ))}
        </>
    );
});

export interface SignaturePadHandle {
    /** The signature as a PNG in bare base64, or nothing when there is no ink or it could not be rendered. */
    read: () => Promise<string | null>;
}

export interface SignaturePadProps {
    /** What has been signed. The screen holds it, so it outlives a change of layout. */
    ink: Ink;
    /** A stroke was finished, or the ink was carried onto this pad's shape. */
    onInk: (ink: Ink) => void;
    /** A finger has come down on the pad. */
    onBegin?: () => void;
    /** `wide` is the pad of the phone on its side: one long line, lower on the pad. */
    variant: 'upright' | 'wide';
    /** Takes no more ink (sending, or done). */
    locked?: boolean;
    /** The layout is drawn turned on its side inside an upright window. Only the browser needs telling. */
    turned?: boolean;
    /** "Sign here". */
    hint: string;
    /** Who is signing, when the order names its customer. */
    signer?: string;
    /** When the last stroke was made. */
    time?: string;
    /** Read out for the pad. */
    label: string;
    testID?: string;
    /** Controls drawn over the pad's corner (the screen's "Turn to sign"). */
    children?: ReactNode;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad({ ink, onInk, onBegin, variant, locked, turned, hint, signer, time, label, testID, children }, ref) {
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);
    /** The stroke under the finger, as a path; nothing when no finger is down. */
    const [live, setLive] = useState<string | null>(null);

    const wide = variant === 'wide';
    const inset = wide ? 32 : 24;
    // The mockups: the line 220 up a 568-high upright pad, 70 up the wide one. Lower on a shorter pad.
    const lineUp = size ? (wide ? Math.min(70, Math.round(size.height * 0.3)) : Math.min(220, Math.round(size.height * 0.39))) : 0;
    const base = size ? size.height - lineUp : 0;

    const onLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setSize((current) => (current && Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5 ? current : { width, height }));
    }, []);

    /** The ink was made on a pad of this shape (or there is none): it can be drawn as it is. */
    const fits = !!size && (!ink.strokes.length || (Math.abs(ink.width - size.width) < 0.5 && Math.abs(ink.height - size.height) < 0.5));

    // Ink from the other layout: carried onto this pad before it is drawn.
    useEffect(() => {
        if (!size || fits) return;
        onInk(refitInk(ink, size.width, size.height, base));
    }, [size, fits, ink, base, onInk]);

    const strokes = fits ? ink.strokes : NO_STROKES;
    const frame = useMemo(() => (size ? exportFrameOf(strokes, size.width, size.height) : null), [strokes, size]);

    /* -- Touches. ------------------------------------------------------------- */

    const capture = useRef<View>(null);
    const points = useRef<number[] | null>(null);
    const touchId = useRef<number | string | null>(null);
    const paint = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
    const latest = useRef({ ink, strokes, size, base, onInk, onBegin, locked, turned });
    latest.current = { ink, strokes, size, base, onInk, onBegin, locked, turned };

    useEffect(
        () => () => {
            if (paint.current != null) cancelAnimationFrame(paint.current);
        },
        []
    );

    /** Where the signing finger is, in the pad's own coordinates. Nothing when this event is about another finger. */
    const pointOf = (event: GestureResponderEvent): [number, number] | null => {
        const { size: pad, turned: sideways } = latest.current;
        if (!pad) return null;
        const native = event.nativeEvent;
        let touch: { identifier?: number | string; locationX: number; locationY: number } = native;
        if (touchId.current != null && String(native.identifier) !== String(touchId.current)) {
            // A second finger, or a resting palm, moved: the stroke follows the finger that started it.
            const own = (native.touches ?? []).find((other) => String(other.identifier) === String(touchId.current));
            if (!own) return null;
            touch = own;
        }
        let x = touch.locationX;
        let y = touch.locationY;
        if (Platform.OS === 'web' && sideways) {
            /*
             * The browser works a touch's place out from the element's upright
             * bounding box, which is wrong for an element turned a quarter turn.
             * Worked out here instead: the box's centre is the pad's centre, and
             * a quarter turn clockwise sends the pad's (x, y) to the screen's
             * (-y, x), so the way back is x = screen y, y = -screen x.
             */
            const element = capture.current as unknown as { getBoundingClientRect?: () => { left: number; top: number; width: number; height: number } } | null;
            const box = element?.getBoundingClientRect?.();
            const pointer = touch as unknown as { clientX?: number; clientY?: number; pageX?: number; pageY?: number };
            const screenX = pointer.clientX ?? pointer.pageX;
            const screenY = pointer.clientY ?? pointer.pageY;
            if (box && typeof screenX === 'number' && typeof screenY === 'number') {
                const fromCentreX = screenX - (box.left + box.width / 2);
                const fromCentreY = screenY - (box.top + box.height / 2);
                x = pad.width / 2 + fromCentreY;
                y = pad.height / 2 - fromCentreX;
            }
        }
        if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) return null;
        return [clamp(x, 0, pad.width), clamp(y, 0, pad.height)];
    };

    const schedulePaint = () => {
        if (paint.current != null) return;
        paint.current = requestAnimationFrame(() => {
            paint.current = null;
            if (points.current) setLive(pathOf(points.current));
        });
    };

    const begin = (event: GestureResponderEvent) => {
        touchId.current = event.nativeEvent.identifier ?? null;
        const point = pointOf(event);
        if (!point) {
            touchId.current = null;
            return;
        }
        points.current = [point[0], point[1]];
        setLive(pathOf(points.current));
        latest.current.onBegin?.();
    };

    const move = (event: GestureResponderEvent) => {
        const current = points.current;
        if (!current) return;
        const point = pointOf(event);
        if (!point) return;
        const lastX = current[current.length - 2];
        const lastY = current[current.length - 1];
        if (Math.hypot(point[0] - lastX, point[1] - lastY) < MIN_STEP) return;
        current.push(point[0], point[1]);
        schedulePaint();
    };

    const end = () => {
        const finished = points.current;
        points.current = null;
        touchId.current = null;
        if (paint.current != null) {
            cancelAnimationFrame(paint.current);
            paint.current = null;
        }
        setLive(null);
        const { size: pad, strokes: held, base: line, onInk: tell } = latest.current;
        if (!finished || !pad) return;
        tell({ strokes: [...held, { points: finished, d: pathOf(finished) }], width: pad.width, height: pad.height, base: line });
    };

    /* -- The image. ------------------------------------------------------------- */

    const exported = useRef<{ toDataURL?: (callback: (base64?: string) => void) => void } | null>(null);
    const exportable = useRef({ strokes, frame });
    exportable.current = { strokes, frame };

    useImperativeHandle(
        ref,
        () => ({
            read: () =>
                new Promise<string | null>((resolve) => {
                    const { strokes: held, frame: area } = exportable.current;
                    if (!held.length || !area) {
                        resolve(null);
                        return;
                    }
                    if (Platform.OS === 'web') {
                        resolve(canvasImageOf(held, area));
                        return;
                    }
                    const svg = exported.current;
                    if (!svg || typeof svg.toDataURL !== 'function') {
                        resolve(null);
                        return;
                    }
                    let settled = false;
                    const settle = (value: string | null) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        resolve(value);
                    };
                    const timer = setTimeout(() => settle(null), EXPORT_TIMEOUT_MS);
                    try {
                        // No size given: the image is the hidden drawing below, as the phone renders it.
                        // Line breaks are taken out: the server decodes the base64 strictly.
                        svg.toDataURL((base64) => settle(typeof base64 === 'string' && base64 ? base64.replace(/\s+/g, '') : null));
                    } catch {
                        settle(null);
                    }
                }),
        }),
        []
    );

    const showHint = !strokes.length && live === null;
    const lineWidth = size ? Math.max(0, size.width - 2 * inset) : 0;

    return (
        <View onLayout={onLayout} style={{ flex: 1, minHeight: 0, borderRadius: PAD_RADIUS, backgroundColor: PAD.surface, overflow: 'hidden' }} testID={testID}>
            {/*
              * The image that is sent: the ink alone on white, cropped to the
              * signature. It is drawn here, under the pad's own surface, so the
              * phone has rendered it by the time it is asked for; it is never seen.
              */}
            {frame && Platform.OS !== 'web' ? (
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Svg ref={exported as never} width={frame.outWidth} height={frame.outHeight} viewBox={`${round(frame.x)} ${round(frame.y)} ${round(frame.width)} ${round(frame.height)}`}>
                        <Rect x={frame.x - 4} y={frame.y - 4} width={frame.width + 8} height={frame.height + 8} fill={PAD.paper} />
                        <FinishedInk strokes={strokes} />
                    </Svg>
                </View>
            ) : null}
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: PAD.surface }} />

            {size ? (
                <>
                    {/* The signing line. Dashed, so it reads as a place to write and not as part of the signature. */}
                    <View pointerEvents="none" style={{ position: 'absolute', left: inset, bottom: lineUp }}>
                        <Svg width={lineWidth} height={2}>
                            <Line x1={0} y1={1} x2={lineWidth} y2={1} stroke={PAD.line} strokeWidth={2} strokeDasharray="7 5" />
                        </Svg>
                    </View>

                    {/* "Sign here", under the line. Gone once a finger comes down. */}
                    {showHint ? (
                        <XStack pointerEvents="none" position="absolute" left={inset} bottom={Math.max(4, lineUp - (wide ? 34 : 36))} alignItems="center" gap={8}>
                            <ProofIcon name="close" size={16} strokeWidth={3.2} color={PAD.hint} />
                            <Body fontSize={17} lineHeight={22} fontWeight="800" color={PAD.hint} numberOfLines={1}>
                                {hint}
                            </Body>
                        </XStack>
                    ) : null}

                    {/* Who is signing, and when: small, at the pad's foot. */}
                    {wide ? (
                        signer ? (
                            <XStack pointerEvents="none" position="absolute" right={inset} bottom={Math.max(4, lineUp - 33)} maxWidth="55%">
                                <Body fontSize={15} lineHeight={20} fontWeight="700" color={PAD.note} numberOfLines={1}>
                                    {signer}
                                </Body>
                            </XStack>
                        ) : null
                    ) : signer || time ? (
                        <XStack pointerEvents="none" position="absolute" left={inset} right={inset} bottom={22} alignItems="baseline" justifyContent="space-between" gap={12}>
                            <Body flexShrink={1} fontSize={15} lineHeight={20} fontWeight="700" color={PAD.note} numberOfLines={1}>
                                {signer ?? ''}
                            </Body>
                            {time ? (
                                <Body flexShrink={0} fontSize={15} lineHeight={20} fontWeight="700" tabular color={PAD.note} numberOfLines={1}>
                                    {time}
                                </Body>
                            ) : null}
                        </XStack>
                    ) : null}

                    {/* The ink. */}
                    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
                        <Svg width={size.width} height={size.height}>
                            <FinishedInk strokes={strokes} />
                            {live ? <Path d={live} fill="none" stroke={PAD.ink} strokeWidth={INK_WIDTH} strokeLinecap="round" strokeLinejoin="round" /> : null}
                        </Svg>
                    </View>
                </>
            ) : null}

            {/*
              * The touches. One bare view over the whole pad, with nothing inside
              * it: a touch's position is given against the view it landed on, so
              * a child here would shift the ink. It takes the responder on touch
              * down and refuses to give it up, so the page cannot move mid-stroke.
              */}
            <View
                ref={capture}
                collapsable={false}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                accessible
                accessibilityLabel={label}
                onStartShouldSetResponder={() => !latest.current.locked}
                onMoveShouldSetResponder={() => !latest.current.locked}
                onResponderTerminationRequest={() => false}
                onResponderGrant={begin}
                onResponderMove={move}
                onResponderRelease={end}
                onResponderTerminate={end}
                testID={testID ? `${testID}-surface` : undefined}
            />

            {children}
        </View>
    );
});

export default SignaturePad;
