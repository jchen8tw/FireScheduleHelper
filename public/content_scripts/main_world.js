window.addEventListener('FireScheduleHelper_RemoveAlert', () => {
  if (window.dutyAlertsChecker) {
    if (typeof window.dutyAlertsChecker.stopChecking === 'function') {
      window.dutyAlertsChecker.stopChecking();
    }
    window.dutyAlertsChecker.showAlertsDialog = function() {
      console.log('消防勤務易讀小幫手：彈窗已被攔截');
    };
  }
});
