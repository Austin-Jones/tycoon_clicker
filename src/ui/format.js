export function formatNumber(value) {
    if (!Number.isFinite(value)) {
        return '0';
    }

    const floored = Math.floor(value);
    const absolute = Math.abs(floored);

    if (absolute < 1000) {
        return `${floored}`;
    }

    const suffixes = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let scaled = absolute;
    let suffixIndex = -1;

    while (scaled >= 1000 && suffixIndex < suffixes.length - 1) {
        scaled /= 1000;
        suffixIndex += 1;
    }

    const truncatedScaled = Math.floor(scaled);
    const signed = floored < 0 ? -truncatedScaled : truncatedScaled;
    return `${signed}${suffixes[suffixIndex]}`;
}

export function formatRelativeTime(timestamp) {
    if (!timestamp) {
        return 'Not saved yet';
    }

    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

    if (seconds < 5) {
        return 'Saved just now';
    }

    if (seconds < 60) {
        return `Saved ${seconds}s ago`;
    }

    const minutes = Math.floor(seconds / 60);
    return `Saved ${minutes}m ago`;
}
