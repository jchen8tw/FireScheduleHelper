// ── Tab handling ──
function openTab(tabName, clickedBtn) {
    document.querySelectorAll('.tabcontent').forEach(tc => tc.style.display = 'none');
    document.querySelectorAll('.tablinks').forEach(tl => tl.classList.remove('active'));
    document.getElementById(tabName).style.display = 'block';
    if (clickedBtn) clickedBtn.classList.add('active');
}

// ── Settings ──
const saveOptions = () => {
    chrome.storage.sync.set({
        enableReplace: document.getElementById('enableReplace').checked,
    }, () => {
        const s = document.getElementById('status');
        s.textContent = '設定已儲存。';
        setTimeout(() => { s.textContent = ''; }, 750);
    });
};

const restoreOptions = () => {
    chrome.storage.sync.get({ enableReplace: true }, (items) => {
        document.getElementById('enableReplace').checked = items.enableReplace;
    });
};

// ── Read Duty Schedule ──
const handleReadSchedule = () => {
    if (confirm("確定要讀取最新勤務表嗎？這將會更新上班人員名單，並【清空】現有的作戰編組！")) {
        chrome.storage.local.get(['pendingIdToNameMap', 'pendingOnDutyIds'], (data) => {
            if (!data.pendingIdToNameMap || Object.keys(data.pendingIdToNameMap).length === 0) {
                alert('找不到待讀取的勤務表資料，請確認您已在當日的勤務表頁面。');
                return;
            }
            chrome.storage.local.set({
                idToNameMap: data.pendingIdToNameMap,
                onDutyIds: data.pendingOnDutyIds || []
            }, () => {
                // Clear combat group
                chrome.storage.sync.set({
                    combatGroup: {},
                    customGroups: [],
                    slotCounts: { rest: 0, water: 0, custom: {} },
                    combatNotes: ''
                }, () => {
                    alert('讀取完成！上班人員名單已更新，作戰編組已清空。');
                    loadCombatGroupSummary(); // Refresh UI
                });
            });
        });
    }
};

// ── Combat Group Summary (Read-Only) ──
const ROLE_LABELS = {
    fire_user_id_a: '火警值班',
    attack_driver: '攻擊車 司機', attack_leader: '攻擊車 帶隊官',
    attack_nozzle: '攻擊車 瞄子手', attack_asst_nozzle: '攻擊車 副瞄子手',
    attack_search: '攻擊車 破壞搜救手',
    relay_driver: '中繼車 司機', relay_nozzle: '中繼車 瞄子手',
    ladder_driver: '雲梯車 司機',
    ambulance_driver: '救護車 司機', ambulance_emt: '救護車 救護技術員',
};

function loadCombatGroupSummary() {
    chrome.storage.sync.get(['combatGroup', 'customGroups'], (result) => {
        const container = document.getElementById('combatGroupSummary');
        const cg = result.combatGroup;
        if (!cg || Object.keys(cg).length === 0) {
            container.innerHTML = '<div class="empty-msg">尚無作戰編組資料。請點擊「編輯作戰編組」進行設定。</div>';
            return;
        }

        let html = '';

        // Fixed roles
        const groups = {
            '火警值班': ['fire_user_id_a'],
            '攻擊水箱車': ['attack_driver', 'attack_leader', 'attack_nozzle', 'attack_asst_nozzle', 'attack_search'],
            '中繼水箱車': ['relay_driver', 'relay_nozzle'],
            '雲梯車': ['ladder_driver'],
            '救護車': ['ambulance_driver', 'ambulance_emt'],
        };

        for (const [title, roles] of Object.entries(groups)) {
            const items = roles.filter(r => cg[r]).map(r =>
                `<span class="role">${ROLE_LABELS[r]?.split(' ').pop() || r}:</span> <span class="name">${cg[r].name}</span>`
            );
            if (items.length > 0) {
                html += `<div class="summary-group"><h4>${title}</h4><div class="summary-items">${items.join(' ｜ ')}</div></div>`;
            }
        }

        // Dynamic groups (rest, water, custom)
        const dynamicPrefixes = new Set();
        for (const key of Object.keys(cg)) {
            const match = key.match(/^(.+)_\d+$/);
            if (match && !Object.keys(ROLE_LABELS).includes(key)) {
                dynamicPrefixes.add(match[1]);
            }
        }

        const prefixLabels = { rest: '休息', water: '水源查察' };
        // Custom group titles
        const customTitles = {};
        if (result.customGroups) {
            result.customGroups.forEach(g => { customTitles[g.id] = g.title; });
        }

        dynamicPrefixes.forEach(prefix => {
            const names = Object.keys(cg)
                .filter(k => k.startsWith(prefix + '_'))
                .map(k => cg[k].name);
            if (names.length > 0) {
                const label = prefixLabels[prefix] || customTitles[prefix] || prefix;
                html += `<div class="summary-group"><h4>${label}</h4><div class="summary-items">${names.join('、')}</div></div>`;
            }
        });

        container.innerHTML = html || '<div class="empty-msg">尚無作戰編組資料。</div>';
    });
}

// ── Quick Fill ──
function handleQuickFill() {
    chrome.storage.sync.get(['combatGroup'], (result) => {
        const assignments = result.combatGroup;
        if (!assignments || Object.keys(assignments).length === 0) {
            alert('請先編排人員！');
            return;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            // Get notes from storage too
            chrome.storage.sync.get(['combatNotes'], (nr) => {
                chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['quick_fill.js'] }, () => {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "quickFill",
                        data: assignments,
                        notes: nr.combatNotes || ''
                    });
                });
            });
        });
    });
}

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
    restoreOptions();
    loadCombatGroupSummary();

    // Tabs
    document.querySelectorAll('.tablinks').forEach(btn => {
        btn.addEventListener('click', () => openTab(btn.dataset.tab, btn));
    });
    document.getElementById('defaultOpen')?.click();

    // Settings
    document.getElementById('save').addEventListener('click', saveOptions);
    const readBtn = document.getElementById('readScheduleBtn');
    if (readBtn) readBtn.addEventListener('click', handleReadSchedule);

    // Combat Group buttons
    document.getElementById('quickFillBtn').addEventListener('click', handleQuickFill);
    document.getElementById('editCombatGroupBtn').addEventListener('click', () => {
        const editorUrl = chrome.runtime.getURL('editor.html');
        chrome.tabs.query({ url: editorUrl }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { active: true });
                chrome.windows.update(tabs[0].windowId, { focused: true });
            } else {
                chrome.tabs.create({ url: editorUrl });
            }
        });
    });
});
