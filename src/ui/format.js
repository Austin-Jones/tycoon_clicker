export function formatNumber(value) {
    if (!Number.isFinite(value)) {
        return '0';
    }

    const absolute = Math.abs(value);

    if (absolute < 1000) {
        if (absolute >= 100) {
            return value.toFixed(0);
        }

        if (absolute >= 10) {
            return value.toFixed(1);
        }

        return value.toFixed(2);
    }

    const suffixes = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let scaled = absolute;
    let suffixIndex = -1;

    while (scaled >= 1000 && suffixIndex < suffixes.length - 1) {
        scaled /= 1000;
        suffixIndex += 1;
    }

    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    const signed = value < 0 ? -scaled : scaled;
    return `${signed.toFixed(decimals)}${suffixes[suffixIndex]}`;
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
