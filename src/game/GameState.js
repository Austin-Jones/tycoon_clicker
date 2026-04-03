import { ECONOMY, SAVE_KEY, STATUS_MESSAGES, UPGRADE_DEFINITIONS } from './constants.js';

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

export class GameState {
    constructor() {
        this.onChange = null;
        this.surgeCooldown = 0;
        this.messageIndex = 0;
        this.state = this.createDefaultState();
    }

    createDefaultState() {
        return {
            money: ECONOMY.startingMoney,
            pendingForms: ECONOMY.startingPendingForms,
            processedFormsLifetime: 0,
            rejectedFormsLifetime: 0,
            bureaucracyLevel: 1,
            upgrades: {
                betterInk: 0,
                largerInbox: 0,
                juniorClerk: 0,
                marketingCampaign: 0,
                complianceDesk: 0,
                approvalLayer: 0,
                expressWindow: 0,
                seniorClerk: 0,
                efficiencyOffice: 0,
                doubleStamp: 0,
                surgeProtocol: 0,
            },
            statusLog: ['Office opened. Initial backlog remains purely aspirational.'],
            unlockFlags: {},
            overflowActive: false,
            lastSavedAt: 0,
        };
    }

    load() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);

            if (!raw) {
                return false;
            }

            const parsed = JSON.parse(raw);
            const fresh = this.createDefaultState();

            this.state = {
                ...fresh,
                ...parsed,
                upgrades: {
                    ...fresh.upgrades,
                    ...(parsed.upgrades || {}),
                },
                unlockFlags: {
                    ...fresh.unlockFlags,
                    ...(parsed.unlockFlags || {}),
                },
                statusLog: Array.isArray(parsed.statusLog) && parsed.statusLog.length
                    ? parsed.statusLog.slice(0, ECONOMY.logLimit)
                    : fresh.statusLog,
            };
            this.surgeCooldown = 0;
            this.checkUpgradeUnlocks();
            this.pushMessage('Archived files recovered from local storage.');
            this.emitChange({
                resources: true,
                stats: true,
                queue: true,
                upgrades: true,
                log: true,
                utility: true,
            });
            return true;
        } catch (error) {
            console.warn('Unable to load Bureaucracy Tycoon save.', error);
            return false;
        }
    }

    save() {
        try {
            this.state.lastSavedAt = Date.now();
            localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
            // Saving only affects the timestamp, so the scene updates that label
            // on its own instead of doing a broader UI refresh here.
        } catch (error) {
            console.warn('Unable to save Bureaucracy Tycoon progress.', error);
        }
    }

    reset() {
        this.state = this.createDefaultState();
        this.surgeCooldown = 0;
        localStorage.removeItem(SAVE_KEY);
        this.pushMessage('All records shredded. Fresh paperwork incoming.');
        this.emitChange({
            resources: true,
            stats: true,
            queue: true,
            upgrades: true,
            log: true,
            utility: true,
        });
    }

    getUpgradeLevel(id) {
        return this.state.upgrades[id] || 0;
    }

    getUpgradeCost(id) {
        const definition = UPGRADE_DEFINITIONS[id];
        const level = this.getUpgradeLevel(id);
        if (definition.maxLevel && level >= definition.maxLevel) {
            return Infinity;
        }
        return Math.floor(definition.baseCost * Math.pow(definition.costScale, level));
    }

    getStats() {
        const betterInk = this.getUpgradeLevel('betterInk');
        const largerInbox = this.getUpgradeLevel('largerInbox');
        const juniorClerk = this.getUpgradeLevel('juniorClerk');
        const seniorClerk = this.getUpgradeLevel('seniorClerk');
        const marketingCampaign = this.getUpgradeLevel('marketingCampaign');
        const complianceDesk = this.getUpgradeLevel('complianceDesk');
        const approvalLayersBought = this.getUpgradeLevel('approvalLayer');
        const expressWindow = this.getUpgradeLevel('expressWindow');
        const efficiencyOffice = this.getUpgradeLevel('efficiencyOffice');
        const doubleStamp = this.getUpgradeLevel('doubleStamp');
        const surgeProtocol = this.getUpgradeLevel('surgeProtocol');
        const approvalMultiplier = 1 + (approvalLayersBought * ECONOMY.approvalLayerBonus);
        const efficiencyMultiplier = 1 + (efficiencyOffice * 0.15);
        const queueCapacity = ECONOMY.startingCapacity + (largerInbox * 8);
        const queueRatio = queueCapacity > 0 ? this.state.pendingForms / queueCapacity : 0;
        const overflowActive = this.state.pendingForms >= queueCapacity;
        const autoProcessRate = ((ECONOMY.startingAutoProcessRate + juniorClerk + (seniorClerk * 2)) * approvalMultiplier) * efficiencyMultiplier;
        const moneyPerForm = ECONOMY.startingMoneyPerForm + betterInk;
        const moneyMultiplier = ((ECONOMY.startingMoneyMultiplier + (complianceDesk * 0.25)) * approvalMultiplier) * efficiencyMultiplier;

        // Approval layers are the main higher-tier growth lever in the MVP.
        // They gently amplify every major rate without needing extra systems.
        return {
            queueCapacity,
            queueRatio,
            overflowActive,
            arrivalRate: (ECONOMY.startingArrivalRate + (marketingCampaign * 0.75)) * approvalMultiplier,
            autoProcessRate,
            moneyPerForm,
            moneyMultiplier,
            incomePerSecond: autoProcessRate * (moneyPerForm * moneyMultiplier),
            approvalMultiplier,
            efficiencyMultiplier,
            manualProcessAmount: ECONOMY.manualProcessAmount + expressWindow + doubleStamp,
            surgeUnlocked: surgeProtocol > 0,
            surgeReady: surgeProtocol > 0 && queueRatio >= ECONOMY.surgeQueueThreshold,
            surgeProcessAmount: surgeProtocol > 0 ? ECONOMY.surgeProcessAmount : 0,
        };
    }

    isUpgradeUnlocked(id) {
        const definition = UPGRADE_DEFINITIONS[id];
        if (!definition || !definition.unlockFlag) {
            return true;
        }
        return !!this.state.unlockFlags[definition.unlockFlag];
    }

    isUpgradeMaxed(id) {
        const definition = UPGRADE_DEFINITIONS[id];
        return !!(definition?.maxLevel && this.getUpgradeLevel(id) >= definition.maxLevel);
    }

    tick(deltaSeconds) {
        const stats = this.getStats();
        let changedResources = false;
        let changedQueue = false;
        let changedUpgrades = false;
        let changedLog = false;

        const arrivingForms = stats.arrivalRate * deltaSeconds;
        if (arrivingForms > 0) {
            const result = this.addPendingForms(arrivingForms, { silent: true });
            changedQueue = changedQueue || result.changedQueue;
            changedResources = changedResources || result.changedResources;
            changedLog = changedLog || result.changedLog;
        }

        const autoProcessedForms = Math.min(this.state.pendingForms, stats.autoProcessRate * deltaSeconds);
        if (autoProcessedForms > 0) {
            const result = this.processForms(autoProcessedForms, 'automation', { silent: true });
            changedResources = changedResources || result.changedResources;
            changedQueue = changedQueue || result.changedQueue;
            changedLog = changedLog || result.changedLog;
        }

        if (stats.surgeUnlocked) {
            this.surgeCooldown -= deltaSeconds;
            if (this.surgeCooldown <= 0 && stats.queueRatio >= ECONOMY.surgeQueueThreshold) {
                this.surgeCooldown = ECONOMY.surgeIntervalSeconds;
                const result = this.processForms(stats.surgeProcessAmount, 'surge', { silent: true });
                changedResources = changedResources || result.changedResources;
                changedQueue = changedQueue || result.changedQueue;
                changedLog = changedLog || result.changedLog;
            }
        }

        changedUpgrades = this.checkUpgradeUnlocks() || changedUpgrades;
        changedLog = this.checkUnlocks() || changedLog;

        // Batch tick-side mutations into a single change notification so
        // automation and form generation don't trigger multiple UI passes.
        if (changedResources || changedQueue || changedUpgrades || changedLog) {
            this.emitChange({
                resources: changedResources,
                stats: changedResources || changedQueue,
                queue: changedQueue,
                upgrades: changedUpgrades,
                log: changedLog,
            });
        }
    }

    addPendingForms(amount, options = {}) {
        const stats = this.getStats();
        const previous = this.state.pendingForms;
        const next = clamp(previous + amount, 0, stats.queueCapacity);
        const accepted = next - previous;
        const rejected = Math.max(0, amount - accepted);
        let changedLog = false;
        let changedResources = false;

        this.state.pendingForms = next;

        if (accepted >= 1 && Math.random() < 0.22) {
            this.pushMessage(pickRandom(STATUS_MESSAGES.arrival));
            changedLog = true;
        }

        if (rejected > 0) {
            this.state.rejectedFormsLifetime += rejected;
            changedResources = true;
            if (!this.state.overflowActive) {
                this.state.overflowActive = true;
                this.pushMessage(`Inbox overflow. ${formatRejected(rejected)} returned to sender.`);
                changedLog = true;
            } else if (rejected >= 1 && Math.random() < 0.28) {
                this.pushMessage(`${formatRejected(rejected)} rejected during backlog overflow.`);
                changedLog = true;
            }
        } else if (this.state.overflowActive && next < stats.queueCapacity) {
            this.state.overflowActive = false;
            this.pushMessage('Overflow pressure eased. New paperwork may once again enter the building.');
            changedLog = true;
        }

        if (!options.silent && (accepted > 0 || rejected > 0 || changedLog)) {
            this.emitChange({
                resources: changedResources,
                stats: changedResources,
                queue: accepted > 0 || rejected > 0,
                log: changedLog,
            });
        }

        return {
            changedQueue: accepted > 0 || rejected > 0,
            changedResources,
            changedLog,
        };
    }

    processOneManualForm() {
        return this.processForms(this.getStats().manualProcessAmount, 'manual');
    }

    getMoneyPerProcessedForm() {
        const stats = this.getStats();
        return stats.moneyPerForm * stats.moneyMultiplier;
    }

    processForms(amount, source, options = {}) {
        const processable = Math.min(amount, this.state.pendingForms);
        let changedLog = false;

        if (processable <= 0) {
            if (source === 'manual') {
                this.pushMessage('No forms available. The queue has achieved stillness.');
                changedLog = true;
                if (!options.silent) {
                    this.emitChange({
                        resources: false,
                        stats: false,
                        queue: false,
                        log: true,
                    });
                }
            }
            return {
                processed: 0,
                changedResources: false,
                changedQueue: false,
                changedLog,
            };
        }

        const stats = this.getStats();
        const payout = processable * stats.moneyPerForm * stats.moneyMultiplier;

        this.state.pendingForms -= processable;
        this.state.processedFormsLifetime += processable;
        this.state.money += payout;

        if (source === 'manual' && Math.random() < 0.2) {
            this.pushMessage('Stamp applied with appropriate ceremonial delay.');
            changedLog = true;
        }

        if (source === 'automation' && processable >= 1 && Math.random() < 0.14) {
            this.pushMessage(pickRandom(STATUS_MESSAGES.automation));
            changedLog = true;
        }

        if (source === 'surge') {
            this.pushMessage('Surge Protocol clears a small emergency stack.');
            changedLog = true;
        }

        if (!options.silent) {
            this.emitChange({
                resources: true,
                stats: true,
                queue: true,
                log: changedLog,
            });
        }

        return {
            processed: processable,
            changedResources: true,
            changedQueue: true,
            changedLog,
        };
    }

    canAfford(cost) {
        return this.state.money >= cost;
    }

    buyUpgrade(id) {
        if (!this.isUpgradeUnlocked(id)) {
            this.pushMessage('That policy has not been unlocked yet.');
            this.emitChange({
                log: true,
            });
            return false;
        }

        if (this.isUpgradeMaxed(id)) {
            this.pushMessage('That policy is already fully adopted.');
            this.emitChange({
                log: true,
            });
            return false;
        }

        const cost = this.getUpgradeCost(id);

        if (!this.canAfford(cost)) {
            this.pushMessage('Purchase request denied for budgetary clarity.');
            this.emitChange({
                resources: false,
                stats: false,
                queue: false,
                upgrades: false,
                log: true,
            });
            return false;
        }

        this.state.money -= cost;
        this.state.upgrades[id] += 1;

        if (id === 'approvalLayer') {
            this.state.bureaucracyLevel += 1;
            this.pushMessage(pickRandom(STATUS_MESSAGES.growth));
        } else {
            const upgrade = UPGRADE_DEFINITIONS[id];
            this.pushMessage(`${upgrade.title} approved by committee.`);
        }

        if (id === 'surgeProtocol') {
            this.surgeCooldown = ECONOMY.surgeIntervalSeconds;
        }

        this.checkUpgradeUnlocks();
        this.checkUnlocks();
        this.emitChange({
            resources: true,
            stats: true,
            queue: id === 'largerInbox',
            upgrades: true,
            log: true,
        });
        return true;
    }

    checkUpgradeUnlocks() {
        let unlocked = false;

        unlocked = this.unlockUpgradeOnce('doubleStamp', this.state.processedFormsLifetime >= 20) || unlocked;
        unlocked = this.unlockUpgradeOnce('seniorClerk', this.state.processedFormsLifetime >= 75) || unlocked;
        unlocked = this.unlockUpgradeOnce('surgeProtocol', this.state.bureaucracyLevel >= 3) || unlocked;

        return unlocked;
    }

    unlockUpgradeOnce(id, condition) {
        const definition = UPGRADE_DEFINITIONS[id];
        if (!definition?.unlockFlag || !condition || this.state.unlockFlags[definition.unlockFlag]) {
            return false;
        }

        this.state.unlockFlags[definition.unlockFlag] = true;
        this.pushMessage(definition.unlockMessage);
        return true;
    }

    checkUnlocks() {
        let unlocked = false;
        const processed = this.state.processedFormsLifetime;
        const money = this.state.money;

        unlocked = this.unlockOnce('forms-10', processed >= 10, 'Ten forms processed. The office now recognizes momentum.') || unlocked;
        unlocked = this.unlockOnce('forms-50', processed >= 50, 'Fifty forms processed. Throughput now qualifies as a management concern.') || unlocked;
        unlocked = this.unlockOnce('money-100', money >= 100, 'Budget surplus detected. Additional clipboards authorized.') || unlocked;
        unlocked = this.unlockOnce('money-250', money >= 250, 'Quarterly budget review passed. Procurement has become optimistic.') || unlocked;
        unlocked = this.unlockOnce('bureaucracy-3', this.state.bureaucracyLevel >= 3, pickRandom(STATUS_MESSAGES.unlocked)) || unlocked;
        unlocked = this.unlockOnce('bureaucracy-4', this.state.bureaucracyLevel >= 4, 'Office Level 4 reached. Departmental momentum has become official.') || unlocked;
        unlocked = this.unlockOnce('auto-5', this.getStats().autoProcessRate >= 5, 'Automation audit passed with minimal enthusiasm.') || unlocked;
        return unlocked;
    }

    unlockOnce(flag, condition, message) {
        if (!condition || this.state.unlockFlags[flag]) {
            return false;
        }

        this.state.unlockFlags[flag] = true;
        this.pushMessage(message);
        return true;
    }

    pushMessage(message) {
        const prefix = `${String(this.messageIndex + 1).padStart(2, '0')}. `;
        this.messageIndex += 1;
        this.state.statusLog = [`${prefix}${message}`, ...this.state.statusLog].slice(0, ECONOMY.logLimit);
    }

    emitChange(change = {}) {
        if (this.onChange) {
            this.onChange(this.state, change);
        }
    }
}

function formatRejected(amount) {
    return `${amount} form${amount === 1 ? '' : 's'}`;
}
