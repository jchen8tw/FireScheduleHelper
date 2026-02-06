(function () {
  "use strict";

  console.log("消防勤務易讀小幫手 (修正版) 啟動中...");

  // 1. 建立代號與姓名的對照表
  const idToNameMap = {};
  let mapSectionFound = false;

  // 取得所有 h5 標籤 (標題所在)
  const headers = document.querySelectorAll("h5");

  headers.forEach((header) => {
    // 修正重點：移除標題文字中所有的空白與換行後再進行比對
    // 原始 HTML 是 "勤 務 輪 流 順 序..."，直接比對會失敗
    const cleanText = header.innerText.replace(/\s+/g, "");

    if (cleanText.includes("勤務輪流順序與服勤人員對照表")) {
      console.log("已找到對照表標題，正在解析...");

      // 向上找到包含這個標題的表格區塊
      // h5 -> td -> tr -> tbody -> table -> td -> tr -> tbody -> table (結構較深，我們找最近的 table 容器)
      // 根據 HTML 結構，標題被包在一個 table 裡，而資料在同一個大 table 的後續 row
      // 我們直接找這個 header 所在的 table
      const table = header.closest("table");

      if (table) {
        const rows = table.querySelectorAll("tr");

        rows.forEach((row) => {
          const cells = row.querySelectorAll("td");
          // 遍歷該列的所有儲存格
          for (let i = 0; i < cells.length - 1; i++) {
            const currentText = cells[i].innerText.trim();
            // 嘗試抓取下一格，有些名字有 colspan，但 innerText 抓取不受影響
            const nextText = cells[i + 1] ? cells[i + 1].innerText.trim() : "";

            // 邏輯：如果當前格是「純數字」，且下一格有文字，視為 ID -> Name
            if (/^\d+$/.test(currentText) && nextText !== "") {
              idToNameMap[currentText] = nextText;
            }
          }
        });
        mapSectionFound = true;
      }
    }
  });

  if (!mapSectionFound || Object.keys(idToNameMap).length === 0) {
    console.log("錯誤：找不到對照表或無法解析名單。");
    // 嘗試備用方案：直接搜尋特定特徵的表格 (針對該系統結構)
    // 如果標題抓取失敗，我們嘗試抓取含有 "1" 和 "詹博鈞" 這種結構的表格 (寫死測試)
    return;
  }

  console.log(
    "已建立人員名單 (筆數: " + Object.keys(idToNameMap).length + "):",
    idToNameMap,
  );

  // 2. 替換勤務表中的數字
  // 勤務表的格子特徵是 class="p-1"
  const dutyCells = document.querySelectorAll("td.p-1");

  dutyCells.forEach((cell) => {
    const originalText = cell.innerText.trim();
    if (!originalText) return;

    // 使用正則表達式分割，支援逗號、頓號、空格
    // 原始資料範例: "2,19,24,25,29"
    const ids = originalText.split(/[,，、\s]+/);

    // 檢查這一格裡面是否包含我們名單上的 ID
    const hasKnownId = ids.some((id) => idToNameMap[id.trim()]);
    if (!hasKnownId) return;

    // 建立新的 HTML
    const newHtml = ids
      .map((id) => {
        const cleanId = id.trim();
        if (idToNameMap[cleanId]) {
          // 找到名字，產生藍色標籤
          return `<span style="
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
                ">${idToNameMap[cleanId]}</span>`; // 如果需要顯示號碼可改為: ${cleanId}.${idToNameMap[cleanId]}
        } else {
          // 找不到名字 (可能是空字串或符號)，保持原樣
          return cleanId ? `<span style="margin:2px;">${cleanId}</span>` : "";
        }
      })
      .join("");

    cell.innerHTML = newHtml;
  });

  console.log("替換完成！");
})();
