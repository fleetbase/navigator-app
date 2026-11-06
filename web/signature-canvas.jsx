/**
 * react-native-signature-canvas, as a real canvas. The native package wraps this
 * same idea in a WebView, which is what a browser doesn't need. Same props and ref.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

const SignatureCanvas = forwardRef(function SignatureCanvas(
    { onOK, onEmpty, onClear, onBegin, onEnd, descriptionText = 'Sign above', clearText = 'Clear', confirmText = 'Confirm', webStyle = '', penColor = '#000000', backgroundColor = '#ffffff', style },
    ref
) {
    const canvasRef = useRef(null);
    const strokes = useRef([]);
    const drawing = useRef(null);

    const paint = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const scale = window.devicePixelRatio || 1;
        const context = canvas.getContext('2d');
        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = penColor;
        context.lineWidth = 2.5;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        for (const points of strokes.current) {
            context.beginPath();
            context.moveTo(points[0].x, points[0].y);
            if (points.length === 1) context.lineTo(points[0].x + 0.1, points[0].y);
            // Through the midpoints, so fast strokes stay curved rather than faceted.
            for (let i = 1; i < points.length - 1; i += 1) {
                context.quadraticCurveTo(points[i].x, points[i].y, (points[i].x + points[i + 1].x) / 2, (points[i].y + points[i + 1].y) / 2);
            }
            if (points.length > 1) context.lineTo(points[points.length - 1].x, points[points.length - 1].y);
            context.stroke();
        }
    }, [backgroundColor, penColor]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const resize = () => {
            const scale = window.devicePixelRatio || 1;
            canvas.width = canvas.clientWidth * scale;
            canvas.height = canvas.clientHeight * scale;
            paint();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [paint]);

    const pointOf = (event) => {
        const box = canvasRef.current.getBoundingClientRect();
        return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    const handleDown = (event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = [pointOf(event)];
        strokes.current.push(drawing.current);
        paint();
        onBegin?.();
    };
    const handleMove = (event) => {
        if (!drawing.current) return;
        const moves = event.nativeEvent.getCoalescedEvents?.() ?? [event];
        for (const move of moves.length ? moves : [event]) drawing.current.push(pointOf(move));
        paint();
    };
    const handleUp = () => {
        if (!drawing.current) return;
        drawing.current = null;
        onEnd?.();
    };

    const clearSignature = useCallback(() => {
        strokes.current = [];
        paint();
        onClear?.();
    }, [onClear, paint]);

    const readSignature = useCallback(() => {
        if (!strokes.current.length) {
            onEmpty?.();
            return;
        }
        onOK?.(canvasRef.current.toDataURL('image/png'));
    }, [onEmpty, onOK]);

    useImperativeHandle(ref, () => ({ readSignature, clearSignature, undo: () => (strokes.current.pop(), paint()), redo() {}, erase() {}, draw() {} }), [readSignature, clearSignature, paint]);

    // Every screen hides the package's footer with this one rule and draws its own buttons.
    const showFooter = !/m-signature-pad--footer\s*\{[^}]*display:\s*none/.test(webStyle);

    return (
        <View style={[{ flex: 1, backgroundColor }, style]}>
            <canvas
                ref={canvasRef}
                data-testid="signature-canvas"
                aria-label={descriptionText}
                style={{ flex: 1, minHeight: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair', display: 'block' }}
                onPointerDown={handleDown}
                onPointerMove={handleMove}
                onPointerUp={handleUp}
                onPointerCancel={handleUp}
            />
            {showFooter ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8 }}>
                    <Pressable onPress={clearSignature}>
                        <Text>{clearText}</Text>
                    </Pressable>
                    <Text>{descriptionText}</Text>
                    <Pressable onPress={readSignature}>
                        <Text>{confirmText}</Text>
                    </Pressable>
                </View>
            ) : null}
        </View>
    );
});

export default SignatureCanvas;
