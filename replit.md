# OrgHub - Organization Management App

## Overview

OrgHub is a cross-platform organization management application built with Expo (React Native) and an Express backend. It helps manage members, events, groups, finances (transactions and loans), attendance tracking, and reporting for community organizations. The app runs on iOS, Android, and Web platforms.

The app currently uses **AsyncStorage for local data persistence** on the client side, with a server-side Express backend that has basic scaffolding (user schema with Drizzle/PostgreSQL) but routes are mostly empty. The primary data flow is client-side through a React Context (`DataContext`) that wraps AsyncStorage operations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo/React Native)

- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture
- **Routing**: Expo Router v6 with file-based routing and typed routes
  - Tab navigation with 5 tabs: Dashboard, Members, Finance, Reports, Events
  - Modal screens for adding entities (members, events, groups, transactions, loans)
  - Detail screens for viewing/editing individual records
  - Supports native tab layout (iOS SF Symbols) with classic tab fallback
- **State Management**: React Context (`DataContext`) provides all CRUD operations and computed values (balances, loan outstanding, etc.) to the entire app
- **Data Storage**: AsyncStorage with JSON serialization — all data (members, events, groups, attendance, transactions, loans, account settings) stored locally under `@orghub_*` keys
- **Styling**: StyleSheet-based with a centralized color system (`constants/colors.ts`) using a teal/navy/slate palette
- **Fonts**: Inter font family (Regular, Medium, SemiBold, Bold) via `@expo-google-fonts/inter`
- **Key Libraries**: React Query (configured but primarily used for potential API calls), react-native-gesture-handler, react-native-reanimated, react-native-keyboard-controller, expo-haptics

### Backend (Express)

- **Framework**: Express 5 with TypeScript, compiled via esbuild for production
- **Database Schema**: Drizzle ORM with PostgreSQL — currently only has a `users` table (id, username, password)
- **Storage Layer**: `MemStorage` class (in-memory) implementing an `IStorage` interface for users — designed to be swapped to database-backed storage
- **API Routes**: Registered under `/api` prefix but currently empty — the `registerRoutes` function in `server/routes.ts` creates an HTTP server but defines no endpoints
- **CORS**: Configured to allow Replit domains and localhost origins for Expo web development
- **Static Serving**: In production, serves pre-built Expo web assets; in development, proxies to Metro bundler

### Data Model (Client-Side Types in `lib/types.ts`)

- **Member**: firstName, lastName, email, phone, role (admin/member/volunteer), status, groupIds, avatarColor
- **OrgEvent**: title, description, date, time, location, attendeeIds
- **Group**: name, description, color, memberIds
- **Transaction**: type (income/expense), category, amount, description, date, paymentMethod (cash/bank), memberId, receiptNumber
- **Loan**: memberId, principal, interestRate, issueDate, description, status
- **AttendanceRecord**: eventId, memberId, present
- **AccountSettings**: openingBalanceCash, openingBalanceBank, asOfDate

### Build & Development

- **Dev mode**: Runs Expo Metro bundler + Express server concurrently; Express proxies to Metro for web
- **Production build**: Expo static web build (`scripts/build.js`) + esbuild for server; Express serves built assets
- **Database migrations**: `drizzle-kit push` using `DATABASE_URL` environment variable

## External Dependencies

- **PostgreSQL**: Required for Drizzle ORM schema (currently only `users` table). Connection via `DATABASE_URL` environment variable. The client-side app data is NOT yet persisted to PostgreSQL — it uses AsyncStorage locally.
- **AsyncStorage**: `@react-native-async-storage/async-storage` for all client-side data persistence
- **Expo Services**: Various Expo modules (haptics, image picker, location, splash screen, etc.)
- **No external APIs or auth services** are currently integrated — there's no authentication flow implemented yet despite the user schema existing in the database