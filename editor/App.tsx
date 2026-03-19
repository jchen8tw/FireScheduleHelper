import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Search, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
type Person = { id: string; name: string };
type SlotData = { id: string; role: string; label: string; occupant: Person | null; group: string; isDynamic: boolean };

// Component: Draggable Person Item (Sidebar)
function SortablePerson({ person, isAssigned }: { person: Person, isAssigned: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `person-${person.id}`,
    data: { type: 'person', person },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isAssigned) return null;

  return (
    <Button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      variant="default"
      className={cn("w-full justify-start text-sm mb-1.5 font-normal h-9", isDragging && "opacity-50")}
    >
      {person.id} {person.name}
    </Button>
  );
}

// Component: Droppable Slot
function SortableSlot({ slot, onRemoveOccupant }: { slot: SlotData, onRemoveOccupant: (s: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `slot-${slot.id}`,
    data: { type: 'slot', slot },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Common badge style for both dynamic and fixed slots
  const PersonBadge = ({ occupant, onRemove }: { occupant: Person, onRemove: () => void }) => (
    <div
      className={cn(
        "bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 cursor-grab shadow-sm border border-primary-foreground/10 select-none",
        isDragging && "opacity-0"
      )}
    >
      <span className="font-medium whitespace-nowrap">{occupant.id} {occupant.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="hover:bg-primary-foreground/20 rounded-full w-4 h-4 flex items-center justify-center transition-colors -mr-1"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );

  if (slot.isDynamic) {
    if (!slot.occupant) return null;
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={cn("relative group", isDragging && "z-50")}>
        <PersonBadge occupant={slot.occupant} onRemove={() => onRemoveOccupant(slot.id)} />
      </div>
    );
  }

  // Regular fixed slot
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative min-w-[120px] min-h-[56px] border-2 border-dashed rounded-md flex flex-col items-center justify-center p-2 bg-muted/30 transition-all",
        isOver && !slot.occupant && "border-primary bg-primary/5 scale-[1.02]"
      )}
    >
      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5 select-none">{slot.label}</span>
      {slot.occupant && (
        <div style={style} {...attributes} {...listeners} className="relative z-10">
          <PersonBadge occupant={slot.occupant} onRemove={() => onRemoveOccupant(slot.id)} />
        </div>
      )}
    </div>
  );
}

// Component: Droppable Sidebar Area (to support drag-to-remove)
function DroppableSidebar({ children, searchQuery, setSearchQuery }: {
  children: React.ReactNode,
  searchQuery: string,
  setSearchQuery: (v: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'sidebar-droppable',
    data: { type: 'sidebar' }
  });

  return (
    <aside
      ref={setNodeRef}
      className={cn(
        "w-[260px] border-r bg-sidebar flex flex-col transition-colors",
        isOver && "bg-destructive/5 border-r-destructive/30"
      )}
    >
      <div className="p-4 pb-2">
        <h3 className="text-sm font-semibold text-sidebar-foreground mb-3 flex items-center justify-between">
          人員名單
          {isOver && <span className="text-[10px] text-destructive animate-pulse font-bold">放開以移除人員</span>}
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 bg-background h-8 text-sm focus-visible:ring-primary"
            placeholder="搜尋姓名或編號..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {children}
      </div>
    </aside>
  );
}

// Component: Droppable Dynamic Zone
function DroppableDynamicZone({ groupId, isEmpty, children }: { groupId: string, isEmpty: boolean, children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `group-${groupId}`,
    data: { type: 'dynamicGroup', groupId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[60px] w-full border-2 border-dashed rounded-md flex flex-wrap items-center gap-2 p-2.5 transition-colors",
        isOver ? "border-primary bg-primary/10" : "border-border bg-muted/30"
      )}
    >
      {children}
      {isEmpty && (
        <span className="text-sm text-muted-foreground mx-auto">拉入人員至此區域</span>
      )}
    </div>
  );
}

const FIXED_GROUPS = [
  { id: 'fire_watch', title: '值班', roles: [{ id: 'fire_user_id_a', label: '火警值班' }] },
  { id: 'attack', title: '攻擊水箱車', roles: [
      { id: 'attack_driver', label: '司機' }, { id: 'attack_leader', label: '帶隊官' },
      { id: 'attack_nozzle', label: '瞄子手' }, { id: 'attack_asst_nozzle', label: '副瞄子手' },
      { id: 'attack_search', label: '破壞搜救手' }
    ] },
  { id: 'relay', title: '中繼水箱車', roles: [{ id: 'relay_driver', label: '司機' }, { id: 'relay_nozzle', label: '瞄子手' }] },
  { id: 'ladder', title: '雲梯車', roles: [{ id: 'ladder_driver', label: '司機' }] },
  { id: 'ambulance', title: '一般型救護車', roles: [{ id: 'ambulance_driver', label: '司機' }, { id: 'ambulance_emt', label: '救護技術員' }] },
];

export default function EditorApp() {
  const [personnel, setPersonnel] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // State for slots mapping role_id -> SlotData
  const [slots, setSlots] = useState<Record<string, SlotData>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // State for dynamic groups
  const [dynamicGroups, setDynamicGroups] = useState<{id: string, title: string, prefix: string}[]>([
    { id: 'restGroup', title: '休息', prefix: 'rest' },
    { id: 'waterGroup', title: '水源查察', prefix: 'water' }
  ]);

  const [activeDragItem, setActiveDragItem] = useState<{type: 'person'|'slot', data: any} | null>(null);

  // Initialize
  useEffect(() => {
    chrome.storage?.local?.get(['idToNameMap', 'onDutyIds'], (local) => {
      chrome.storage?.sync?.get(['combatGroup', 'customGroups', 'slotCounts'], (sync) => {
        // 1. Load Personnel
        const map = (local.idToNameMap || {}) as Record<string, string>;
        const onDuty = Array.isArray(local.onDutyIds) ? local.onDutyIds : [];
        const loadedPersonnel: Person[] = [];

        if (onDuty.length > 0) {
          onDuty.forEach((id: string) => {
            if (map[id]) loadedPersonnel.push({ id, name: map[id] });
          });
        } else {
          Object.assign(loadedPersonnel, Object.entries(map).map(([id, name]) => ({ id, name: String(name) })));
        }
        loadedPersonnel.sort((a, b) => (parseInt(a.id.replace(/\D/g, '')) || 0) - (parseInt(b.id.replace(/\D/g, '')) || 0));
        setPersonnel(loadedPersonnel);

        // 2. Build Initial Slots State
        const initialSlots: Record<string, SlotData> = {};

        // Fixed slots
        FIXED_GROUPS.forEach(g => {
          g.roles.forEach(r => {
            initialSlots[r.id] = { id: r.id, role: r.id, label: r.label, occupant: null, group: g.id, isDynamic: false };
          });
        });

        // Dynamic slots - Do not auto-create empty slots
        const loadedCustom = Array.isArray(sync.customGroups) ? sync.customGroups : [];
        const customDyn = [{ id: 'restGroup', title: '休息', prefix: 'rest' }, { id: 'waterGroup', title: '水源查察', prefix: 'water' }];
        loadedCustom.forEach((g: any) => {
          customDyn.push({ id: g.id, title: g.title, prefix: g.id });
        });
        setDynamicGroups(customDyn);

        // Fill occupants
        if (sync.combatGroup) {
          Object.entries(sync.combatGroup).forEach(([role, data]: [string, any]) => {
            if (initialSlots[role]) {
              initialSlots[role].occupant = { id: data.id, name: data.name };
            } else {
              // It's a dynamic slot that was saved
              const lastUnderscore = role.lastIndexOf('_');
              const prefix = lastUnderscore !== -1 ? role.substring(0, lastUnderscore) : role;
              const groupMap: Record<string, string> = { rest: 'restGroup', water: 'waterGroup' };
              const groupId = groupMap[prefix] || customDyn.find(g => g.id === prefix)?.id;
              if (groupId) {
                initialSlots[role] = { id: role, role, label: '', occupant: { id: data.id, name: data.name }, group: groupId, isDynamic: true };
              }
            }
          });
        }

        setSlots(initialSlots);
        setIsLoaded(true);
      });
    });
  }, []);

  const saveToStorage = useCallback(() => {
    const cg: Record<string, { id: string, name: string }> = {};
    const custom: { id: string, title: string }[] = [];
    const counts: { rest: number, water: number, custom: Record<string, number> } = { rest: 0, water: 0, custom: {} };

    Object.values(slots).forEach(s => {
      if (s.occupant) {
        cg[s.role] = { id: s.occupant.id, name: s.occupant.name };
      }

      if (s.isDynamic) {
        const lastUnderscore = s.role.lastIndexOf('_');
        const prefix = lastUnderscore !== -1 ? s.role.substring(0, lastUnderscore) : s.role;
        if (prefix === 'rest') counts.rest++;
        else if (prefix === 'water') counts.water++;
        else counts.custom[prefix] = (counts.custom[prefix] || 0) + 1;
      }
    });

    dynamicGroups.forEach(g => {
      if (g.id !== 'restGroup' && g.id !== 'waterGroup') {
        custom.push({ id: g.id, title: g.title });
        if (counts.custom[g.id] === undefined) counts.custom[g.id] = 0;
      }
    });

    // Notes
    const notesArr: string[] = [];
    const getGroupNames = (gid: string) => Object.values(slots).filter(s => s.group === gid && s.occupant).map(s => s.occupant!.name);

    const restNames = getGroupNames('restGroup');
    if (restNames.length) notesArr.push(`休息:${restNames.join('、')}`);

    const waterNames = getGroupNames('waterGroup');
    if (waterNames.length) notesArr.push(`水源查察:${waterNames.join('、')}`);

    custom.forEach(g => {
      const names = getGroupNames(g.id);
      if (names.length) notesArr.push(`${g.title}:${names.join('、')}`);
    });

    chrome.storage?.sync?.set({
      combatGroup: cg,
      customGroups: custom,
      slotCounts: counts,
      combatNotes: notesArr.join('\n')
    });
  }, [slots, dynamicGroups]);

  // Save to Extension Storage
  useEffect(() => {
    if (isLoaded) {
      // Debounce or just save directly since this isn't typed often
      saveToStorage();
    }
  }, [slots, dynamicGroups, isLoaded, saveToStorage]);

  // DND Handlers
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const type = active.id.toString().startsWith('person-') ? 'person' : 'slot';
    setActiveDragItem({ type, data: active.data.current });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);

    const activeId = active.id.toString();
    const overId = over?.id.toString() || '';

    // 1. Drag-to-remove: If dropped outside, onto the sidebar background, or over a person in the list
    const isOverSidebar = overId === 'sidebar-droppable' || overId.startsWith('person-');
    
    if (!over || isOverSidebar) {
      if (activeId.startsWith('slot-')) {
        const activeSlotId = activeId.replace('slot-', '');
        removeOccupant(activeSlotId);
      }
      return;
    }

    // 2. Dragging person from sidebar
    if (activeId.startsWith('person-')) {
      const person = active.data.current?.person;
      if (!person) return;

      // a) dropping onto a specific slot
      if (overId.startsWith('slot-')) {
        const slotId = overId.replace('slot-', '');
        if (slots[slotId]) {
          setSlots(prev => {
            const newSlots = { ...prev };
            for (const key in newSlots) {
              if (newSlots[key].occupant?.id === person.id) {
                if (newSlots[key].isDynamic) delete newSlots[key];
                else newSlots[key] = { ...newSlots[key], occupant: null };
              }
            }
            newSlots[slotId] = { ...newSlots[slotId], occupant: person };
            return newSlots;
          });
        }
      }

      // b) dropping onto a dynamic group zone
      if (overId.startsWith('group-')) {
        const groupId = overId.replace('group-', '');
        const groupDef = dynamicGroups.find(g => g.id === groupId);
        if (groupDef) {
          setSlots(prev => {
            const newSlots = { ...prev };
            // clear old slot if exists
            for (const key in newSlots) {
              if (newSlots[key].occupant?.id === person.id) {
                if (newSlots[key].isDynamic) delete newSlots[key];
                else newSlots[key] = { ...newSlots[key], occupant: null };
              }
            }
            // create new dynamic slot
            const newRoleId = `${groupDef.prefix}_${Date.now()}`;
            newSlots[newRoleId] = { id: newRoleId, role: newRoleId, label: '', occupant: person, group: groupId, isDynamic: true };
            return newSlots;
          });
        }
      }
    }

    // 3. Dragging between slots (swap logic)
    if (activeId.startsWith('slot-')) {
      const activeSlotId = activeId.replace('slot-', '');

      // a) dropping onto another slot
      if (overId.startsWith('slot-')) {
        if (activeId === overId) return;
        const overSlotId = overId.replace('slot-', '');

        setSlots(prev => {
          const activeSlot = prev[activeSlotId];
          const overSlot = prev[overSlotId];

          // If both are dynamic and in the same group, reorder instead of swapping contents
          // This prevents the "double swap" animation flicker because dnd-kit sees the IDs moving
          if (activeSlot?.isDynamic && overSlot?.isDynamic && activeSlot.group === overSlot.group) {
            const keys = Object.keys(prev);
            const oldIndex = keys.indexOf(activeSlotId);
            const newIndex = keys.indexOf(overSlotId);
            const newKeys = arrayMove(keys, oldIndex, newIndex);
            
            const newSlots: Record<string, SlotData> = {};
            newKeys.forEach(key => {
              newSlots[key] = prev[key];
            });
            return newSlots;
          }

          const newSlots = { ...prev };
          const tempOccupant = newSlots[overSlotId]?.occupant;
          if (newSlots[overSlotId]) newSlots[overSlotId] = { ...newSlots[overSlotId], occupant: newSlots[activeSlotId].occupant };
          if (newSlots[activeSlotId]) newSlots[activeSlotId] = { ...newSlots[activeSlotId], occupant: tempOccupant };

          // cleanup empty dynamic slots
          Object.keys(newSlots).forEach(k => {
            if (newSlots[k].isDynamic && !newSlots[k].occupant) delete newSlots[k];
          });
          return newSlots;
        });
      }

      // b) dropping onto a dynamic group zone
      if (overId.startsWith('group-')) {
        const groupId = overId.replace('group-', '');
        const groupDef = dynamicGroups.find(g => g.id === groupId);
        const person = slots[activeSlotId]?.occupant;

        if (groupDef && person && slots[activeSlotId].group !== groupId) {
          setSlots(prev => {
            const newSlots = { ...prev };
            // clear from old position
            if (newSlots[activeSlotId].isDynamic) {
              delete newSlots[activeSlotId];
            } else {
              newSlots[activeSlotId] = { ...newSlots[activeSlotId], occupant: null };
            }
            // add to new dynamic group
            const newRoleId = `${groupDef.prefix}_${Date.now()}`;
            newSlots[newRoleId] = { id: newRoleId, role: newRoleId, label: '', occupant: person, group: groupId, isDynamic: true };
            return newSlots;
          });
        }
      }
    }
  };

  // Interactions
  const removeOccupant = (slotId: string) => {
    setSlots(prev => {
      const newSlots = { ...prev };
      if (newSlots[slotId].isDynamic) {
        delete newSlots[slotId];
      } else {
        newSlots[slotId] = { ...newSlots[slotId], occupant: null };
      }
      return newSlots;
    });
  };

  const addCustomGroup = () => {
    const id = `custom_${Date.now()}`;
    setDynamicGroups(prev => [...prev, { id, title: '新增欄位', prefix: id }]);
  };

  const updateCustomGroupTitle = (id: string, title: string) => {
    setDynamicGroups(prev => prev.map(g => g.id === id ? { ...g, title } : g));
  };

  const deleteCustomGroup = (id: string) => {
    setDynamicGroups(prev => prev.filter(g => g.id !== id));
    setSlots(prev => {
      const newSlots = { ...prev };
      Object.keys(newSlots).forEach(k => {
        if (newSlots[k].group === id) delete newSlots[k];
      });
      return newSlots;
    });
  };

  // derived state
  const assignedIds = new Set(Object.values(slots).map(s => s.occupant?.id).filter((id): id is string => !!id));
  const filteredPersonnel = personnel.filter(p => p.name.includes(searchQuery) || p.id.includes(searchQuery));

  const notesText = useMemo(() => {
    const getGroupNames = (gid: string) => Object.values(slots).filter(s => s.group === gid && s.occupant).map(s => s.occupant!.name);
    const arr: string[] = [];
    const rn = getGroupNames('restGroup'); if (rn.length) arr.push(`休息:${rn.join('、')}`);
    const wn = getGroupNames('waterGroup'); if (wn.length) arr.push(`水源查察:${wn.join('、')}`);
    dynamicGroups.filter(g => g.id !== 'restGroup' && g.id !== 'waterGroup').forEach(g => {
      const n = getGroupNames(g.id);
      if (n.length) arr.push(`${g.title}:${n.join('、')}`);
    });
    return arr.join('\n');
  }, [slots, dynamicGroups]);


  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-6 py-4 flex items-center justify-between z-10">
        <h1 className="text-lg font-semibold tracking-tight">編輯作戰編組</h1>
        <span className="text-sm opacity-80">自動儲存中</span>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>

          {/* Left Sidebar */}
          <DroppableSidebar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          >
            <SortableContext items={filteredPersonnel.map(p => `person-${p.id}`)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-0.5 mt-2">
                {filteredPersonnel.map((person) => (
                  <SortablePerson key={person.id} person={person} isAssigned={assignedIds.has(person.id)} />
                ))}
              </div>
            </SortableContext>
          </DroppableSidebar>

          {/* Right Area */}
          <section className="flex-1 overflow-y-auto p-6 bg-muted/20">
            <div className="max-w-4xl mx-auto flex flex-col gap-5">

              {/* Fixed Groups */}
              {FIXED_GROUPS.map(group => {
                const groupSlots = group.roles.map(r => slots[r.id]).filter(Boolean);

                return (
                  <Card key={group.id} className="overflow-hidden shadow-sm">
                    <CardHeader className="bg-muted/50 py-2.5 px-4 border-b space-y-0">
                      <CardTitle className="text-sm font-semibold">{group.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                       <SortableContext items={groupSlots.map(s => `slot-${s.id}`)} strategy={rectSortingStrategy}>
                        <div className="flex flex-wrap gap-2">
                          {groupSlots.map(slot => (
                            <SortableSlot key={slot.id} slot={slot} onRemoveOccupant={removeOccupant} />
                          ))}
                        </div>
                      </SortableContext>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Dynamic / Custom Groups */}
              {dynamicGroups.map(group => {
                const groupSlots = Object.values(slots).filter(s => s.group === group.id);

                return (
                  <Card key={group.id} className="overflow-hidden shadow-sm group">
                    <CardHeader className="bg-muted/50 py-2.5 px-4 border-b flex flex-row items-center justify-between space-y-0">
                      {group.id === 'restGroup' || group.id === 'waterGroup' ? (
                        <CardTitle className="text-sm font-semibold">{group.title}</CardTitle>
                      ) : (
                        <>
                          <Input
                            value={group.title}
                            onChange={(e) => updateCustomGroupTitle(group.id, e.target.value)}
                            className="h-7 w-1/2 text-sm font-semibold bg-transparent border-transparent px-1 hover:border-border focus:bg-background"
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteCustomGroup(group.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </CardHeader>
                    <CardContent className="p-4">
                      <DroppableDynamicZone groupId={group.id} isEmpty={groupSlots.length === 0}>
                        <SortableContext items={groupSlots.map(s => `slot-${s.id}`)} strategy={rectSortingStrategy}>
                          {groupSlots.map(slot => (
                            <SortableSlot key={slot.id} slot={slot} onRemoveOccupant={removeOccupant} />
                          ))}
                        </SortableContext>
                      </DroppableDynamicZone>
                    </CardContent>
                  </Card>
                );
              })}

              <Button variant="outline" className="w-full h-12 border-dashed bg-transparent hover:bg-muted/50 hover:text-primary transition-colors" onClick={addCustomGroup}>
                <Plus className="h-4 w-4 mr-2" /> 新增自訂欄位
              </Button>

              <Card className="shadow-sm mt-2">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-semibold">備註自動生成預覽</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <Textarea readOnly value={notesText} className="h-24 resize-none bg-muted/20" />
                </CardContent>
              </Card>

            </div>
          </section>

          {/* Drag Overlay for smooth animation */}
          <DragOverlay dropAnimation={null}>
            {activeDragItem ? (
              activeDragItem.type === 'person' ? (
                <Button variant="default" className="w-[220px] justify-start text-sm font-normal h-9 shadow-xl opacity-90 cursor-grabbing ring-2 ring-primary/20">
                  {activeDragItem.data.person.id} {activeDragItem.data.person.name}
                </Button>
              ) : (
                <div className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-2xl opacity-100 cursor-grabbing border border-primary-foreground/20 scale-110 transition-transform">
                  <span className="font-medium whitespace-nowrap">
                    {activeDragItem.data.slot.occupant?.id} {activeDragItem.data.slot.occupant?.name}
                  </span>
                  <X className="h-3 w-3 opacity-50" />
                </div>
              )
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}
