const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const store = {
    cases: new Map(),
    tokenToCase: new Map(),
    deviceToCase: new Map(),
    caseEvents: [],
    caseNotes: [],
    missionRoutes: new Map(),
    missionPhases: new Map(),
    geofences: new Map(),
    coLocationEvents: [],
    operatorSessions: new Map(),
    visitHistory: [],
    shareLinks: new Map(),
    riskSnapshots: {},
    anomalyRules: { global: {}, by_case: {} },
    caseBriefings: {},
    routineZones: {},
    mediaRecords: [],
    watchZones: new Map(),
    watchZoneExternal: new Map()
};

function serialize() {
    return {
        cases: Array.from(store.cases.entries()),
        tokenToCase: Array.from(store.tokenToCase.entries()),
        deviceToCase: Array.from(store.deviceToCase.entries()),
        caseEvents: store.caseEvents.slice(-3000),
        caseNotes: store.caseNotes,
        missionRoutes: Array.from(store.missionRoutes.entries()),
        missionPhases: Array.from(store.missionPhases.entries()),
        geofences: Array.from(store.geofences.entries()),
        coLocationEvents: store.coLocationEvents.slice(-500),
        operatorSessions: Array.from(store.operatorSessions.entries()),
        visitHistory: store.visitHistory || [],
        shareLinks: Array.from((store.shareLinks || new Map()).entries()),
        riskSnapshots: store.riskSnapshots || {},
        anomalyRules: store.anomalyRules || { global: {}, by_case: {} },
        caseBriefings: store.caseBriefings || {},
        routineZones: store.routineZones || {},
        mediaRecords: (store.mediaRecords || []).slice(-2000),
        watchZones: Array.from((store.watchZones || new Map()).entries()),
        watchZoneExternal: Array.from((store.watchZoneExternal || new Map()).entries())
    };
}

function hydrate(data) {
    if (!data) return;
    store.cases = new Map(data.cases || []);
    store.tokenToCase = new Map(data.tokenToCase || []);
    store.deviceToCase = new Map(data.deviceToCase || []);
    store.caseEvents = data.caseEvents || [];
    store.caseNotes = data.caseNotes || [];
    store.missionRoutes = new Map(data.missionRoutes || []);
    store.missionPhases = new Map(data.missionPhases || []);
    store.geofences = new Map(data.geofences || []);
    store.coLocationEvents = data.coLocationEvents || [];
    store.operatorSessions = new Map(data.operatorSessions || []);
    store.visitHistory = data.visitHistory || [];
    store.shareLinks = new Map(data.shareLinks || []);
    store.riskSnapshots = data.riskSnapshots || {};
    store.anomalyRules = data.anomalyRules || { global: {}, by_case: {} };
    store.caseBriefings = data.caseBriefings || {};
    store.routineZones = data.routineZones || {};
    store.mediaRecords = data.mediaRecords || [];
    store.watchZones = new Map(data.watchZones || []);
    store.watchZoneExternal = new Map(data.watchZoneExternal || []);
}

function persist() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_FILE, JSON.stringify(serialize(), null, 0), 'utf8');
    } catch (err) {
        console.warn('Store persist failed:', err.message);
    }
}

function loadStore() {
    try {
        if (fs.existsSync(STORE_FILE)) {
            hydrate(JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')));
            console.log(`📦 Store loaded: ${store.cases.size} cases`);
        }
    } catch (err) {
        console.warn('Store load failed:', err.message);
    }
}

loadStore();

module.exports = { store, persist, loadStore };
