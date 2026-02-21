# Social Org Manager (OrgHub) 📱

**Social Org Manager** is a comprehensive mobile and web application designed to manage social organizations, charities, or micro-finance groups efficiently. It handles member management, financial transactions, loans, and reporting.

> **Project Owner & Developer**: MR. SOE MYINT SWE  
> **Assisted by**: Gemini AI (Google)

---

## 🚀 Features

- **Dashboard**: Real-time overview of members, total balance, loan outstanding, and recent activities.
- **Member Management**: Add, edit, and manage member profiles with photos and detailed information.
- **Financial Management**: 
  - Track Income & Expenses (Cash/Bank).
  - Manage Bank Transfers (Deposit/Withdraw).
  - Record Member Fees (Monthly/Yearly).
- **Loan Management**: 
  - Issue loans with interest rates.
  - Track repayments and calculate outstanding balances automatically.
- **Events & News**:
  - Manage organization activities, news, and announcements.
  - Attach images to events.
- **Tools**:
  - QR Code Scanner for quick member lookup.
  - Digital Member Cards with QR codes.
- **Reports**: 
  - Income/Expense Statements.
  - Loan Status Reports.
  - Member Fee Payment Tables.
- **Data Management**: 
  - Full System Backup & Restore (JSON format).
  - Offline-first architecture (Local Storage).

---

## 🛠 Tech Stack

- **Framework**: React Native (Expo)
- **Language**: TypeScript
- **Routing**: Expo Router
- **Storage**: AsyncStorage (Local Persistence)
- **UI**: Custom Styles with Vector Icons

---

## ℹ️ System Information

- **App Name**: Social Org Manager (OrgHub)
- **Package ID**: `com.soemyintswe.orghub`
- **Current Release**: `1.1.15`
- **Release Date**: `2026-02-21`
- **Project Owner & Developer**: MR. SOE MYINT SWE
- **Copyright**: Copyright (c) 2026 Social Org Manager. All rights reserved.

---

## 🔐 Repository Data Policy

- This GitHub repository is maintained as a **clean app source template**.
- Personal/organization runtime data (sync snapshot, backups, private exports) is **not tracked** in Git.
- Local data is stored on device/server runtime only and should be backed up separately.

---

## 📱 Installation & Usage

To run this project locally, follow these steps:

### Prerequisites
- Node.js installed on your computer.
- Expo Go app installed on your phone (for mobile testing).

### Steps

1.  **Clone the repository**
    ```bash
    git clone https://github.com/your-username/social-org-manager.git
    cd social-org-manager
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run the App**
    ```bash
    npx expo start
    ```
    - Press `w` to run on Web Browser.
    - Scan the QR code with **Expo Go** to run on Android/iOS.

---

## ☁️ Google Drive Cloud Sync (MVP)

- Cloud sync is available via Google Apps Script Web App endpoint.
- Setup guide: `docs/google-drive-cloud-sync-mvp.md`
- Script template: `docs/google-drive-cloud-sync-webapp.gs`
- After setup, phones can sync without running LAN server on a computer.

---

## 📝 License

This project is developed by **MR. SOE MYINT SWE**.  
Feel free to use this for educational purposes or adapt it for your organization.
