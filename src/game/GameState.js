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
                bulkFiling: 0,
                overtimeProgram: 0,
                federalSubsidy: 0,
            },
            statusLog: ['Office opened. Initial backlog remains purely aspirational.'],
            unlockFlags: {},
            overflowActive: false,
            rushMode: false,
            currentContract: null,
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
            this.checkTierUnlocks();
            this.checkUpgradeUnlocks();
            if (!this.state.currentContract) {
                this.assignNextContract();
            }
            this.pushMessage('Archived files recovered from local storage.');
            this.emitChange({
                resources: true,
                stats: true,
                queue: true,
                upgrades: true,
                contract: true,
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
        this.assignNextContract();
        this.pushMessage('All records shredded. Fresh paperwork incoming.');
        this.emitChange({
            resources: true,
            stats: true,
            queue: true,
            upgrades: true,
            contract: true,
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
        const bulkFiling = this.getUpgradeLevel('bulkFiling');
        const overtimeProgram = this.getUpgradeLevel('overtimeProgram');
        const federalSubsidy = this.getUpgradeLevel('federalSubsidy');
        const approvalMultiplier = 1 + (approvalLayersBought * ECONOMY.approvalLayerBonus);
        const efficiencyMultiplier = 1 + (efficiencyOffice * 0.15);
        const queueCapacity = ECONOMY.startingCapacity + (largerInbox * 8);
        const queueRatio = queueCapacity > 0 ? this.state.pendingForms / queueCapacity : 0;
        const overflowActive = this.state.pendingForms >= queueCapacity;
        const rushMultiplier = this.state.rushMode ? 1.4 : 1;
        const rushPayoutMultiplier = this.state.rushMode ? 1.25 : 1;
        const overtimeMultiplier = overtimeProgram > 0 ? 2 : 1;
        const subsidyMultiplier = federalSubsidy > 0 ? 2 : 1;
        const autoProcessRate = (((ECONOMY.startingAutoProcessRate + juniorClerk + (seniorClerk * 2)) * approvalMultiplier) * efficiencyMultiplier) * overtimeMultiplier;
        const moneyPerForm = ECONOMY.startingMoneyPerForm + betterInk;
        const moneyMultiplier = ((((ECONOMY.startingMoneyMultiplier + (complianceDesk * 0.25)) * approvalMultiplier) * efficiencyMultiplier) * rushPayoutMultiplier) * subsidyMultiplier;

        // Approval layers are the main higher-tier growth lever in the MVP.
        // They gently amplify every major rate without needing extra systems.
        return {
            queueCapacity,
            queueRatio,
            overflowActive,
            arrivalRate: ((ECONOMY.startingArrivalRate + (marketingCampaign * 0.75)) * approvalMultiplier) * rushMultiplier,
            autoProcessRate,
            moneyPerForm,
            moneyMultiplier,
            incomePerSecond: autoProcessRate * (moneyPerForm * moneyMultiplier),
            approvalMultiplier,
            efficiencyMultiplier,
            rushMode: this.state.rushMode,
            manualProcessAmount: ECONOMY.manualProcessAmount + expressWindow + doubleStamp + (bulkFiling * 3),
            surgeUnlocked: surgeProtocol > 0,
            surgeReady: surgeProtocol > 0 && queueRatio >= ECONOMY.surgeQueueThreshold,
            surgeProcessAmount: surgeProtocol > 0 ? ECONOMY.surgeProcessAmount : 0,
        };
    }

    getNextTierMilestone() {
        if (!this.isTierUnlocked('department')) {
            return {
                tier: 'department',
                label: 'Department',
                current: this.state.processedFormsLifetime,
                target: 30,
                suffix: 'processed',
            };
        }

        if (!this.isTierUnlocked('agency')) {
            return {
                tier: 'agency',
                label: 'Agency',
                current: this.state.money,
                target: 220,
                suffix: 'budget',
            };
        }

        return null;
    }

    getCurrentContract() {
        return this.state.currentContract;
    }

    isTierUnlocked(tier) {
        if (!tier || tier === 'office') {
            return true;
        }
        return !!this.state.unlockFlags[`tier-${tier}`];
    }

    isUpgradeUnlocked(id) {
        const definition = UPGRADE_DEFINITIONS[id];
        if (!definition) {
            return false;
        }
        if (!definition.unlockFlag) {
            return this.isTierUnlocked(definition.tier);
        }
        return this.isTierUnlocked(definition.tier) && !!this.state.unlockFlags[definition.unlockFlag];
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
        let changedContract = false;
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

        changedUpgrades = this.checkTierUnlocks() || changedUpgrades;
        changedUpgrades = this.checkUpgradeUnlocks() || changedUpgrades;
        const contractResult = this.updateContract(deltaSeconds, stats);
        changedResources = changedResources || contractResult.changedResources;
        changedContract = changedContract || contractResult.changedContract;
        changedLog = changedLog || contractResult.changedLog;
        changedLog = this.checkUnlocks() || changedLog;

        // Batch tick-side mutations into a single change notification so
        // automation and form generation don't trigger multiple UI passes.
        if (changedResources || changedQueue || changedUpgrades || changedContract || changedLog) {
            this.emitChange({
                resources: changedResources,
                stats: changedResources || changedQueue,
                queue: changedQueue,
                upgrades: changedUpgrades,
                contract: changedContract,
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

        this.checkTierUnlocks();
        this.checkUpgradeUnlocks();
        this.checkUnlocks();
        this.emitChange({
            resources: true,
            stats: true,
            queue: id === 'largerInbox',
            upgrades: true,
            contract: true,
            log: true,
        });
        return true;
    }

    toggleRushMode() {
        if (!this.isTierUnlocked('department')) {
            this.pushMessage('Rush directives unlock when the office expands into a department.');
            this.emitChange({ log: true });
            return false;
        }

        this.state.rushMode = !this.state.rushMode;
        this.pushMessage(this.state.rushMode
            ? 'Rush Mode enabled. Budget rises faster, but the inbox will strain sooner.'
            : 'Rush Mode disabled. Operations return to standard delay.');
        this.emitChange({
            resources: true,
            stats: true,
            contract: true,
            log: true,
        });
        return true;
    }

    updateContract(deltaSeconds, stats) {
        const contract = this.state.currentContract;
        if (!contract) {
            this.assignNextContract();
            return { changedResources: false, changedContract: true, changedLog: true };
        }

        let changedContract = false;
        let changedResources = false;
        let changedLog = false;

        if (contract.type === 'steady') {
            const nextProgress = stats.overflowActive ? 0 : Math.min(contract.target, contract.progress + deltaSeconds);
            if (Math.floor(nextProgress) !== Math.floor(contract.progress)) {
                changedContract = true;
            }
            contract.progress = nextProgress;
        }

        const progress = this.getContractProgress(contract, stats);
        if (progress >= contract.target) {
            this.state.money += contract.reward;
            this.pushMessage(`Contract complete. ${contract.rewardLabel} awarded immediately.`);
            this.assignNextContract();
            changedResources = true;
            changedContract = true;
            changedLog = true;
        }

        return { changedResources, changedContract, changedLog };
    }

    assignNextContract() {
        const stats = this.getStats();
        const processed = this.state.processedFormsLifetime;
        const availableTypes = ['process', 'earn'];

        if (processed >= 12) {
            availableTypes.push('steady');
        }
        if (stats.autoProcessRate >= 1) {
            availableTypes.push('auto');
        }

        const type = pickRandom(availableTypes);
        const contract = this.createContract(type, stats);
        this.state.currentContract = contract;
        this.pushMessage(`New contract issued: ${contract.shortLabel}.`);
        return contract;
    }

    createContract(type, stats) {
        if (type === 'earn') {
            const target = Math.max(18, Math.floor(18 + (this.state.processedFormsLifetime * 0.22)));
            const reward = Math.max(20, Math.floor(target * ECONOMY.contractBudgetRewardMultiplier));
            return {
                type,
                shortLabel: `Earn $${target}`,
                label: `Earn $${target} budget`,
                target,
                reward,
                rewardLabel: `$${reward} budget`,
                startValue: this.state.money,
            };
        }

        if (type === 'steady') {
            const target = 12 + (this.state.bureaucracyLevel * 3);
            const reward = 26 + (this.state.bureaucracyLevel * 8);
            return {
                type,
                shortLabel: `Avoid overflow for ${target}s`,
                label: `Avoid overflow for ${target}s`,
                target,
                reward,
                rewardLabel: `$${reward} budget`,
                progress: 0,
            };
        }

        if (type === 'auto') {
            const target = Math.max(2, Math.ceil(stats.autoProcessRate + 2));
            const reward = 32 + (target * 10);
            return {
                type,
                shortLabel: `Reach ${target} auto / s`,
                label: `Reach ${target} auto-process / s`,
                target,
                reward,
                rewardLabel: `$${reward} budget`,
            };
        }

        const target = Math.max(10, Math.floor(10 + (this.state.processedFormsLifetime * 0.25)));
        const reward = Math.max(16, Math.floor(target * ECONOMY.contractBudgetRewardMultiplier));
        return {
            type: 'process',
            shortLabel: `Process ${target} forms`,
            label: `Process ${target} forms`,
            target,
            reward,
            rewardLabel: `$${reward} budget`,
            startValue: this.state.processedFormsLifetime,
        };
    }

    getContractProgress(contract = this.state.currentContract, stats = this.getStats()) {
        if (!contract) {
            return 0;
        }

        if (contract.type === 'earn' || contract.type === 'process') {
            const sourceValue = contract.type === 'earn' ? this.state.money : this.state.processedFormsLifetime;
            return Math.max(0, sourceValue - (contract.startValue || 0));
        }

        if (contract.type === 'auto') {
            return stats.autoProcessRate;
        }

        return contract.progress || 0;
    }

    checkTierUnlocks() {
        let unlocked = false;

        unlocked = this.unlockOnce(
            'tier-department',
            this.state.processedFormsLifetime >= 30,
            'Department tier unlocked. New policies approved, including Rush Mode.'
        ) || unlocked;
        unlocked = this.unlockOnce(
            'tier-agency',
            this.state.money >= 220,
            'Agency tier unlocked. High-level directives and advanced upgrades are now available.'
        ) || unlocked;

        return unlocked;
    }

    checkUpgradeUnlocks() {
        let unlocked = false;

        unlocked = this.unlockUpgradeOnce('doubleStamp', this.state.processedFormsLifetime >= 20) || unlocked;
        unlocked = this.unlockUpgradeOnce('bulkFiling', this.state.processedFormsLifetime >= 45) || unlocked;
        unlocked = this.unlockUpgradeOnce('seniorClerk', this.state.processedFormsLifetime >= 75) || unlocked;
        unlocked = this.unlockUpgradeOnce('overtimeProgram', this.state.money >= 140) || unlocked;
        unlocked = this.unlockUpgradeOnce('surgeProtocol', this.state.bureaucracyLevel >= 3) || unlocked;
        unlocked = this.unlockUpgradeOnce('federalSubsidy', this.state.bureaucracyLevel >= 4) || unlocked;

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
