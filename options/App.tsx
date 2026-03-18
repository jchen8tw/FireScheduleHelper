import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Zap, Pencil } from 'lucide-react';

export default function App() {
  const [enableReplace, setEnableReplace] = useState<boolean>(true);
  const [enableRemoveDutyAlert, setEnableRemoveDutyAlert] = useState<boolean>(false);
  const [combatGroup, setCombatGroup] = useState<Record<string, any>>({});
  const [customGroups, setCustomGroups] = useState<any[]>([]);

  useEffect(() => {
    chrome.storage?.sync?.get(['enableReplace', 'enableRemoveDutyAlert', 'combatGroup', 'customGroups'], (items) => {
      if (items.enableReplace !== undefined) setEnableReplace(Boolean(items.enableReplace));
      if (items.enableRemoveDutyAlert !== undefined) setEnableRemoveDutyAlert(Boolean(items.enableRemoveDutyAlert));
      if (items.combatGroup) setCombatGroup(items.combatGroup as Record<string, any>);
      if (items.customGroups) setCustomGroups(items.customGroups as any[]);
    });
  }, []);

  const saveOptions = (checked: boolean) => {
    setEnableReplace(checked);
    chrome.storage?.sync?.set({ enableReplace: checked });
  };

  const saveRemoveDutyAlert = (checked: boolean) => {
    setEnableRemoveDutyAlert(checked);
    chrome.storage?.sync?.set({ enableRemoveDutyAlert: checked });
  };

  const handleReadSchedule = () => {
    if (confirm("確定要讀取最新勤務表嗎？這將會更新上班人員名單，並【清空】現有的作戰編組！")) {
      chrome.storage?.local?.get(['pendingIdToNameMap', 'pendingOnDutyIds'], (data) => {
        if (!data.pendingIdToNameMap || Object.keys(data.pendingIdToNameMap).length === 0) {
          alert('找不到待讀取的勤務表資料，請確認您已在當日的勤務表頁面。');
          return;
        }
        chrome.storage?.local?.set({
          idToNameMap: data.pendingIdToNameMap,
          onDutyIds: data.pendingOnDutyIds || []
        }, () => {
          chrome.storage?.sync?.set({
            combatGroup: {},
            customGroups: [],
            slotCounts: { rest: 0, water: 0, custom: {} },
            combatNotes: ''
          }, () => {
            alert('讀取完成！上班人員名單已更新，作戰編組已清空。');
            setCombatGroup({});
            setCustomGroups([]);
          });
        });
      });
    }
  };

  const handleQuickFill = () => {
    if (!combatGroup || Object.keys(combatGroup).length === 0) {
      alert('請先編排人員！');
      return;
    }
    chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return;
      chrome.storage?.sync?.get(['combatNotes'], (nr) => {
        chrome.scripting?.executeScript({
          target: { tabId: tabs[0].id as number },
          files: ['content_scripts/quick_fill.js']
        }, () => {
          chrome.tabs?.sendMessage(tabs[0].id as number, {
            action: "quickFill",
            data: combatGroup,
            notes: nr.combatNotes || ''
          });
        });
      });
    });
  };

  const openEditor = () => {
    const editorUrl = chrome.runtime?.getURL('editor.html');
    if (!editorUrl) return;
    chrome.tabs?.query({ url: editorUrl }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id && tabs[0].windowId) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: editorUrl });
      }
    });
  };

  // UI mapping logic same as before...
  const ROLE_LABELS: Record<string, string> = {
    fire_user_id_a: '火警值班',
    attack_driver: '攻擊車 司機', attack_leader: '攻擊車 帶隊官',
    attack_nozzle: '攻擊車 瞄子手', attack_asst_nozzle: '攻擊車 副瞄子手',
    attack_search: '攻擊車 破壞搜救手',
    relay_driver: '中繼車 司機', relay_nozzle: '中繼車 瞄子手',
    ladder_driver: '雲梯車 司機',
    ambulance_driver: '救護車 司機', ambulance_emt: '救護車 救護技術員',
  };

  const renderSummary = () => {
    if (!combatGroup || Object.keys(combatGroup).length === 0) {
      return <div className="text-center italic text-muted-foreground">尚無作戰編組資料</div>;
    }

    const groups = {
      '火警值班': ['fire_user_id_a'],
      '攻擊水箱車': ['attack_driver', 'attack_leader', 'attack_nozzle', 'attack_asst_nozzle', 'attack_search'],
      '中繼水箱車': ['relay_driver', 'relay_nozzle'],
      '雲梯車': ['ladder_driver'],
      '救護車': ['ambulance_driver', 'ambulance_emt'],
    };

    const elements = [];

    for (const [title, roles] of Object.entries(groups)) {
      const items = roles.filter(r => combatGroup[r]).map(r =>
        <span key={r}><span className="text-xs text-muted-foreground">{ROLE_LABELS[r]?.split(' ').pop() || r}:</span> <span className="font-bold">{combatGroup[r].name}</span></span>
      );
      if (items.length > 0) {
        elements.push(
          <div key={title} className="mb-3">
            <h4 className="text-[13px] font-semibold text-muted-foreground mb-1">{title}</h4>
            <div className="flex flex-wrap gap-2 text-[13px]">
              {items.map((item, i) => <span key={i}>{item}{i < items.length - 1 ? ' ｜ ' : ''}</span>)}
            </div>
          </div>
        );
      }
    }

    // Dynamic
    const dynamicPrefixes = new Set<string>();
    for (const key of Object.keys(combatGroup)) {
      const match = key.match(/^(.+)_\d+$/);
      if (match && !Object.keys(ROLE_LABELS).includes(key)) {
        dynamicPrefixes.add(match[1]);
      }
    }

    const prefixLabels: Record<string, string> = { rest: '休息', water: '水源查察' };
    const customTitles: Record<string, string> = {};
    customGroups.forEach(g => { customTitles[g.id] = g.title; });

    dynamicPrefixes.forEach(prefix => {
      const names = Object.keys(combatGroup)
        .filter(k => k.startsWith(prefix + '_'))
        .map(k => combatGroup[k].name);
      if (names.length > 0) {
        const label = prefixLabels[prefix] || customTitles[prefix] || prefix;
        elements.push(
          <div key={prefix} className="mb-3">
            <h4 className="text-[13px] font-semibold text-muted-foreground mb-1">{label}</h4>
            <div className="text-[13px]">{names.join('、')}</div>
          </div>
        );
      }
    });

    return elements.length > 0 ? elements : <div className="text-center italic text-muted-foreground">尚無作戰編組資料</div>;
  };

  return (
    <div className="w-[400px] min-h-[500px] bg-background p-5">
      <Tabs defaultValue="CombatGroup" className="w-full">
        <TabsList className="w-full grid grid-cols-2 h-10 mb-4">
          <TabsTrigger value="CombatGroup">作戰編組</TabsTrigger>
          <TabsTrigger value="DutySchedule">設定</TabsTrigger>
        </TabsList>

        <TabsContent value="CombatGroup" className="flex flex-col gap-4">
          <Card className="shadow-sm">
            <CardContent className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Button onClick={handleReadSchedule} className="w-full justify-center">
                  <FileText className="w-4 h-4 mr-2" />
                  讀取最新勤務表
                </Button>
                <div className="text-[13px] text-muted-foreground leading-snug">
                  提醒：讀取新的勤務表時，將會清空目前所有的作戰編組設定。請確保您已開啟過當日的勤務表網頁。
                </div>
              </div>

              <div className="h-px bg-border w-full" />

              <Button onClick={handleQuickFill} className="w-full justify-center">
                <Zap className="w-4 h-4 mr-2" />
                快速填入
              </Button>

              <Button onClick={() => openEditor()} className="w-full justify-center">
                <Pencil className="w-4 h-4 mr-2" />
                編輯作戰編組
              </Button>

              <div className="h-px bg-border w-full" />

              <div className="min-h-[100px]">
                {renderSummary()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="DutySchedule">
          <Card className="shadow-sm">
            <CardContent className="p-4 flex flex-col gap-4">
              <div className="flex items-center space-x-2">
                <Switch id="enableReplace" checked={enableReplace} onCheckedChange={saveOptions} />
                <Label htmlFor="enableReplace" className="text-sm font-medium leading-none">
                  啟用勤務表番號自動替換人名功能
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="enableRemoveDutyAlert" checked={enableRemoveDutyAlert} onCheckedChange={saveRemoveDutyAlert} />
                <Label htmlFor="enableRemoveDutyAlert" className="text-sm font-medium leading-none">
                  去除新值班系統彈窗警示功能
                </Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
