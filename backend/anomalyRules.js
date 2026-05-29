const { store, persist } = require('./store');

const DEFAULT_RULES = {
    speed_limit_kmh: 80,
    teleport_distance_m: 3000,
    teleport_max_seconds: 90,
    accuracy_max_m: 250
};

function ensureRules() {
    if (!store.anomalyRules) {
        store.anomalyRules = { global: { ...DEFAULT_RULES }, by_case: {} };
    }
    if (!store.anomalyRules.global) {
        store.anomalyRules.global = { ...DEFAULT_RULES };
    }
    if (!store.anomalyRules.by_case) {
        store.anomalyRules.by_case = {};
    }
}

function getRulesForCase(caseId) {
    ensureRules();
    const global = { ...DEFAULT_RULES, ...store.anomalyRules.global };
    if (!caseId) return global;
    const perCase = store.anomalyRules.by_case[caseId] || {};
    return { ...global, ...perCase };
}

function setGlobalRules(rules) {
    ensureRules();
    store.anomalyRules.global = { ...store.anomalyRules.global, ...rules };
    persist();
    return store.anomalyRules.global;
}

function setCaseRules(caseId, rules) {
    ensureRules();
    store.anomalyRules.by_case[caseId] = {
        ...(store.anomalyRules.by_case[caseId] || {}),
        ...rules
    };
    persist();
    return store.anomalyRules.by_case[caseId];
}

function getAllRules() {
    ensureRules();
    return {
        global: { ...DEFAULT_RULES, ...store.anomalyRules.global },
        by_case: store.anomalyRules.by_case
    };
}

module.exports = {
    DEFAULT_RULES,
    getRulesForCase,
    setGlobalRules,
    setCaseRules,
    getAllRules
};
