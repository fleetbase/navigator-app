import { computeEconomy, withEconomy, formatEconomy, formatVolume, formatOdometer, type FuelReportRecord } from '../useFuelReports';

const fill = (over: Partial<FuelReportRecord>): FuelReportRecord => ({
    id: 'r',
    odometer: '1000',
    volume: '40',
    metric_unit: 'L',
    vehicle: { id: 'v1', name: 'EAS-01' },
    ...over,
});

describe('computeEconomy', () => {
    it('derives L/100km from the distance since the previous fill', () => {
        // 500 km on 40 L is 8.0 L/100km.
        const e = computeEconomy(fill({ odometer: '1000' }), fill({ odometer: '1500', volume: '40' }));
        expect(e?.unit).toBe('L/100km');
        expect(e?.value).toBeCloseTo(8, 5);
        expect(e?.distance).toBe(500);
    });

    it('derives mpg when the record is in gallons', () => {
        const e = computeEconomy(fill({ odometer: '1000' }), fill({ odometer: '1300', volume: '10', metric_unit: 'gal' }));
        expect(e?.unit).toBe('mpg');
        expect(e?.value).toBeCloseTo(30, 5);
    });

    it('accepts however the instance spelled litres', () => {
        for (const unit of ['l', 'L', 'ltr', 'Litres']) {
            expect(computeEconomy(fill({ odometer: '0' }), fill({ odometer: '100', volume: '10', metric_unit: unit }))?.unit).toBe('L/100km');
        }
    });

    it('has no economy for the first fill — there is nothing to compare to', () => {
        expect(computeEconomy(null, fill({}))).toBeUndefined();
        expect(computeEconomy(undefined, fill({}))).toBeUndefined();
    });

    it('refuses a non-advancing odometer rather than reporting zero', () => {
        // A correction or re-entry, not infinite economy.
        expect(computeEconomy(fill({ odometer: '1500' }), fill({ odometer: '1500' }))).toBeUndefined();
        expect(computeEconomy(fill({ odometer: '1500' }), fill({ odometer: '1200' }))).toBeUndefined();
    });

    it('refuses zero or missing volume rather than dividing by it', () => {
        expect(computeEconomy(fill({ odometer: '1000' }), fill({ odometer: '1500', volume: '0' }))).toBeUndefined();
        expect(computeEconomy(fill({ odometer: '1000' }), fill({ odometer: '1500', volume: null }))).toBeUndefined();
    });

    it('does not guess at an unknown volume unit', () => {
        expect(computeEconomy(fill({ odometer: '1000' }), fill({ odometer: '1500', metric_unit: 'kg' }))).toBeUndefined();
    });
});

describe('withEconomy', () => {
    it('compares each fill to the previous one on the same vehicle only', () => {
        const rows = withEconomy([
            fill({ id: 'b', odometer: '1500', volume: '40', vehicle: { id: 'v1', name: 'A' } }),
            fill({ id: 'a', odometer: '1000', volume: '30', vehicle: { id: 'v1', name: 'A' } }),
            fill({ id: 'z', odometer: '9000', volume: '50', vehicle: { id: 'v2', name: 'B' } }),
        ]);
        const byId = Object.fromEntries(rows.map((r) => [r.report.id, r.economy]));

        expect(byId.b?.value).toBeCloseTo(8, 5);
        // First fill on each vehicle has no predecessor.
        expect(byId.a).toBeUndefined();
        expect(byId.z).toBeUndefined();
    });

    it('does not let one vehicle borrow another vehicle odometer', () => {
        const rows = withEconomy([
            fill({ id: 'v2first', odometer: '2000', vehicle: { id: 'v2', name: 'B' } }),
            fill({ id: 'v1first', odometer: '1000', vehicle: { id: 'v1', name: 'A' } }),
        ]);
        expect(rows.every((r) => r.economy === undefined)).toBe(true);
    });

    it('preserves the order it was given, so the list stays newest-first', () => {
        const rows = withEconomy([fill({ id: 'x', odometer: '3000' }), fill({ id: 'y', odometer: '1000' })]);
        expect(rows.map((r) => r.report.id)).toEqual(['x', 'y']);
    });
});

describe('formatters', () => {
    it('formats economy to one decimal with its unit', () => {
        expect(formatEconomy({ value: 8.234, unit: 'L/100km', distance: 500 })).toBe('8.2 L/100km');
    });

    it('uses the volume unit the record carries', () => {
        expect(formatVolume(fill({ volume: '38.5', metric_unit: 'L' }))).toBe('38.5 L');
        expect(formatVolume(fill({ volume: null }))).toBe('—');
    });

    it('labels the odometer by the driver unit preference', () => {
        expect(formatOdometer(fill({ odometer: '31240' }), 'metric')).toContain('km');
        expect(formatOdometer(fill({ odometer: '31240' }), 'imperial')).toContain('mi');
    });
});
