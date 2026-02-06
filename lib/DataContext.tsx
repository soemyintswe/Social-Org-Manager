import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { Member, OrgEvent, Group, AttendanceRecord } from "./types";
import * as store from "./storage";

interface DataContextValue {
  members: Member[];
  events: OrgEvent[];
  groups: Group[];
  attendance: AttendanceRecord[];
  loading: boolean;
  refresh: () => Promise<void>;
  addMember: (m: Omit<Member, "id" | "avatarColor" | "joinDate">) => Promise<Member>;
  editMember: (id: string, u: Partial<Member>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  addEvent: (e: Omit<OrgEvent, "id" | "createdAt">) => Promise<OrgEvent>;
  editEvent: (id: string, u: Partial<OrgEvent>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  addGroup: (g: Omit<Group, "id" | "createdAt">) => Promise<Group>;
  editGroup: (id: string, u: Partial<Group>) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
  markAttendance: (records: AttendanceRecord[]) => Promise<void>;
  getEventAttendance: (eventId: string) => AttendanceRecord[];
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [m, e, g, a] = await Promise.all([
      store.getMembers(),
      store.getEvents(),
      store.getGroups(),
      store.getAttendance(),
    ]);
    setMembers(m);
    setEvents(e);
    setGroups(g);
    setAttendance(a);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addMember = useCallback(async (m: Omit<Member, "id" | "avatarColor" | "joinDate">) => {
    const newMember = await store.saveMember(m);
    setMembers((prev) => [...prev, newMember]);
    return newMember;
  }, []);

  const editMember = useCallback(async (id: string, u: Partial<Member>) => {
    await store.updateMember(id, u);
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...u } : m)));
  }, []);

  const removeMember = useCallback(async (id: string) => {
    await store.deleteMember(id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addEvent = useCallback(async (e: Omit<OrgEvent, "id" | "createdAt">) => {
    const newEvent = await store.saveEvent(e);
    setEvents((prev) => [...prev, newEvent]);
    return newEvent;
  }, []);

  const editEvent = useCallback(async (id: string, u: Partial<OrgEvent>) => {
    await store.updateEvent(id, u);
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...u } : e)));
  }, []);

  const removeEvent = useCallback(async (id: string) => {
    await store.deleteEvent(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setAttendance((prev) => prev.filter((a) => a.eventId !== id));
  }, []);

  const addGroup = useCallback(async (g: Omit<Group, "id" | "createdAt">) => {
    const newGroup = await store.saveGroup(g);
    setGroups((prev) => [...prev, newGroup]);
    return newGroup;
  }, []);

  const editGroup = useCallback(async (id: string, u: Partial<Group>) => {
    await store.updateGroup(id, u);
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...u } : g)));
  }, []);

  const removeGroup = useCallback(async (id: string) => {
    await store.deleteGroup(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const markAttendance = useCallback(async (records: AttendanceRecord[]) => {
    await store.saveAttendance(records);
    setAttendance((prev) => {
      const updated = [...prev];
      for (const record of records) {
        const idx = updated.findIndex((a) => a.eventId === record.eventId && a.memberId === record.memberId);
        if (idx >= 0) updated[idx] = record;
        else updated.push(record);
      }
      return updated;
    });
  }, []);

  const getEventAttendance = useCallback(
    (eventId: string) => attendance.filter((a) => a.eventId === eventId),
    [attendance]
  );

  const value = useMemo(
    () => ({
      members, events, groups, attendance, loading, refresh,
      addMember, editMember, removeMember,
      addEvent, editEvent, removeEvent,
      addGroup, editGroup, removeGroup,
      markAttendance, getEventAttendance,
    }),
    [members, events, groups, attendance, loading, refresh,
      addMember, editMember, removeMember,
      addEvent, editEvent, removeEvent,
      addGroup, editGroup, removeGroup,
      markAttendance, getEventAttendance]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
