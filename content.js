(function () {
  "use strict";

  console.log("消防勤務易讀小幫手啟動中...");

  chrome.storage.sync.get(
    { enableReplace: true },
    (items) => {
      if (!items.enableReplace) {
        console.log("消防勤務易讀小幫手已停用。");
        return;
      }

      // 1. 建立代號與姓名的對照表
      const idToNameMap = {};
      let mapSectionFound = false;

      // 取得所有 h5 標籤 (標題所在)
      const headers = document.querySelectorAll("h5");

      headers.forEach((header) => {
        // 修正重點：移除標題文字中所有的空白與換行後再進行比對
        const cleanText = header.innerText.replace(/\s+/g, "");

        if (cleanText.includes("勤務輪流順序與服勤人員對照表")) {
          console.log("已找到對照表標題，正在解析...");

          const table = header.closest("table");

          if (table) {
            const rows = table.querySelectorAll("tr");

            rows.forEach((row) => {
              const cells = row.querySelectorAll("td");
              for (let i = 0; i < cells.length - 1; i++) {
                const currentText = cells[i].innerText.trim();
                const nextText = cells[i + 1] ? cells[i + 1].innerText.trim() : "";

                // 修正 1：支援義消編號 (例如：義22) 或純數字編號
                if (/^(義?\d+)$/.test(currentText) && nextText !== "") {
                  idToNameMap[currentText] = nextText;
                }
              }
            });
            mapSectionFound = true;
          }
        }
      });

      if (!mapSectionFound || Object.keys(idToNameMap).length === 0) {
        console.log("消防勤務易讀小幫手：此頁面無人員對照表，跳過替換。");
        return;
      }

      console.log(
        "已建立人員名單 (筆數: " + Object.keys(idToNameMap).length + "):",
        idToNameMap,
      );

      // Save to storage for Popup to use
      // Also parse on-duty IDs from "輪(上)班" row
      const onDutyIds = [];
      const allP0Cells_duty = document.querySelectorAll("td.p-0");
      for (let i = 0; i < allP0Cells_duty.length; i++) {
        const cellText = allP0Cells_duty[i].innerText.trim();
        if (cellText === "輪(上)班") {
          // The next sibling td has the comma-separated IDs
          let sibling = allP0Cells_duty[i].nextElementSibling;
          if (sibling) {
            const idsText = sibling.innerText.trim();
            if (idsText) {
              idsText.split(/[,，、\s]+/).forEach(id => {
                const clean = id.trim();
                if (clean && /^義?\d+$/.test(clean)) {
                  onDutyIds.push(clean);
                }
              });
            }
          }
          break;
        }
      }

      console.log("當日上班人員 (筆數: " + onDutyIds.length + "):", onDutyIds);

      chrome.storage.local.set({ pendingIdToNameMap: idToNameMap, pendingOnDutyIds: onDutyIds }, () => {
        console.log("人員名單與上班名單已儲存為待確認狀態...");
      });

      const nameSpanStyle = `
    display: inline-block;
    background-color: #e3f2fd;
    color: #0d47a1;
    padding: 2px 5px;
    margin: 2px;
    border-radius: 4px;
    font-size: 0.95em;
    font-weight: bold;
    border: 1px solid #bbdefb;
    box-shadow: 1px 1px 2px rgba(0,0,0,0.1);
  `;

      // 2. 替換勤務表中的數字
      // 勤務表的格子特徵是 class="p-1"
      const dutyCells = document.querySelectorAll("td.p-1");

      dutyCells.forEach((cell) => {
        const originalText = cell.innerText.trim();
        if (!originalText) return;

        // 使用正則表達式分割，保留分隔符號 (逗號、頓號、空格、換行)
        const tokens = originalText.split(/([,，、\s\n\r]+)/);

        let changed = false;
        const newHtml = tokens
          .map((token) => {
            const cleanToken = token.trim();
            if (idToNameMap[cleanToken]) {
              changed = true;
              return `<span style="${nameSpanStyle}">${idToNameMap[cleanToken]}</span>`;
            }
            return token; // 保持原樣 (包含分隔符號)
          })
          .join("");

        if (changed) {
          cell.innerHTML = newHtml;
        }
      });

      // 3. 修正 2：替換備註欄裡的行程冒號後的番號
      const tdList = document.querySelectorAll("td");
      let remarksCell = null;
      for (let i = 0; i < tdList.length; i++) {
        // 尋找內容為「備註」的單元格
        if (tdList[i].innerText.trim() === "備註") {
          remarksCell = tdList[i].nextElementSibling;
          break;
        }
      }

      if (remarksCell) {
        console.log("正在處理備註欄...");
        let html = remarksCell.innerHTML;

        // 匹配冒號後的內容，直到遇到不屬於 ID 或分隔符號的字元 (例如 <br> 的 <)
        // 容許範圍：數字、義、逗號、空格、頓號、換行
        const afterColonRegex = /:([\s,，、義\d\n\r]+)/g;

        html = html.replace(afterColonRegex, (match, p1) => {
          // p1 是冒號後的 ID 原始字串
          const tokens = p1.split(/([,，、\s\n\r]+)/);
          const replacedTokens = tokens.map((token) => {
            const cleanToken = token.trim();
            if (idToNameMap[cleanToken]) {
              return `<span style="${nameSpanStyle}">${idToNameMap[cleanToken]}</span>`;
            }
            return token;
          });
          return ":" + replacedTokens.join("");
        });

        remarksCell.innerHTML = html;
      }

      // 4. 替換摘要區 (請假、補休、勤務排除等) 的番號
      const summaryLabels = [
        "請假",
        "補休",
        "勤務排除",
        // "輪(上)班",
        // "輪休",
        // "外宿",
        // "停休",
      ];
      const allP0Cells = document.querySelectorAll("td.p-0");
      allP0Cells.forEach((cell) => {
        const cellText = cell.innerText.trim();
        if (!summaryLabels.includes(cellText)) return;

        // 找到同一 tr 中，該標籤之後的所有兄弟 td
        let sibling = cell.nextElementSibling;
        while (sibling && sibling.tagName === "TD") {
          const originalText = sibling.innerText.trim();
          if (originalText) {
            const tokens = originalText.split(/([,，、\s\n\r]+)/);
            let changed = false;
            const newHtml = tokens
              .map((token) => {
                const cleanToken = token.trim();
                if (idToNameMap[cleanToken]) {
                  changed = true;
                  return `<span style="${nameSpanStyle}">${idToNameMap[cleanToken]}</span>`;
                }
                return token;
              })
              .join("");
            if (changed) {
              sibling.innerHTML = newHtml;
            }
          }
          sibling = sibling.nextElementSibling;
        }
      });

      console.log("替換完成！");
    }
  );
})();
