export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "admin" | "member" | "volunteer";
  status: "active" | "inactive";
  groupIds: string[];
  joinDate: string;
  avatarColor: string;
}

export interface OrgEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  attendeeIds: string[];
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  color: string;
  memberIds: string[];
  createdAt: string;
}

export interface AttendanceRecord {
  eventId: string;
  memberId: string;
  present: boolean;
}
