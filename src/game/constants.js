export const SAVE_KEY = 'bureaucracy-tycoon-save-v1';

export const ECONOMY = {
    startingMoney: 0,
    startingPendingForms: 3,
    startingCapacity: 14,
    startingMoneyPerForm: 1,
    startingMoneyMultiplier: 1,
    startingArrivalRate: 1.2,
    startingAutoProcessRate: 0,
    manualProcessAmount: 1,
    approvalLayerBonus: 0.22,
    passiveSaveSeconds: 5,
    tickRateMs: 100,
    logLimit: 4,
};

export const UPGRADE_DEFINITIONS = {
    betterInk: {
        id: 'betterInk',
        title: 'Better Ink',
        description: '+1 money per processed form',
        baseCost: 12,
        costScale: 1.5,
    },
    largerInbox: {
        id: 'largerInbox',
        title: 'Larger Inbox',
        description: '+8 queue capacity',
        baseCost: 24,
        costScale: 1.58,
    },
    juniorClerk: {
        id: 'juniorClerk',
        title: 'Junior Clerk',
        description: '+1 auto-process per second',
        baseCost: 36,
        costScale: 1.68,
    },
    marketingCampaign: {
        id: 'marketingCampaign',
        title: 'Marketing Campaign',
        description: '+0.75 forms per second',
        baseCost: 30,
        costScale: 1.62,
    },
    complianceDesk: {
        id: 'complianceDesk',
        title: 'Compliance Desk',
        description: '+25% money multiplier',
        baseCost: 68,
        costScale: 1.8,
    },
    approvalLayer: {
        id: 'approvalLayer',
        title: 'Approval Layer',
        description: 'Increase bureaucracy level and boost all scaling',
        baseCost: 120,
        costScale: 2.05,
    },
};

export const STATUS_MESSAGES = {
    arrival: [
        'Form returned for missing signature.',
        'Citizen redirected to Auxiliary Review.',
        'Inbox tray bends under procedural pressure.',
        'Courier adds another folder to the national backlog.',
    ],
    automation: [
        'Clerk promoted to Senior Delay Associate.',
        'A memo confirms the memo about processing.',
        'Auto-stamping proceeds after committee hesitation.',
    ],
    growth: [
        'New approval layer added.',
        'A subcommittee has been formed to monitor throughput.',
        'Efficiency report misplaced in triplicate.',
        'Department renamed for strategic confusion.',
    ],
    unlocked: [
        'Citizens now take numbered tickets.',
        'Break room rumors predict further expansion.',
        'Someone found the ceremonial stamp pad.',
    ],
};
