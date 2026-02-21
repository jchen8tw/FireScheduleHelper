// quick_fill.js — fills the 作戰編組.html form
(function () {
    if (window.quickFillListenerAdded) return;
    window.quickFillListenerAdded = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "quickFill") {
            fillForm(request.data, request.notes);
        }
    });

    function fillForm(assignments, notes) {
        console.log("Quick Fill: starting with", assignments);



        // ── Pre-process vehicle patterns ──
        let countRelay = 0;
        if (assignments.relay_driver) countRelay++;
        if (assignments.relay_nozzle) countRelay++;

        let countLadder = 0;
        if (assignments.ladder_driver) countLadder++;

        // 4-0-0-2 / 5-0-0-2: Copy attack → relay AND ladder (by position order)
        if (countRelay === 0 && countLadder === 0) {
            console.log("Pattern: X-0-0-2 — copying attack to relay & ladder");
            // Position 1: Driver
            if (assignments.attack_driver) {
                assignments.relay_driver = assignments.attack_driver;
                assignments.ladder_driver = assignments.attack_driver;
            }
            // Position 2: Leader (attack 帶隊官 → ladder 帶隊官)
            if (assignments.attack_leader) {
                assignments.relay_leader = assignments.attack_leader;
                assignments.ladder_leader = assignments.attack_leader;
            }
            // Position 3: Nozzle → relay 瞄子手, ladder 隨員
            if (assignments.attack_nozzle) {
                assignments.relay_nozzle = assignments.attack_nozzle;
                assignments.ladder_attendant = assignments.attack_nozzle;
            }
            // Position 4: Asst Nozzle → ladder 助手
            if (assignments.attack_asst_nozzle) {
                assignments.relay_asst_nozzle = assignments.attack_asst_nozzle;
                assignments.ladder_asst = assignments.attack_asst_nozzle;
            }
            // Position 5: Search → skip for ladder
            if (assignments.attack_search) {
                assignments.relay_search = assignments.attack_search;
            }
        }
        // X-1-0-2 / X-0-1-2: single shared driver
        else if ((countRelay <= 1 && countLadder === 0) || (countLadder === 1 && countRelay === 0)) {
            console.log("Pattern: shared single driver for relay/ladder");
            const driver = assignments.relay_driver || assignments.ladder_driver;
            if (driver) {
                assignments.relay_driver = driver;
                assignments.ladder_driver = driver;
            }
        }

        // ── Role → Form Field Map ──
        const roleMap = {
            'attack_driver': { attr: '攻擊水箱車', role: '司機' },
            'attack_leader': { attr: '攻擊水箱車', role: '帶隊官' },
            'attack_nozzle': { attr: '攻擊水箱車', role: '瞄子手' },
            'attack_asst_nozzle': { attr: '攻擊水箱車', role: '副瞄子手' },
            'attack_search': { attr: '攻擊水箱車', role: '搜救手' },

            'relay_driver': { attr: '中繼水箱車', role: '司機' },
            'relay_leader': { attr: '中繼水箱車', role: '帶隊官' },
            'relay_nozzle': { attr: '中繼水箱車', role: '瞄子手' },
            'relay_asst_nozzle': { attr: '中繼水箱車', role: '副瞄子手' },
            'relay_search': { attr: '中繼水箱車', role: '搜救手' },

            'ladder_driver': { attr: '雲梯車', role: '司機' },
            'ladder_leader': { attr: '雲梯車', role: '帶隊官' },
            'ladder_attendant': { attr: '雲梯車', role: '隨員' },
            'ladder_asst': { attr: '雲梯車', role: '助手' },

            'ambulance_driver': { attr: '一般型救護車', role: '司機' },
            'ambulance_emt': { attr: '一般型救護車', role: '救護技術員1' },
        };

        const errors = [];

        // ── Clear Call Signs (呼號) ──
        const radioNos = document.querySelectorAll('input[name="radio_no[]"]');
        radioNos.forEach(input => {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // ── Clear Radio IDs ──
        const radioSelects = document.querySelectorAll('select[multiple][name^="radio_pttid"]');
        radioSelects.forEach(select => {
            Array.from(select.options).forEach(opt => opt.selected = false);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // ── Reset all single-select dropdowns to first option ("請選擇") ──
        document.querySelectorAll('select:not([multiple])').forEach(select => {
            select.selectedIndex = 0;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });


        // ── Clear remarks ──
        const remarkArea = document.getElementById('remark');
        remarkArea.value = '';


        // ── Fire Watch ──
        if (assignments.fire_user_id_a) {
            const select = document.querySelector('select[name="fire_user_id_a"]');
            if (select) {
                if (!selectOption(select, assignments.fire_user_id_a)) {
                    errors.push(`火警值班: 找不到 ${assignments.fire_user_id_a.name}`);
                }
            }
        }

        // ── Vehicle Form Fields ──
        // Track which roleMap keys have been filled to handle duplicates
        const filledKeys = new Set();
        const carAttrMap = {};

        const rows = document.querySelectorAll('tr');
        rows.forEach(row => {
            const carInput = row.querySelector('input[name="car_no[]"]');
            if (!carInput) return;
            const carNo = carInput.value;

            const userSelect = row.querySelector('select[name="user_id_a[]"]');
            if (!userSelect) return;

            // Find role and attribute text: it's in one of the sibling tds
            const tds = row.querySelectorAll('td');
            let rowText = '';
            let foundRoles = new Set();

            tds.forEach(td => {
                const t = td.innerText.trim();
                rowText += ' ' + t;

                if (t === '副瞄子手') foundRoles.add('副瞄子手');
                else if (t === '瞄子手') foundRoles.add('瞄子手');
                else if (t === '司機') foundRoles.add('司機');
                else if (t === '帶隊官') foundRoles.add('帶隊官');
                else if (t === '隨員') foundRoles.add('隨員');
                else if (t === '助手') foundRoles.add('助手');
                else if (t === '救護技術員1') foundRoles.add('救護技術員1');
                else if (t.includes('搜救手')) foundRoles.add('搜救手');
            });

            // Memorize the car attribute for this car_no if it appears in the current row's text
            for (const attr of ['攻擊水箱車', '中繼水箱車', '雲梯車', '一般型救護車']) {
                if (rowText.includes(attr)) {
                    carAttrMap[carNo] = attr;
                }
            }

            for (const [key, mapping] of Object.entries(roleMap)) {
                if (filledKeys.has(key)) continue;

                const hasAttr = rowText.includes(mapping.attr) || carAttrMap[carNo] === mapping.attr;
                if (hasAttr && foundRoles.has(mapping.role)) {
                    if (assignments[key]) {
                        if (!selectOption(userSelect, assignments[key])) {
                            errors.push(`${mapping.attr} ${mapping.role}: 找不到 ${assignments[key].name}`);
                        } else {
                            if (mapping.role === '帶隊官') {
                                const radioNoInput = row.querySelector('input[name="radio_no[]"]');
                                if (radioNoInput) {
                                    radioNoInput.value = '02';
                                    radioNoInput.dispatchEvent(new Event('input', { bubbles: true }));
                                    radioNoInput.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            }
                        }
                        filledKeys.add(key);
                        break; // one key per row
                    }
                }
            }
        });

        // ── Remarks ──
        if (notes) {
            remarkArea.value = notes;
        }

        if (errors.length > 0) {
            alert("快速填入遇到錯誤，已終止：\n" + errors.join("\n"));
        } else {
            alert("快速填寫完成！");
        }
    }

    function selectOption(select, person) {
        if (!person || !person.name) return false;
        const targetName = person.name.trim();

        for (let i = 0; i < select.options.length; i++) {
            const text = select.options[i].text;
            // Match if the option text contains the person's name
            if (text.includes(targetName)) {
                select.selectedIndex = i;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
        return false;
    }
})();
