import { ECONOMY, UPGRADE_DEFINITIONS } from '../game/constants.js';
import { GameState } from '../game/GameState.js';
import { formatNumber, formatRelativeTime } from '../ui/format.js';
import { THEME } from '../ui/theme.js';

const TAB_UPGRADES = 'upgrades';
const TAB_LOG = 'log';

const LAYOUT = {
    edge: 14,
    gap: 10,
    cardPadding: 14,
    radius: 18,
    headerHeight: 88,
    stampHeight: 156,
    statsHeight: 224,
    tabsHeight: 38,
    utilityHeight: 52,
    statCols: 2,
    statRows: 3,
    statGap: 8,
    statHeight: 38,
    upgradeCardHeight: 78,
    upgradeGap: 8,
    logRowHeight: 46,
};

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function createBlock(scene, fill, alpha = 1, radius = LAYOUT.radius) {
    const graphics = scene.add.graphics();
    graphics._width = 0;
    graphics._height = 0;
    graphics._fill = fill;
    graphics._alpha = alpha;
    graphics._radius = radius;

    graphics.redraw = () => {
        graphics.clear();
        graphics.fillStyle(graphics._fill, graphics._alpha);
        graphics.fillRoundedRect(0, 0, graphics._width, graphics._height, graphics._radius);
    };

    graphics.resize = (width, height) => {
        if (graphics._width === width && graphics._height === height) {
            return graphics;
        }
        graphics._width = width;
        graphics._height = height;
        graphics.redraw();
        return graphics;
    };

    graphics.setBlockFill = (fillColor, fillAlpha = graphics._alpha) => {
        if (graphics._fill === fillColor && graphics._alpha === fillAlpha) {
            return graphics;
        }
        graphics._fill = fillColor;
        graphics._alpha = fillAlpha;
        graphics.redraw();
        return graphics;
    };

    return graphics;
}

function createLabel(scene, text, style) {
    return scene.add.text(0, 0, text, style).setOrigin(0);
}

function createPanel(scene, fill, shadowFill = 0x08111a) {
    const container = scene.add.container(0, 0);
    const shadow = createBlock(scene, shadowFill, 0.22).setPosition(0, 5);
    const body = createBlock(scene, fill, 1);
    container.add([shadow, body]);

    container.shadow = shadow;
    container.body = body;
    container.resize = (width, height) => {
        shadow.resize(width, height).setPosition(0, 5);
        body.resize(width, height);
        return container;
    };

    return container;
}

function createButton(scene, label, palette, onClick, options = {}) {
    const container = scene.add.container(0, 0);
    const shadow = createBlock(scene, 0x071018, 0.24, 16).setPosition(0, 5);
    const body = createBlock(scene, palette.fill, 1, 16);
    const labelText = scene.add.text(0, 0, label, {
        fontFamily: THEME.typography.title,
        fontSize: '16px',
        color: palette.text,
        fontStyle: 'bold',
        align: 'center',
    }).setOrigin(0.5);
    const hit = scene.add.rectangle(0, 0, 100, 40, 0x000000, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });

    container.add([shadow, body, labelText, hit]);
    container.shadow = shadow;
    container.body = body;
    container.label = labelText;
    container.hit = hit;
    container.disabled = false;
    container.triggeredOnDown = false;

    container.resize = (width, height, fontSize = '16px') => {
        shadow.resize(width, height).setPosition(0, 5);
        body.resize(width, height);
        labelText.setPosition(width / 2, height / 2).setFontSize(fontSize);
        hit.setSize(width, height);
        return container;
    };

    container.setDisabled = (disabled) => {
        if (container.disabled === disabled) {
            return;
        }
        container.disabled = disabled;
        body.setBlockFill(disabled ? palette.disabled : palette.fill, 1);
        labelText.setAlpha(disabled ? 0.55 : 1);
    };

    const resetVisualState = () => {
        shadow.setY(5);
        container.setScale(1);
        body.setBlockFill(container.disabled ? palette.disabled : palette.fill, 1);
    };

    hit.on('pointerdown', () => {
        if (container.disabled) {
            return;
        }
        body.setBlockFill(palette.pressed, 1);
        shadow.setY(2);
        container.setScale(0.985);
        if (options.triggerOnDown) {
            container.triggeredOnDown = true;
            onClick();
        }
    });

    hit.on('pointerup', () => {
        if (container.disabled) {
            return;
        }
        resetVisualState();
        if (container.triggeredOnDown) {
            container.triggeredOnDown = false;
            return;
        }
        if (scene.panelDragging) {
            return;
        }
        onClick();
    });

    hit.on('pointerout', () => {
        container.triggeredOnDown = false;
        resetVisualState();
    });

    return container;
}

export class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        this.activeTab = TAB_UPGRADES;
        this.panelDragging = false;
        this.pointerDownInPanel = false;
        this.panelScroll = 0;
        this.panelScrollTarget = 0;
        this.maxPanelScroll = 0;
        this.simulationAccumulator = 0;
        this.valueCache = {};
        this.needsLogRefresh = true;
    }

    create() {
        this.gameState = new GameState();
        this.createBackground();
        this.createUi();

        this.gameState.onChange = (_state, change = {}) => {
            if (change.log) {
                this.needsLogRefresh = true;
            }
            this.refreshChangedUi(change);
        };

        this.gameState.load();
        this.registerInput();
        this.layout();
        this.refreshAllUi(true);

        this.scale.on('resize', () => {
            this.layout();
            this.refreshAllUi(true);
        });

        this.time.addEvent({
            delay: ECONOMY.passiveSaveSeconds * 1000,
            loop: true,
            callback: () => this.gameState.save(),
        });

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.gameState.save();
        });
    }

    createBackground() {
        this.background = this.add.graphics();
    }

    createUi() {
        this.ui = {
            root: this.add.container(0, 0),
            cards: {},
            tabs: {},
            statTiles: [],
            upgradeEntries: [],
            logRows: [],
        };

        this.createCards();
        this.createHeaderSection();
        this.createStampSection();
        this.createStatsSection();
        this.createBottomSection();
        this.createUtilitySection();
    }

    createCards() {
        this.ui.cards.header = createPanel(this, THEME.colors.cardBlue);
        this.ui.cards.stamp = createPanel(this, THEME.colors.cream);
        this.ui.cards.stats = createPanel(this, THEME.colors.cardBlue);
        this.ui.cards.bottom = createPanel(this, THEME.colors.cardBlueDeep);
        this.ui.cards.utility = createPanel(this, THEME.colors.cardBlueDeep);
        this.ui.root.add(Object.values(this.ui.cards));
    }

    createHeaderSection() {
        this.ui.headerTitle = createLabel(this, 'Bureaucracy Tycoon', {
            fontFamily: THEME.typography.title,
            fontSize: '22px',
            color: THEME.colors.textPrimary,
            fontStyle: 'bold',
        });
        this.ui.headerHint = createLabel(this, 'New forms arrive in your inbox. Process them to earn budget.', {
            fontFamily: THEME.typography.body,
            fontSize: '11px',
            color: THEME.colors.textMuted,
            wordWrap: { width: 180 },
        });
        this.ui.headerBudgetLabel = createLabel(this, 'Budget', {
            fontFamily: THEME.typography.body,
            fontSize: '12px',
            color: THEME.colors.textSubtle,
        });
        this.ui.headerBudgetValue = createLabel(this, '$0', {
            fontFamily: THEME.typography.accent,
            fontSize: '28px',
            color: '#ffe7b0',
            fontStyle: 'bold',
        });

        this.ui.root.add([this.ui.headerTitle, this.ui.headerHint, this.ui.headerBudgetLabel, this.ui.headerBudgetValue]);
    }

    createStampSection() {
        this.ui.stampTitle = createLabel(this, 'Manual Processing', {
            fontFamily: THEME.typography.title,
            fontSize: '18px',
            color: THEME.colors.textDark,
            fontStyle: 'bold',
        });
        this.ui.pendingCount = createLabel(this, '0 inbox', {
            fontFamily: THEME.typography.body,
            fontSize: '13px',
            color: '#52606d',
            fontStyle: 'bold',
        });
        this.ui.overflowStatus = createLabel(this, '', {
            fontFamily: THEME.typography.body,
            fontSize: '11px',
            color: '#8a3f39',
            fontStyle: 'bold',
        });
        this.ui.worthPerForm = createLabel(this, 'Process 1 form to earn $1', {
            fontFamily: THEME.typography.body,
            fontSize: '13px',
            color: '#6a5540',
        });
        this.ui.stampButton = createButton(this, 'STAMP FORM', {
            fill: THEME.colors.stampRed,
            pressed: THEME.colors.stampRedDeep,
            disabled: 0x756864,
            text: '#fff8ef',
        }, () => this.handleManualProcess(), { triggerOnDown: true });

        this.ui.root.add([
            this.ui.stampTitle,
            this.ui.pendingCount,
            this.ui.overflowStatus,
            this.ui.worthPerForm,
            this.ui.stampButton,
        ]);
    }

    createStatsSection() {
        this.ui.statsTitle = createLabel(this, 'Snapshot', {
            fontFamily: THEME.typography.title,
            fontSize: '18px',
            color: THEME.colors.textPrimary,
            fontStyle: 'bold',
        });
        this.ui.root.add(this.ui.statsTitle);

        const statDefs = [
            ['pendingForms', 'Inbox'],
            ['processedFormsLifetime', 'Processed Total'],
            ['arrivalRate', 'New Forms / s'],
            ['autoProcessRate', 'Auto Process / s'],
            ['incomePerSecond', 'Income / s'],
            ['bureaucracyLevel', 'Office Level'],
            ['queueCapacity', 'Inbox Limit'],
        ];

        statDefs.forEach(([key, label]) => {
            const panel = createPanel(this, THEME.colors.cardNavy, 0x061019);
            const labelText = createLabel(this, label, {
                fontFamily: THEME.typography.body,
                fontSize: '11px',
                color: THEME.colors.textSubtle,
                fontStyle: 'bold',
            });
            const valueText = createLabel(this, '0', {
                fontFamily: THEME.typography.accent,
                fontSize: '18px',
                color: THEME.colors.textPrimary,
                fontStyle: 'bold',
            });

            this.ui.statTiles.push({ key, panel, label: labelText, value: valueText });
            this.ui.root.add([panel, labelText, valueText]);
        });
    }

    createBottomSection() {
        this.ui.bottomTitle = createLabel(this, 'Control Center', {
            fontFamily: THEME.typography.title,
            fontSize: '17px',
            color: THEME.colors.textPrimary,
            fontStyle: 'bold',
        });

        this.ui.tabs.upgrades = createButton(this, 'Upgrades', {
            fill: THEME.colors.cardTeal,
            pressed: 0x25474a,
            disabled: THEME.colors.cardTeal,
            text: '#eefaf7',
        }, () => this.setActiveTab(TAB_UPGRADES));

        this.ui.tabs.log = createButton(this, 'Log', {
            fill: THEME.colors.cardNavy,
            pressed: 0x182534,
            disabled: THEME.colors.cardNavy,
            text: '#eef6ff',
        }, () => this.setActiveTab(TAB_LOG));

        this.ui.panelViewport = this.add.container(0, 0);
        this.ui.panelMask = this.make.graphics({ x: 0, y: 0, add: false });
        this.ui.panelViewport.setMask(this.ui.panelMask.createGeometryMask());
        this.ui.logPanel = this.add.container(0, 0).setVisible(false);

        Object.values(UPGRADE_DEFINITIONS).forEach((upgrade) => {
            const entry = this.createUpgradeCard(upgrade);
            if (!entry || !entry.container) {
                console.error('Invalid upgrade card entry', upgrade, entry);
                return;
            }
            this.ui.upgradeEntries.push(entry);
            this.ui.panelViewport.add(entry.container);
        });

        for (let index = 0; index < ECONOMY.logLimit; index += 1) {
            const rowPanel = createPanel(this, THEME.colors.cardNavy, 0x061019);
            const rowText = createLabel(this, '', {
                fontFamily: THEME.typography.body,
                fontSize: '12px',
                color: THEME.colors.textPrimary,
                wordWrap: { width: 260 },
            });
            this.ui.logRows.push({ panel: rowPanel, text: rowText });
            this.ui.logPanel.add([rowPanel, rowText]);
        }

        this.ui.root.add([
            this.ui.bottomTitle,
            this.ui.tabs.upgrades,
            this.ui.tabs.log,
            this.ui.panelViewport,
            this.ui.logPanel,
        ]);
    }

    createUpgradeCard(upgrade) {
        const container = this.add.container(0, 0);
        const panel = createPanel(this, THEME.colors.cream, 0x09111a);
        const title = createLabel(this, upgrade.title, {
            fontFamily: THEME.typography.title,
            fontSize: '15px',
            color: THEME.colors.textDark,
            fontStyle: 'bold',
            wordWrap: { width: 150 },
        });
        const effect = createLabel(this, upgrade.description, {
            fontFamily: THEME.typography.body,
            fontSize: '11px',
            color: '#596775',
            wordWrap: { width: 180 },
        });
        const level = createLabel(this, 'Lv 0', {
            fontFamily: THEME.typography.body,
            fontSize: '11px',
            color: '#596775',
            fontStyle: 'bold',
        });
        const cost = createLabel(this, '$0', {
            fontFamily: THEME.typography.accent,
            fontSize: '16px',
            color: '#7a332e',
            fontStyle: 'bold',
        });
        const buyButton = createButton(this, 'Buy', {
            fill: THEME.colors.cardBlue,
            pressed: THEME.colors.cardBlueDeep,
            disabled: 0x68727b,
            text: '#f6f7f8',
        }, () => this.handleUpgradePurchase(upgrade.id));

        container.add([panel, title, effect, level, cost, buyButton].filter(Boolean));

        return {
            container,
            panel,
            title,
            effect,
            level,
            cost,
            buyButton,
            upgradeId: upgrade.id,
        };
    }

    createUtilitySection() {
        this.ui.saveStatus = createLabel(this, 'Not saved yet', {
            fontFamily: THEME.typography.body,
            fontSize: '12px',
            color: THEME.colors.textSubtle,
        });
        this.ui.resetButton = createButton(this, 'Reset', {
            fill: THEME.colors.danger,
            pressed: 0x5f3943,
            disabled: THEME.colors.danger,
            text: '#fff4f3',
        }, () => this.handleReset());

        this.ui.root.add([this.ui.saveStatus, this.ui.resetButton]);
    }

    registerInput() {
        this.input.on('wheel', (_pointer, _gameObjects, _deltaX, deltaY) => {
            if (this.activeTab !== TAB_UPGRADES || !this.maxPanelScroll) {
                return;
            }
            this.panelScrollTarget = clamp(this.panelScrollTarget + (deltaY * 0.55), 0, this.maxPanelScroll);
        });

        this.input.on('pointerdown', (pointer) => {
            this.dragStartY = pointer.y;
            this.dragStartScroll = this.panelScrollTarget;
            this.pointerDownInPanel = this.activeTab === TAB_UPGRADES && this.isInsideUpgradeViewport(pointer.x, pointer.y);
            this.panelDragging = false;
        });

        this.input.on('pointermove', (pointer) => {
            if (!pointer.isDown || !this.pointerDownInPanel) {
                return;
            }
            if (!this.panelDragging && Math.abs(pointer.y - this.dragStartY) > 10) {
                this.panelDragging = true;
            }
            if (!this.panelDragging) {
                return;
            }
            this.panelScrollTarget = clamp(this.dragStartScroll - (pointer.y - this.dragStartY), 0, this.maxPanelScroll);
        });

        this.input.on('pointerup', () => {
            this.panelDragging = false;
            this.pointerDownInPanel = false;
        });
    }

    isInsideUpgradeViewport(x, y) {
        const bounds = this.ui.upgradeViewportBounds;
        return bounds
            && x >= bounds.x
            && x <= bounds.x + bounds.width
            && y >= bounds.y
            && y <= bounds.y + bounds.height;
    }

    layout() {
        const width = this.scale.width;
        const height = this.scale.height;
        const contentWidth = width - (LAYOUT.edge * 2);
        const topUsed = LAYOUT.headerHeight + LAYOUT.stampHeight + LAYOUT.statsHeight + LAYOUT.utilityHeight + (LAYOUT.gap * 4);
        const bottomHeight = Math.max(220, height - ((LAYOUT.edge * 2) + topUsed));

        this.layoutBackground(width, height);

        let y = LAYOUT.edge;

        this.ui.cards.header.setPosition(LAYOUT.edge, y).resize(contentWidth, LAYOUT.headerHeight);
        this.ui.headerTitle.setPosition(LAYOUT.edge + LAYOUT.cardPadding, y + 16).setWordWrapWidth(contentWidth - 140);
        this.ui.headerHint.setPosition(LAYOUT.edge + LAYOUT.cardPadding, y + 46).setWordWrapWidth(contentWidth - 140);
        this.ui.headerBudgetLabel.setPosition(LAYOUT.edge + contentWidth - 94, y + 16);
        this.ui.headerBudgetValue.setPosition(LAYOUT.edge + contentWidth - 94, y + 32);
        y += LAYOUT.headerHeight + LAYOUT.gap;

        this.ui.cards.stamp.setPosition(LAYOUT.edge, y).resize(contentWidth, LAYOUT.stampHeight);
        this.ui.stampTitle.setPosition(LAYOUT.edge + LAYOUT.cardPadding, y + 14);
        this.ui.stampButton.setPosition(LAYOUT.edge + LAYOUT.cardPadding, y + 48).resize(contentWidth - (LAYOUT.cardPadding * 2), 66, '22px');
        this.ui.pendingCount.setPosition(LAYOUT.edge + LAYOUT.cardPadding, y + 124);
        this.ui.overflowStatus.setPosition(LAYOUT.edge + LAYOUT.cardPadding, y + 24).setWordWrapWidth(contentWidth - (LAYOUT.cardPadding * 2));
        this.ui.worthPerForm.setPosition(LAYOUT.edge + contentWidth - 132, y + 124).setWordWrapWidth(118);
        y += LAYOUT.stampHeight + LAYOUT.gap;

        this.ui.cards.stats.setPosition(LAYOUT.edge, y).resize(contentWidth, LAYOUT.statsHeight);
        this.ui.statsTitle.setPosition(LAYOUT.edge + LAYOUT.cardPadding, y + 12);

        const statTileWidth = Math.floor((contentWidth - (LAYOUT.cardPadding * 2) - LAYOUT.statGap) / LAYOUT.statCols);
        this.ui.statTiles.forEach((tile, index) => {
            const col = index % LAYOUT.statCols;
            const row = Math.floor(index / LAYOUT.statCols);
            const tileX = LAYOUT.edge + LAYOUT.cardPadding + (col * (statTileWidth + LAYOUT.statGap));
            const tileY = y + 44 + (row * (LAYOUT.statHeight + LAYOUT.statGap));
            tile.panel.setPosition(tileX, tileY).resize(statTileWidth, LAYOUT.statHeight);
            tile.label.setPosition(tileX + 10, tileY + 8).setWordWrapWidth(statTileWidth - 20);
            tile.value.setPosition(tileX + 10, tileY + 18);
        });
        y += LAYOUT.statsHeight + LAYOUT.gap;

        this.ui.cards.bottom.setPosition(LAYOUT.edge, y).resize(contentWidth, bottomHeight);
        this.ui.bottomTitle.setPosition(LAYOUT.edge + LAYOUT.cardPadding, y + 12);
        this.ui.tabs.upgrades.setPosition(LAYOUT.edge + contentWidth - 166, y + 8).resize(82, LAYOUT.tabsHeight, '14px');
        this.ui.tabs.log.setPosition(LAYOUT.edge + contentWidth - 76, y + 8).resize(60, LAYOUT.tabsHeight, '14px');

        const viewportX = LAYOUT.edge + LAYOUT.cardPadding;
        const viewportY = y + 52;
        const viewportWidth = contentWidth - (LAYOUT.cardPadding * 2);
        const viewportHeight = bottomHeight - 60;

        this.ui.upgradeViewportBounds = {
            x: viewportX,
            y: viewportY,
            width: viewportWidth,
            height: viewportHeight,
        };

        this.ui.panelMask.clear();
        this.ui.panelMask.fillStyle(0xffffff, 1);
        this.ui.panelMask.fillRect(viewportX, viewportY, viewportWidth, viewportHeight);

        const visibleEntries = this.ui.upgradeEntries.filter((entry) => entry.container.visible);

        visibleEntries.forEach((entry, index) => {
            const rowY = index * (LAYOUT.upgradeCardHeight + LAYOUT.upgradeGap);
            entry.container.setPosition(viewportX, viewportY + rowY);
            entry.panel.resize(viewportWidth, LAYOUT.upgradeCardHeight);
            entry.title.setPosition(12, 10).setWordWrapWidth(viewportWidth - 120);
            entry.level.setPosition(12, 30);
            entry.effect.setPosition(12, 48).setWordWrapWidth(viewportWidth - 120);
            entry.cost.setPosition(viewportWidth - 86, 12);
            entry.buyButton.setPosition(viewportWidth - 78, 38).resize(66, 30, '13px');
        });

        this.maxPanelScroll = Math.max(
            0,
            (visibleEntries.length * (LAYOUT.upgradeCardHeight + LAYOUT.upgradeGap)) - viewportHeight
        );
        this.panelScrollTarget = clamp(this.panelScrollTarget, 0, this.maxPanelScroll);
        this.panelScroll = clamp(this.panelScroll, 0, this.maxPanelScroll);
        this.ui.panelViewport.setY(-Math.round(this.panelScroll));

        this.ui.logRows.forEach(({ panel, text }, index) => {
            const rowY = viewportY + (index * (LAYOUT.logRowHeight + 8));
            panel.setPosition(viewportX, rowY).resize(viewportWidth, LAYOUT.logRowHeight);
            text.setPosition(viewportX + 10, rowY + 9).setWordWrapWidth(viewportWidth - 20);
        });

        y += bottomHeight + LAYOUT.gap;

        this.ui.cards.utility.setPosition(LAYOUT.edge, y).resize(contentWidth, LAYOUT.utilityHeight);
        this.ui.saveStatus.setPosition(LAYOUT.edge + LAYOUT.cardPadding, y + 18).setWordWrapWidth(contentWidth - 120);
        this.ui.resetButton.setPosition(LAYOUT.edge + contentWidth - 78, y + 10).resize(64, 32, '13px');

        this.setActiveTab(this.activeTab, true);
    }

    layoutBackground(width, height) {
        this.background.clear();
        this.background.fillGradientStyle(
            THEME.colors.backgroundTop,
            THEME.colors.backgroundTop,
            THEME.colors.backgroundBottom,
            THEME.colors.backgroundBottom,
            1
        );
        this.background.fillRect(0, 0, width, height);
    }

    setActiveTab(tab, force = false) {
        if (!force && this.activeTab === tab) {
            return;
        }

        this.activeTab = tab;
        const showingUpgrades = tab === TAB_UPGRADES;
        this.ui.panelViewport.setVisible(showingUpgrades);
        this.ui.logPanel.setVisible(!showingUpgrades);
        this.ui.tabs.upgrades.body.setBlockFill(showingUpgrades ? THEME.colors.cardTeal : THEME.colors.cardNavy, 1);
        this.ui.tabs.log.body.setBlockFill(showingUpgrades ? THEME.colors.cardNavy : THEME.colors.cardTeal, 1);
    }

    handleManualProcess() {
        const result = this.gameState.processOneManualForm();
        if (!result || result.processed <= 0) {
            return;
        }

        this.tweens.killTweensOf(this.ui.stampButton);
        this.ui.stampButton.setScale(0.985);
        this.tweens.add({
            targets: this.ui.stampButton,
            scaleX: 1,
            scaleY: 1,
            duration: 90,
            ease: 'Quad.out',
        });
    }

    handleUpgradePurchase(id) {
        this.gameState.buyUpgrade(id);
    }

    handleReset() {
        this.gameState.reset();
        this.panelScroll = 0;
        this.panelScrollTarget = 0;
        this.ui.panelViewport.setY(0);
    }

    refreshChangedUi(change = {}) {
        if (change.resources) {
            this.refreshResources();
            this.refreshUpgradeAffordability();
        }
        if (change.queue) {
            this.refreshResources();
            this.refreshStats();
        }
        if (change.stats) {
            this.refreshStats();
        }
        if (change.upgrades) {
            this.refreshUpgrades();
        }
        if (change.log) {
            this.refreshLog();
        }
        if (change.utility) {
            this.refreshUtility();
        }
    }

    refreshAllUi() {
        this.refreshResources();
        this.refreshStats();
        this.refreshUpgrades();
        this.refreshLog(true);
        this.refreshUtility();
    }

    setCachedText(key, target, value) {
        if (this.valueCache[key] === value) {
            return;
        }
        // Mobile text measurement is relatively expensive, so the scene only
        // mutates labels whose underlying value actually changed.
        this.valueCache[key] = value;
        target.setText(value);
    }

    refreshResources() {
        const state = this.gameState.state;
        const stats = this.gameState.getStats();
        const overflowText = stats.overflowActive
            ? 'Inbox Full. New forms are being rejected.'
            : '';

        this.setCachedText('budget', this.ui.headerBudgetValue, `$${formatNumber(state.money)}`);
        this.setCachedText('pendingCount', this.ui.pendingCount, `Inbox: ${formatNumber(state.pendingForms)} / ${formatNumber(stats.queueCapacity)}`);
        this.setCachedText('overflowStatus', this.ui.overflowStatus, overflowText);
        this.setCachedText('worthPerForm', this.ui.worthPerForm, `Process ${formatNumber(this.gameState.getStats().manualProcessAmount)} form${this.gameState.getStats().manualProcessAmount === 1 ? '' : 's'} to earn $${formatNumber(this.gameState.getMoneyPerProcessedForm())}`);
        this.ui.pendingCount.setColor(stats.overflowActive ? '#8a3f39' : '#52606d');
        this.ui.overflowStatus.setVisible(stats.overflowActive);
        this.ui.stampButton.setDisabled(state.pendingForms <= 0);
    }

    refreshStats() {
        const state = this.gameState.state;
        const stats = this.gameState.getStats();
        const values = {
            pendingForms: formatNumber(state.pendingForms),
            processedFormsLifetime: formatNumber(state.processedFormsLifetime),
            arrivalRate: formatNumber(stats.arrivalRate),
            autoProcessRate: formatNumber(stats.autoProcessRate),
            incomePerSecond: stats.incomePerSecond > 0 && stats.incomePerSecond < 1 ? '<1' : formatNumber(stats.incomePerSecond),
            bureaucracyLevel: formatNumber(state.bureaucracyLevel),
            queueCapacity: formatNumber(stats.queueCapacity),
        };

        this.ui.statTiles.forEach((tile) => {
            this.setCachedText(`stat-${tile.key}`, tile.value, values[tile.key]);
        });
    }

    refreshUpgrades() {
        let visibilityChanged = false;

        this.ui.upgradeEntries.forEach((entry) => {
            const unlocked = this.gameState.isUpgradeUnlocked(entry.upgradeId);
            if (entry.container.visible !== unlocked) {
                entry.container.setVisible(unlocked);
                visibilityChanged = true;
            }

            if (!unlocked) {
                return;
            }

            const level = this.gameState.getUpgradeLevel(entry.upgradeId);
            const cost = this.gameState.getUpgradeCost(entry.upgradeId);
            const maxed = this.gameState.isUpgradeMaxed(entry.upgradeId);

            this.setCachedText(`upgrade-level-${entry.upgradeId}`, entry.level, `Lv ${level}`);
            this.setCachedText(`upgrade-cost-${entry.upgradeId}`, entry.cost, maxed ? 'Max' : `$${formatNumber(cost)}`);
            this.setCachedText(`upgrade-button-${entry.upgradeId}`, entry.buyButton.label, maxed ? 'Max' : 'Buy');
        });

        if (visibilityChanged) {
            this.layout();
        }
        this.refreshUpgradeAffordability();
    }

    refreshUpgradeAffordability() {
        this.ui.upgradeEntries.forEach((entry) => {
            if (!entry.container.visible) {
                return;
            }

            if (this.gameState.isUpgradeMaxed(entry.upgradeId)) {
                entry.buyButton.setDisabled(true);
                entry.panel.body.setBlockFill(0xd6ccbb, 1);
                entry.cost.setColor('#6e675d');
                return;
            }

            const affordable = this.gameState.canAfford(this.gameState.getUpgradeCost(entry.upgradeId));
            const key = `upgrade-affordable-${entry.upgradeId}`;
            if (this.valueCache[key] === affordable) {
                return;
            }

            this.valueCache[key] = affordable;
            entry.buyButton.setDisabled(!affordable);
            entry.panel.body.setBlockFill(affordable ? THEME.colors.cream : 0xd6ccbb, 1);
            entry.cost.setColor(affordable ? '#7a332e' : '#6e675d');
        });
    }

    refreshLog(force = false) {
        if (!force && !this.needsLogRefresh) {
            return;
        }

        this.ui.logRows.forEach(({ text }, index) => {
            const message = (this.gameState.state.statusLog[index] || '').replace(/^\d+\.\s*/, '');
            this.setCachedText(`log-${index}`, text, message);
        });
        this.needsLogRefresh = false;
    }

    refreshUtility() {
        this.setCachedText('saveStatus', this.ui.saveStatus, formatRelativeTime(this.gameState.state.lastSavedAt));
    }

    update(_time, delta) {
        this.simulationAccumulator += delta;

        while (this.simulationAccumulator >= ECONOMY.tickRateMs) {
            this.gameState.tick(ECONOMY.tickRateMs / 1000);
            this.simulationAccumulator -= ECONOMY.tickRateMs;
        }

        if (this.activeTab === TAB_UPGRADES && Math.abs(this.panelScrollTarget - this.panelScroll) > 0.25) {
            this.panelScroll += (this.panelScrollTarget - this.panelScroll) * 0.28;
            this.ui.panelViewport.setY(-Math.round(this.panelScroll));
        }

        const currentSaveSecond = Math.floor(this.time.now / 1000);
        if (this.lastSaveSecond !== currentSaveSecond) {
            this.lastSaveSecond = currentSaveSecond;
            this.refreshUtility();
        }
    }
}
