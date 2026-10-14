import { recordProof, proofFor, takeAutoAdvance, clearProof, resetProofLedger } from '../proofLedger';

beforeEach(() => resetProofLedger());

describe('proof ledger', () => {
    it('remembers a capture for its order and activity, and advances once', () => {
        recordProof('order_1', 'completed', { proofId: 'proof_1' });
        expect(proofFor('order_1', 'completed')?.proofId).toBe('proof_1');
        expect(proofFor('order_1', 'arrived')).toBeUndefined();
        expect(takeAutoAdvance('order_1', 'completed')).toBe(true);
        // Once. The proof still counts for a manual tap.
        expect(takeAutoAdvance('order_1', 'completed')).toBe(false);
        expect(proofFor('order_1', 'completed')).toBeDefined();
    });

    it('does not advance by itself long after the capture', () => {
        recordProof('order_1', 'completed', { queued: true });
        expect(takeAutoAdvance('order_1', 'completed', Date.now() + 60 * 60 * 1000)).toBe(false);
    });

    it('is spent once the activity goes through', () => {
        recordProof('order_1', 'completed');
        clearProof('order_1', 'completed');
        expect(proofFor('order_1', 'completed')).toBeUndefined();
    });
});
