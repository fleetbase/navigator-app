/**
 * What the app knows about itself, for a bug report.
 *
 * Gathered in one place and **shown to the driver before anything is sent**.
 * A "report a problem" button that quietly attaches diagnostics is a button
 * that attaches whatever a future version decides to attach; if it is on the
 * screen, it is something the driver agreed to send.
 *
 * Deliberately narrow. No location, no order contents, no tokens — a bug report
 * needs to identify the build and the state it broke in, not the person.
 */
export interface Diagnostics {
    appVersion: string;
    platform: string;
    /** The API this app is talking to, so a report names the right instance. */
    host?: string;
    /** Public driver id — the report is filed under it anyway. */
    driverId?: string;
    /** Work still waiting to sync, which is often the whole story. */
    queued: number;
    failed: number;
    online: boolean;
}

export function describeDiagnostics(d: Diagnostics): string {
    const lines = [
        `App: ${d.appVersion} (${d.platform})`,
        d.host ? `Server: ${d.host}` : undefined,
        d.driverId ? `Driver: ${d.driverId}` : undefined,
        `Connection: ${d.online ? 'online' : 'offline'}`,
        `Queued: ${d.queued}${d.failed ? `, failed: ${d.failed}` : ''}`,
    ];
    return lines.filter(Boolean).join('\n');
}
