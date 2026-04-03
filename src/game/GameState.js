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
        this.arrivalBuffer = 0;
        this.autoProcessBuffer = 0;
        this.messageIndex = 0;
        this.state = this.createDefaultState();
    }

    createDefaultState() {
        return {
            money: ECONOMY.startingMoney,
            pendingForms: ECONOMY.startingPendingForms,
            processedFormsLifetime: 0,
            bureaucracyLevel: 1,
            upgrades: {
                betterInk: 0,
                largerInbox: 0,
                juniorClerk: 0,
                marketingCampaign: 0,
                complianceDesk: 0,
                approvalLayer: 0,
            },
            statusLog: ['Office opened. Initial backlog remains purely aspirational.'],
            unlockFlags: {},
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
            this.arrivalBuffer = 0;
            this.autoProcessBuffer = 0;
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
        this.arrivalBuffer = 0;
        this.autoProcessBuffer = 0;
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
        return Math.floor(definition.baseCost * Math.pow(definition.costScale, level));
    }

    getStats() {
        const betterInk = this.getUpgradeLevel('betterInk');
        const largerInbox = this.getUpgradeLevel('largerInbox');
        const juniorClerk = this.getUpgradeLevel('juniorClerk');
        const marketingCampaign = this.getUpgradeLevel('marketingCampaign');
        const complianceDesk = this.getUpgradeLevel('complianceDesk');
        const approvalLayersBought = this.getUpgradeLevel('approvalLayer');
        const approvalMultiplier = 1 + (approvalLayersBought * ECONOMY.approvalLayerBonus);

        // Approval layers are the main higher-tier growth lever in the MVP.
        // They gently amplify every major rate without needing extra systems.
        return {
            queueCapacity: ECONOMY.startingCapacity + (largerInbox * 8),
            arrivalRate: (ECONOMY.startingArrivalRate + (marketingCampaign * 0.75)) * approvalMultiplier,
            autoProcessRate: (ECONOMY.startingAutoProcessRate + juniorClerk) * approvalMultiplier,
            moneyPerForm: ECONOMY.startingMoneyPerForm + betterInk,
            moneyMultiplier: (ECONOMY.startingMoneyMultiplier + (complianceDesk * 0.25)) * approvalMultiplier,
            approvalMultiplier,
        };
    }

    tick(deltaSeconds) {
        const stats = this.getStats();
        let changedResources = false;
        let changedQueue = false;
        let changedLog = false;

        // Fractional rates build up in buffers so the simulation can stay smooth
        // while the game still behaves in whole-form steps.
        this.arrivalBuffer += stats.arrivalRate * deltaSeconds;
        const formsToAdd = Math.floor(this.arrivalBuffer);

        if (formsToAdd > 0) {
            this.arrivalBuffer -= formsToAdd;
            const result = this.addPendingForms(formsToAdd, { silent: true });
            changedQueue = changedQueue || result.changedQueue;
            changedLog = changedLog || result.changedLog;
        }

        this.autoProcessBuffer += stats.autoProcessRate * deltaSeconds;
        const formsToProcess = Math.floor(this.autoProcessBuffer);

        if (formsToProcess > 0) {
            this.autoProcessBuffer -= formsToProcess;
            const result = this.processForms(formsToProcess, 'automation', { silent: true });
            changedResources = changedResources || result.changedResources;
            changedQueue = changedQueue || result.changedQueue;
            changedLog = changedLog || result.changedLog;
        }

        changedLog = this.checkUnlocks() || changedLog;

        // Batch tick-side mutations into a single change notification so
        // automation and form generation don't trigger multiple UI passes.
        if (changedResources || changedQueue || changedLog) {
            this.emitChange({
                resources: changedResources,
                stats: changedResources,
                queue: changedQueue,
                log: changedLog,
            });
        }
    }

    addPendingForms(amount, options = {}) {
        const stats = this.getStats();
        const previous = this.state.pendingForms;
        const next = clamp(previous + amount, 0, stats.queueCapacity);
        const accepted = next - previous;
        let changedLog = false;

        this.state.pendingForms = next;

        if (accepted > 0 && Math.random() < 0.22) {
            this.pushMessage(pickRandom(STATUS_MESSAGES.arrival));
            changedLog = true;
        }

        if (!options.silent && (accepted > 0 || changedLog)) {
            this.emitChange({
                resources: false,
                stats: false,
                queue: accepted > 0,
                log: changedLog,
            });
        }

        return {
            changedQueue: accepted > 0,
            changedLog,
        };
    }

    processOneManualForm() {
        return this.processForms(ECONOMY.manualProcessAmount, 'manual');
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

        if (source === 'automation' && Math.random() < 0.14) {
            this.pushMessage(pickRandom(STATUS_MESSAGES.automation));
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

    checkUnlocks() {
        let unlocked = false;
        const processed = this.state.processedFormsLifetime;
        const money = this.state.money;

        unlocked = this.unlockOnce('forms-10', processed >= 10, 'Ten forms processed. The office now recognizes momentum.') || unlocked;
        unlocked = this.unlockOnce('money-100', money >= 100, 'Budget surplus detected. Additional clipboards authorized.') || unlocked;
        unlocked = this.unlockOnce('bureaucracy-3', this.state.bureaucracyLevel >= 3, pickRandom(STATUS_MESSAGES.unlocked)) || unlocked;
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
