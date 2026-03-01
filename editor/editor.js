// editor.js — Full Combat Group Editor
(function () {
    'use strict';

    let allPersonnel = {};   // { id: name } — on-duty only
    let assignedIds = new Set(); // IDs currently in slots

    // ══════════════════════════════════════════════
    // DATA LOADING
    // ══════════════════════════════════════════════

    function init() {
        chrome.storage.local.get(['idToNameMap', 'onDutyIds'], (local) => {
            const map = local.idToNameMap || {};
            const onDuty = local.onDutyIds || [];

            if (onDuty.length > 0) {
                // Only show on-duty personnel
                onDuty.forEach(id => {
                    if (map[id]) allPersonnel[id] = map[id];
                });
            } else {
                // Fallback: show everyone
                Object.assign(allPersonnel, map);
            }

            loadCombatGroup(() => {
                renderPersonnelList();
                setupDropZones();
                setupSearch();
                setupAddSlotButtons();
                setupCustomGroupButton();
            });
        });
    }

    function loadCombatGroup(callback) {
        chrome.storage.sync.get(['combatGroup', 'customGroups', 'slotCounts'], (result) => {
            // 1. Restore Custom Groups
            if (result.customGroups) {
                result.customGroups.forEach(g => createCustomGroup(g.id, g.title));
            }

            // 2. Restore Dynamic Slots
            if (result.slotCounts) {
                restoreDynamic('#restGroup .slot-container', 'rest', result.slotCounts.rest || 0);
                restoreDynamic('#waterGroup .slot-container', 'water', result.slotCounts.water || 0);
                if (result.slotCounts.custom) {
                    for (const [gid, count] of Object.entries(result.slotCounts.custom)) {
                        restoreDynamic(`#${gid} .slot-container`, gid, count);
                    }
                }
            }

            // 3. Fill Assignments
            if (result.combatGroup) {
                document.querySelectorAll('.slot').forEach(slot => {
                    const a = result.combatGroup[slot.dataset.role];
                    if (a) {
                        fillSlot(slot, a, false); // don't save during load
                    }
                });
                generateNotes();
            }

            if (callback) callback();
        });
    }

    function restoreDynamic(sel, prefix, count) {
        const container = document.querySelector(sel);
        if (!container) return;
        for (let i = container.querySelectorAll('.slot').length; i < count; i++) {
            createSlotElement(container, prefix, i);
        }
    }

    // ══════════════════════════════════════════════
    // PERSONNEL LIST
    // ══════════════════════════════════════════════

    function renderPersonnelList() {
        const container = document.getElementById('personnelList');
        container.innerHTML = '';

        const sorted = Object.entries(allPersonnel).sort((a, b) => {
            const na = parseInt(a[0].replace(/\D/g, '')) || 0;
            const nb = parseInt(b[0].replace(/\D/g, '')) || 0;
            return na - nb;
        });

        if (sorted.length === 0) {
            container.innerHTML = '<div style="color:#999;font-size:13px;padding:8px;">尚未讀取到人員。請先開啟勤務表頁面。</div>';
            return;
        }

        sorted.forEach(([id, name]) => {
            const div = document.createElement('div');
            div.className = 'personnel-item';
            if (assignedIds.has(id)) div.classList.add('hidden');
            div.textContent = `${id} ${name}`;
            div.draggable = true;
            div.dataset.id = id;
            div.dataset.name = name;
            div.dataset.source = 'personnel'; // mark source

            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ id, name, source: 'personnel' }));
                e.dataTransfer.effectAllowed = 'move';
                div.classList.add('dragging');
            });
            div.addEventListener('dragend', () => div.classList.remove('dragging'));

            container.appendChild(div);
        });
    }

    function hidePersonnel(id) {
        assignedIds.add(id);
        const item = document.querySelector(`.personnel-item[data-id="${id}"]`);
        if (item) item.classList.add('hidden');
    }

    function showPersonnel(id) {
        assignedIds.delete(id);
        const item = document.querySelector(`.personnel-item[data-id="${id}"]`);
        if (item) item.classList.remove('hidden');
    }

    function setupSearch() {
        document.getElementById('searchBox').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('.personnel-item').forEach(item => {
                const matchesSearch = item.textContent.toLowerCase().includes(term);
                const isAssigned = assignedIds.has(item.dataset.id);
                item.classList.toggle('hidden', !matchesSearch || isAssigned);
            });
        });
    }

    // ══════════════════════════════════════════════
    // SLOT MANAGEMENT
    // ══════════════════════════════════════════════

    function fillSlot(slot, data, shouldSave = true) {
        const label = slot.querySelector('.slot-label')?.textContent || '';
        const deleteBtn = slot.querySelector('.delete-slot-btn');
        const deleteBtnHtml = deleteBtn ? '<button class="delete-slot-btn">×</button>' : '';

        slot.innerHTML = `<span class="slot-label">${label}</span>
            <div class="chip" draggable="true" data-id="${data.id}" data-name="${data.name}" data-source="slot" data-role="${slot.dataset.role}">
                ${data.id} ${data.name}
                <span class="remove-btn">&times;</span>
            </div>${deleteBtnHtml}`;

        slot.dataset.assignedId = data.id;
        slot.dataset.assignedName = data.name;

        hidePersonnel(data.id);

        // Chip remove button
        slot.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            clearSlot(slot);
            saveCombatGroup();
        });

        // Chip drag (for slot-to-slot)
        const chip = slot.querySelector('.chip');
        chip.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify({
                id: data.id, name: data.name, source: 'slot', fromRole: slot.dataset.role
            }));
            e.dataTransfer.effectAllowed = 'move';
            e.stopPropagation();
        });

        // Re-attach slot delete button if dynamic
        if (deleteBtn || slot.closest('[data-prefix]')) {
            attachSlotDeleteBtn(slot);
        }

        if (shouldSave) saveCombatGroup();
    }

    function clearSlot(slot) {
        const id = slot.dataset.assignedId;
        const label = slot.querySelector('.slot-label')?.textContent || '';

        // Check if it's a dynamic slot (has delete button)
        const isDynamic = !!slot.closest('[data-prefix]');
        const deleteBtnHtml = isDynamic ? '<button class="delete-slot-btn">×</button>' : '';

        slot.innerHTML = `<span class="slot-label">${label}</span>${deleteBtnHtml}`;
        delete slot.dataset.assignedId;
        delete slot.dataset.assignedName;

        if (id) showPersonnel(id);

        if (isDynamic) attachSlotDeleteBtn(slot);
    }

    // ══════════════════════════════════════════════
    // DRAG & DROP (with swap support)
    // ══════════════════════════════════════════════

    function setupDropZones() {
        document.querySelectorAll('.slot').forEach(slot => setupDropZone(slot));
    }

    function setupDropZone(slot) {
        slot.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            slot.classList.add('drag-over');
        });

        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));

        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            slot.classList.remove('drag-over');

            let data;
            try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }

            const targetHasOccupant = !!slot.dataset.assignedId;
            const targetOccupant = targetHasOccupant ? { id: slot.dataset.assignedId, name: slot.dataset.assignedName } : null;

            if (data.source === 'slot') {
                // Slot-to-slot: either move or swap
                const fromSlot = document.querySelector(`.slot[data-role="${data.fromRole}"]`);
                if (!fromSlot || fromSlot === slot) return;

                // Clear source slot first
                clearSlot(fromSlot);

                if (targetHasOccupant) {
                    // Swap: put target occupant into source slot
                    clearSlot(slot);
                    fillSlot(fromSlot, targetOccupant);
                }

                fillSlot(slot, { id: data.id, name: data.name });
            } else {
                // Personnel → slot
                if (targetHasOccupant) {
                    // Replace: return existing to list
                    clearSlot(slot);
                }
                fillSlot(slot, { id: data.id, name: data.name });
            }
        });
    }

    // ══════════════════════════════════════════════
    // DYNAMIC SLOTS (Rest, Water, Custom)
    // ══════════════════════════════════════════════

    function createSlotElement(container, prefix, index) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.role = `${prefix}_${index}`;
        slot.innerHTML = `<span class="slot-label"></span><button class="delete-slot-btn">×</button>`;

        const btn = container.querySelector('.add-slot-btn');
        container.insertBefore(slot, btn);
        setupDropZone(slot);
        attachSlotDeleteBtn(slot);
    }

    function attachSlotDeleteBtn(slot) {
        const btn = slot.querySelector('.delete-slot-btn');
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (slot.dataset.assignedId) showPersonnel(slot.dataset.assignedId);
            slot.remove();
            saveCombatGroup();
        });
    }

    function setupAddSlotButtons() {
        document.querySelectorAll('.add-slot-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const prefix = this.dataset.prefix;
                const container = this.parentElement;
                const count = container.querySelectorAll('.slot').length;
                createSlotElement(container, prefix, count);
                saveCombatGroup();
            });
        });
    }

    // ══════════════════════════════════════════════
    // CUSTOM GROUPS
    // ══════════════════════════════════════════════

    function setupCustomGroupButton() {
        document.getElementById('addCustomGroupBtn').addEventListener('click', () => {
            const id = 'custom_' + Date.now();
            createCustomGroup(id, '新增欄位');
            saveCombatGroup();
        });
    }

    function createCustomGroup(id, title) {
        const area = document.getElementById('customGroupsArea');
        const div = document.createElement('div');
        div.className = 'vehicle-group custom-group';
        div.id = id;

        div.innerHTML = `
            <div class="vehicle-title">
                <input type="text" class="custom-title-input" value="${title}">
                <button class="delete-group-btn">×</button>
            </div>
            <div class="slot-container" data-prefix="${id}">
                <button class="add-slot-btn" data-prefix="${id}">+</button>
            </div>
        `;

        area.appendChild(div);

        div.querySelector('.custom-title-input').addEventListener('change', () => saveCombatGroup());
        div.querySelector('.delete-group-btn').addEventListener('click', () => {
            // Return all assigned personnel
            div.querySelectorAll('.slot').forEach(slot => {
                if (slot.dataset.assignedId) showPersonnel(slot.dataset.assignedId);
            });
            div.remove();
            saveCombatGroup();
        });
        div.querySelector('.add-slot-btn').addEventListener('click', function () {
            const prefix = this.dataset.prefix;
            const container = this.parentElement;
            const count = container.querySelectorAll('.slot').length;
            createSlotElement(container, prefix, count);
            saveCombatGroup();
        });
    }

    // ══════════════════════════════════════════════
    // SAVE / NOTES
    // ══════════════════════════════════════════════

    function saveCombatGroup() {
        const assignments = {};
        document.querySelectorAll('.slot').forEach(slot => {
            if (slot.dataset.assignedId) {
                assignments[slot.dataset.role] = { id: slot.dataset.assignedId, name: slot.dataset.assignedName };
            }
        });

        const customGroups = [];
        document.querySelectorAll('.custom-group').forEach(g => {
            customGroups.push({ id: g.id, title: g.querySelector('.custom-title-input').value });
        });

        const slotCounts = {
            rest: document.querySelectorAll('#restGroup .slot').length,
            water: document.querySelectorAll('#waterGroup .slot').length,
            custom: {}
        };
        customGroups.forEach(g => {
            slotCounts.custom[g.id] = document.querySelectorAll(`#${g.id} .slot`).length;
        });

        generateNotes();
        const notes = document.getElementById('notesPreview').value;

        chrome.storage.sync.set({ combatGroup: assignments, customGroups, slotCounts, combatNotes: notes }, () => {
            const s = document.getElementById('saveStatus');
            s.textContent = '已儲存 ✓';
            setTimeout(() => { s.textContent = '自動儲存中'; }, 1500);
        });
    }

    function generateNotes() {
        const notes = [];

        const getNames = (groupId) => {
            const names = [];
            const container = document.querySelector(`#${groupId} .slot-container`);
            if (container) {
                container.querySelectorAll('.slot').forEach(slot => {
                    if (slot.dataset.assignedName) names.push(slot.dataset.assignedName);
                });
            }
            return names;
        };

        const restNames = getNames('restGroup');
        if (restNames.length) notes.push(`休息:${restNames.join('、')}`);

        const waterNames = getNames('waterGroup');
        if (waterNames.length) notes.push(`水源查察:${waterNames.join('、')}`);

        document.querySelectorAll('.custom-group').forEach(group => {
            const title = group.querySelector('.custom-title-input').value;
            const names = getNames(group.id);
            if (names.length) notes.push(`${title}:${names.join('、')}`);
        });

        document.getElementById('notesPreview').value = notes.join('\n');
    }

    // ══════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', init);
})();
