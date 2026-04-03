export function drawIcon(graphics, type, size, colors) {
    const primary = colors.primary;
    const secondary = colors.secondary || primary;
    const accent = colors.accent || secondary;

    graphics.clear();

    switch (type) {
    case 'budget':
        graphics.fillStyle(primary, 1);
        graphics.fillCircle(size * 0.5, size * 0.5, size * 0.42);
        graphics.fillStyle(accent, 0.95);
        graphics.fillCircle(size * 0.5, size * 0.5, size * 0.33);
        graphics.fillStyle(secondary, 1);
        graphics.fillRect(size * 0.36, size * 0.46, size * 0.28, size * 0.08);
        graphics.fillRect(size * 0.46, size * 0.3, size * 0.08, size * 0.4);
        break;
    case 'stamp':
        graphics.fillStyle(primary, 1);
        graphics.fillRoundedRect(size * 0.18, size * 0.54, size * 0.64, size * 0.2, size * 0.08);
        graphics.fillRoundedRect(size * 0.32, size * 0.2, size * 0.36, size * 0.18, size * 0.08);
        graphics.fillRoundedRect(size * 0.4, size * 0.34, size * 0.2, size * 0.24, size * 0.06);
        graphics.fillStyle(accent, 0.95);
        graphics.fillRoundedRect(size * 0.14, size * 0.6, size * 0.72, size * 0.14, size * 0.05);
        break;
    case 'folder':
        graphics.fillStyle(primary, 1);
        graphics.fillRoundedRect(size * 0.12, size * 0.32, size * 0.76, size * 0.48, size * 0.1);
        graphics.fillStyle(secondary, 1);
        graphics.fillRoundedRect(size * 0.18, size * 0.2, size * 0.34, size * 0.18, size * 0.08);
        break;
    case 'seal':
        graphics.fillStyle(primary, 1);
        for (let i = 0; i < 8; i += 1) {
            const angle = Phaser.Math.DegToRad(i * 45);
            graphics.fillCircle(
                size * 0.5 + Math.cos(angle) * size * 0.22,
                size * 0.5 + Math.sin(angle) * size * 0.22,
                size * 0.14
            );
        }
        graphics.fillStyle(secondary, 1);
        graphics.fillCircle(size * 0.5, size * 0.5, size * 0.22);
        graphics.fillStyle(accent, 0.95);
        graphics.fillCircle(size * 0.5, size * 0.5, size * 0.12);
        break;
    case 'clipboard':
        graphics.fillStyle(primary, 1);
        graphics.fillRoundedRect(size * 0.18, size * 0.18, size * 0.64, size * 0.68, size * 0.08);
        graphics.fillStyle(secondary, 1);
        graphics.fillRoundedRect(size * 0.34, size * 0.12, size * 0.32, size * 0.14, size * 0.06);
        graphics.fillStyle(accent, 0.9);
        graphics.fillRoundedRect(size * 0.3, size * 0.4, size * 0.4, size * 0.06, size * 0.03);
        graphics.fillRoundedRect(size * 0.3, size * 0.54, size * 0.32, size * 0.06, size * 0.03);
        break;
    default:
        graphics.fillStyle(primary, 1);
        graphics.fillCircle(size * 0.5, size * 0.5, size * 0.36);
    }
}
