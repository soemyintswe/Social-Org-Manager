    // lib/storage.ts တွင် အစားထိုးရန် ကုဒ်အပြည့်အစုံ

    import AsyncStorage from "@react-native-async-storage/async-storage";
    import { Member, OrgEvent, Group, AttendanceRecord, Transaction, Loan, AccountSettings } from "./types";

    const KEYS = {
      MEMBERS: "@orghub_members",
      EVENTS: "@orghub_events",
      GROUPS: "@orghub_groups",
      ATTENDANCE: "@orghub_attendance",
      TRANSACTIONS: "@orghub_transactions",
      LOANS: "@orghub_loans",
      ACCOUNT_SETTINGS: "@orghub_account_settings",
    };

    const AVATAR_COLORS = ["#0D9488", "#F43F5E", "#8B5CF6", "#F59E0B", "#3B82F6", "#10B981", "#EC4899", "#6366F1"];

    function generateId(): string {
      return Date.now().toString() + Math.random().toString(36).substring(2, 11);
    }

    function randomColor(): string {
      return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    }

    // --- Members (Safe Version) ---
    export async function getMembers(): Promise<Member[]> {
      try {
        const data = await AsyncStorage.getItem(KEYS.MEMBERS);
        if (!data) return [];

        const members = JSON.parse(data);

        // ဒေတာအဟောင်း format ကို အသစ်သို့ ပြောင်းလဲခြင်း (အဝိုင်းလည်ခြင်းကို ဖြေရှင်းရန်)
        return members.map((m: any) => ({
          ...m,
          name: m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Unknown Member',
          avatarColor: m.avatarColor || randomColor(),
          status: m.status || "active"
        }));
      } catch (e) {
        console.error("Member loading error:", e);
        return [];
      }
    }

    export async function addMember(member: Omit<Member, "id">): Promise<Member> {
      const members = await getMembers();
      const newMember: Member = { ...member, id: generateId(), avatarColor: randomColor() };
      await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify([...members, newMember]));
      return newMember;
    }

    export async function updateMember(id: string, updates: Partial<Member>): Promise<void> {
      const members = await getMembers();
      const updated = members.map(m => m.id === id ? { ...m, ...updates } : m);
      await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(updated));
    }

    export async function deleteMember(id: string): Promise<void> {
      const members = await getMembers();
      await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(members.filter(m => m.id !== id)));
    }

    // --- Settings ---
    export async function getAccountSettings(): Promise<AccountSettings> {
      try {
        const data = await AsyncStorage.getItem(KEYS.ACCOUNT_SETTINGS);
        return data ? JSON.parse(data) : { 
          orgName: "", 
          currency: "MMK", 
          openingBalanceCash: 0, 
          openingBalanceBank: 0 
        };
      } catch (e) {
        return { orgName: "", currency: "MMK", openingBalanceCash: 0, openingBalanceBank: 0 };
      }
    }

    export async function updateAccountSettings(settings: AccountSettings): Promise<void> {
      await AsyncStorage.setItem(KEYS.ACCOUNT_SETTINGS, JSON.stringify(settings));
    }

    // --- Transactions, Events, Loans (လိုအပ်သော function များ) ---
    export async function getTransactions(): Promise<Transaction[]> {
      const data = await AsyncStorage.getItem(KEYS.TRANSACTIONS);
      return data ? JSON.parse(data) : [];
    }

    export async function addTransaction(t: Omit<Transaction, "id">): Promise<Transaction> {
      const transactions = await getTransactions();
      const newT: Transaction = { ...t, id: generateId() };
      await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify([...transactions, newT]));
      return newT;
    }

    export async function getEvents(): Promise<OrgEvent[]> {
      const data = await AsyncStorage.getItem(KEYS.EVENTS);
      return data ? JSON.parse(data) : [];
    }

    export async function getLoans(): Promise<Loan[]> {
      const data = await AsyncStorage.getItem(KEYS.LOANS);
      return data ? JSON.parse(data) : [];
    }

    export async function getAttendance(): Promise<AttendanceRecord[]> {
      const data = await AsyncStorage.getItem(KEYS.ATTENDANCE);
      return data ? JSON.parse(data) : [];
    }

    export function generateReceiptNumber(): string {
      return "REC-" + Date.now().toString().slice(-6);
    }
    await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify([...members, newMember]));
    return newMember;
  }

  export async function updateMember(id: string, updates: Partial<Member>): Promise<void> {
    const members = await getMembers();
    const updated = members.map(m => m.id === id ? { ...m, ...updates } : m);
    await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(updated));
  }

  export async function deleteMember(id: string): Promise<void> {
    const members = await getMembers();
    await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(members.filter(m => m.id !== id)));
  }

  // Events
  export async function getEvents(): Promise<OrgEvent[]> {
    const data = await AsyncStorage.getItem(KEYS.EVENTS);
    return data ? JSON.parse(data) : [];
  }

  export async function addEvent(event: Omit<OrgEvent, "id">): Promise<OrgEvent> {
    const events = await getEvents();
    const newEvent: OrgEvent = { ...event, id: generateId() };
    await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify([...events, newEvent]));
    return newEvent;
  }

  export async function updateEvent(id: string, updates: Partial<OrgEvent>): Promise<void> {
    const events = await getEvents();
    const updated = events.map(e => e.id === id ? { ...e, ...updates } : e);
    await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify(updated));
  }

  export async function deleteEvent(id: string): Promise<void> {
    const events = await getEvents();
    await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify(events.filter(e => e.id !== id)));
  }

  // Groups
  export async function getGroups(): Promise<Group[]> {
    const data = await AsyncStorage.getItem(KEYS.GROUPS);
    return data ? JSON.parse(data) : [];
  }

  export async function addGroup(group: Omit<Group, "id">): Promise<Group> {
    const groups = await getGroups();
    const newGroup: Group = { ...group, id: generateId() };
    await AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify([...groups, newGroup]));
    return newGroup;
  }

  export async function updateGroup(id: string, updates: Partial<Group>): Promise<void> {
    const groups = await getGroups();
    const updated = groups.map(g => g.id === id ? { ...g, ...updates } : g);
    await AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify(updated));
  }

  export async function deleteGroup(id: string): Promise<void> {
    const groups = await getGroups();
    await AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify(groups.filter(g => g.id !== id)));
  }

  // Attendance
  export async function getAttendance(): Promise<AttendanceRecord[]> {
    const data = await AsyncStorage.getItem(KEYS.ATTENDANCE);
    return data ? JSON.parse(data) : [];
  }

  export async function saveAttendance(eventId: string, memberId: string, status: "present" | "absent"): Promise<void> {
    let records = await getAttendance();
    // ရှိပြီးသား record ကို ဖယ်ထုတ်ပါ
    records = records.filter(r => !(r.eventId === eventId && r.id === memberId || r.memberId === memberId && r.eventId === eventId));

    // Present ဖြစ်မှသာ အသစ်ထည့်ပါ
    if (status === "present") {
      records.push({
        id: generateId(),
        eventId,
        memberId,
        date: new Date().toISOString(),
        status: "present"
      });
    }
    await AsyncStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(records));
  }

  // Transactions
  export async function getTransactions(): Promise<Transaction[]> {
    const data = await AsyncStorage.getItem(KEYS.TRANSACTIONS);
    return data ? JSON.parse(data) : [];
  }

  export async function addTransaction(t: Omit<Transaction, "id">): Promise<Transaction> {
    const transactions = await getTransactions();
    const newT: Transaction = { ...t, id: generateId() };
    await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify([...transactions, newT]));
    return newT;
  }

  export async function deleteTransaction(id: string): Promise<void> {
    const transactions = await getTransactions();
    await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(transactions.filter(t => t.id !== id)));
  }

  // Loans
  export async function getLoans(): Promise<Loan[]> {
    const data = await AsyncStorage.getItem(KEYS.LOANS);
    return data ? JSON.parse(data) : [];
  }

  export async function addLoan(loan: Omit<Loan, "id">): Promise<Loan> {
    const loans = await getLoans();
    const newLoan: Loan = { ...loan, id: generateId() };
    await AsyncStorage.setItem(KEYS.LOANS, JSON.stringify([...loans, newLoan]));
    return newLoan;
  }

  export async function updateLoan(id: string, updates: Partial<Loan>): Promise<void> {
    const loans = await getLoans();
    const updated = loans.map(l => l.id === id ? { ...l, ...updates } : l);
    await AsyncStorage.setItem(KEYS.LOANS, JSON.stringify(updated));
  }

  export async function deleteLoan(id: string): Promise<void> {
    const loans = await getLoans();
    await AsyncStorage.setItem(KEYS.LOANS, JSON.stringify(loans.filter(l => l.id !== id)));
  }

  // Settings
  export async function getAccountSettings(): Promise<AccountSettings> {
    const data = await AsyncStorage.getItem(KEYS.ACCOUNT_SETTINGS);
    return data ? JSON.parse(data) : { 
      orgName: "", 
      currency: "MMK", 
      openingBalanceCash: 0, 
      openingBalanceBank: 0 
    };
  }

  export async function updateAccountSettings(settings: AccountSettings): Promise<void> {
    await AsyncStorage.setItem(KEYS.ACCOUNT_SETTINGS, JSON.stringify(settings));
  }

  export function generateReceiptNumber(): string {
    return "REC-" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
  }
  groups[idx] = { ...groups[idx], ...updates };
  await AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify(groups));
  return groups[idx];
}

export async function deleteGroup(id: string): Promise<void> {
  const groups = await getGroups();
  await AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify(groups.filter((g) => g.id !== id)));
}

// Transactions
export async function getTransactions(): Promise<Transaction[]> {
  const data = await AsyncStorage.getItem(KEYS.TRANSACTIONS);
  return data ? JSON.parse(data) : [];
}

export async function saveTransaction(txn: Omit<Transaction, "id" | "createdAt">): Promise<Transaction> {
  const txns = await getTransactions();
  const newTxn: Transaction = { ...txn, id: generateId(), createdAt: new Date().toISOString() };
  txns.push(newTxn);
  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(txns));
  return newTxn;
}

export async function deleteTransaction(id: string): Promise<void> {
  const txns = await getTransactions();
  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(txns.filter((t) => t.id !== id)));
}

// Loans
export async function getLoans(): Promise<Loan[]> {
  const data = await AsyncStorage.getItem(KEYS.LOANS);
  return data ? JSON.parse(data) : [];
}

export async function saveLoan(loan: Omit<Loan, "id" | "createdAt">): Promise<Loan> {
  const loans = await getLoans();
  const newLoan: Loan = { ...loan, id: generateId(), createdAt: new Date().toISOString() };
  loans.push(newLoan);
  await AsyncStorage.setItem(KEYS.LOANS, JSON.stringify(loans));
  return newLoan;
}

export async function updateLoan(id: string, updates: Partial<Loan>): Promise<Loan | null> {
  const loans = await getLoans();
  const idx = loans.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  loans[idx] = { ...loans[idx], ...updates };
  await AsyncStorage.setItem(KEYS.LOANS, JSON.stringify(loans));
  return loans[idx];
}

export async function deleteLoan(id: string): Promise<void> {
  const loans = await getLoans();
  await AsyncStorage.setItem(KEYS.LOANS, JSON.stringify(loans.filter((l) => l.id !== id)));
}

// Settings
export async function getAccountSettings(): Promise<AccountSettings> {
  const data = await AsyncStorage.getItem(KEYS.ACCOUNT_SETTINGS);
  if (data) return JSON.parse(data);
  return { 
    openingBalanceCash: 0, 
    openingBalanceBank: 0, 
    currency: "MMK",
    asOfDate: new Date().toISOString() 
  };
}

export async function saveAccountSettings(settings: AccountSettings): Promise<void> {
  await AsyncStorage.setItem(KEYS.ACCOUNT_SETTINGS, JSON.stringify(settings));
}

// Attendance (လိုအပ်ပါက သုံးနိုင်ရန်)
export async function getAttendance(): Promise<AttendanceRecord[]> {
  const data = await AsyncStorage.getItem(KEYS.ATTENDANCE);
  return data ? JSON.parse(data) : [];
}
export function generateReceiptNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `RCP-${year}${random}`;
}
