/**
 * Driver-facing names for queued work.
 *
 * The queue's default label was `"${method} ${path}"` — "POST issues" — which is
 * fine in a log and useless on a screen the driver reads to decide whether to
 * wait for signal or discard something.
 *
 * A **key** is stored rather than a translated string, because the label is
 * written at enqueue time and read much later: freezing English at enqueue
 * would survive a language change, and a queue that outlives a flight is
 * exactly where that shows.
 */
export interface MutationDescription {
    labelKey: string;
    /** Shown when the key has no translation — never a raw path. */
    fallback: string;
}

interface Rule {
    method?: string;
    /** Matched against the request path. */
    test: RegExp;
    labelKey: string;
    fallback: string;
}

const RULES: Rule[] = [
    { method: 'POST', test: /^orders\/[^/]+\/update-activity$/, labelKey: 'sync.work.advanceOrder', fallback: 'Order progress' },
    { method: 'POST', test: /^orders\/[^/]+\/capture-(qr|scan)$/, labelKey: 'sync.work.scan', fallback: 'Scan' },
    { method: 'PUT', test: /^entities\//, labelKey: 'sync.work.editItem', fallback: 'Item details' },
    { method: 'POST', test: /^fuel-reports$/, labelKey: 'sync.work.fuelReport', fallback: 'Fuel report' },
    { method: 'PUT', test: /^fuel-reports\//, labelKey: 'sync.work.editFuelReport', fallback: 'Fuel report change' },
    { method: 'POST', test: /^issues$/, labelKey: 'sync.work.issue', fallback: 'Reported issue' },
    { method: 'PUT', test: /^issues\//, labelKey: 'sync.work.editIssue', fallback: 'Issue change' },
    { method: 'POST', test: /^chat-channels\/[^/]+\/send-message$/, labelKey: 'sync.work.message', fallback: 'Message' },
    { method: 'POST', test: /^chat-channels\/[^/]+\/add-participant$/, labelKey: 'sync.work.addParticipant', fallback: 'Added someone to a conversation' },
    { method: 'POST', test: /^chat-channels$/, labelKey: 'sync.work.newConversation', fallback: 'New conversation' },
    { method: 'PUT', test: /^drivers\//, labelKey: 'sync.work.profile', fallback: 'Your details' },
];

export function describeMutation(method: string, path: string): MutationDescription {
    const cleaned = path.replace(/^\/+/, '').split('?')[0];
    const upper = method.toUpperCase();

    for (const rule of RULES) {
        if (rule.method && rule.method !== upper) continue;
        if (rule.test.test(cleaned)) return { labelKey: rule.labelKey, fallback: rule.fallback };
    }

    // Unrecognised, but still not a raw path: name the resource it touches.
    const resource = cleaned.split('/')[0] || 'work';
    const humanised = resource.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    return { labelKey: 'sync.work.other', fallback: humanised };
}
