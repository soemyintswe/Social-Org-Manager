import AsyncStorage from "@react-native-async-storage/async-storage";
import { Member, OrgEvent, Group, AttendanceRecord } from "./types";

const KEYS = {
  MEMBERS: "@orghub_members",
  EVENTS: "@orghub_events",
  GROUPS: "@orghub_groups",
  ATTENDANCE: "@orghub_attendance",
};

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

const AVATAR_COLORS = [
  "#0D9488", "#F43F5E", "#8B5CF6", "#F59E0B",
  "#3B82F6", "#10B981", "#EC4899", "#6366F1",
];

function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export async function getMembers(): Promise<Member[]> {
  const data = await AsyncStorage.getItem(KEYS.MEMBERS);
  return data ? JSON.parse(data) : [];
}

export async function saveMember(member: Omit<Member, "id" | "avatarColor" | "joinDate">): Promise<Member> {
  const members = await getMembers();
  const newMember: Member = {
    ...member,
    id: generateId(),
    avatarColor: randomColor(),
    joinDate: new Date().toISOString(),
  };
  members.push(newMember);
  await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(members));
  return newMember;
}

export async function updateMember(id: string, updates: Partial<Member>): Promise<Member | null> {
  const members = await getMembers();
  const idx = members.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  members[idx] = { ...members[idx], ...updates };
  await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(members));
  return members[idx];
}

export async function deleteMember(id: string): Promise<void> {
  const members = await getMembers();
  await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(members.filter((m) => m.id !== id)));
}

export async function getEvents(): Promise<OrgEvent[]> {
  const data = await AsyncStorage.getItem(KEYS.EVENTS);
  return data ? JSON.parse(data) : [];
}

export async function saveEvent(event: Omit<OrgEvent, "id" | "createdAt">): Promise<OrgEvent> {
  const events = await getEvents();
  const newEvent: OrgEvent = {
    ...event,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  events.push(newEvent);
  await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify(events));
  return newEvent;
}

export async function updateEvent(id: string, updates: Partial<OrgEvent>): Promise<OrgEvent | null> {
  const events = await getEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  events[idx] = { ...events[idx], ...updates };
  await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify(events));
  return events[idx];
}

export async function deleteEvent(id: string): Promise<void> {
  const events = await getEvents();
  await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify(events.filter((e) => e.id !== id)));
  const attendance = await getAttendance();
  await AsyncStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(attendance.filter((a) => a.eventId !== id)));
}

export async function getGroups(): Promise<Group[]> {
  const data = await AsyncStorage.getItem(KEYS.GROUPS);
  return data ? JSON.parse(data) : [];
}

export async function saveGroup(group: Omit<Group, "id" | "createdAt">): Promise<Group> {
  const groups = await getGroups();
  const newGroup: Group = {
    ...group,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  groups.push(newGroup);
  await AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify(groups));
  return newGroup;
}

export async function updateGroup(id: string, updates: Partial<Group>): Promise<Group | null> {
  const groups = await getGroups();
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  groups[idx] = { ...groups[idx], ...updates };
  await AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify(groups));
  return groups[idx];
}

export async function deleteGroup(id: string): Promise<void> {
  const groups = await getGroups();
  await AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify(groups.filter((g) => g.id !== id)));
}

export async function getAttendance(): Promise<AttendanceRecord[]> {
  const data = await AsyncStorage.getItem(KEYS.ATTENDANCE);
  return data ? JSON.parse(data) : [];
}

export async function saveAttendance(records: AttendanceRecord[]): Promise<void> {
  const existing = await getAttendance();
  const updated = [...existing];
  for (const record of records) {
    const idx = updated.findIndex((a) => a.eventId === record.eventId && a.memberId === record.memberId);
    if (idx >= 0) {
      updated[idx] = record;
    } else {
      updated.push(record);
    }
  }
  await AsyncStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(updated));
}

export async function getAttendanceForEvent(eventId: string): Promise<AttendanceRecord[]> {
  const attendance = await getAttendance();
  return attendance.filter((a) => a.eventId === eventId);
}
