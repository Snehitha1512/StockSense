# StockSense — Modern Inventory Management System

**StockSense** is a centralized, real-time inventory management application engineered for modern warehouses, multi-facility stock visibility, and audit-compliant supply chain tracking.

---

## 🌟 Key Features

### 1. Multi-Tab Session Isolation
- Individual browser tabs operate independently with tab-isolated `sessionStorage` authentication.
- Cryptographically secure 32-byte tokens hashed via **SHA-256** before storage in SQLite (`sessions` table).
- Full concurrent login support: open an **Inventory Manager** session in Tab 1 and a **Warehouse Staff** session in Tab 2 simultaneously without cross-tab session collisions or token overwrites.

### 2. Comprehensive Role-Based Access Control (RBAC)
- **Inventory Manager**:
  - Full enterprise-wide stock visibility and multi-warehouse oversight.
  - Create and manage master data (Warehouses, Locations, Products, Categories).
  - Create and manage Receipts, Delivery Orders, and Internal Transfers.
  - Exclusive authority to validate physical inventory count adjustments (`adjustments.validate`).
- **Warehouse Staff**:
  - Automatically scoped to assigned warehouse facility (`user_warehouse_assignments`).
  - View stock and intake incoming receipts (`receipts.operate`).
  - Pick, pack, and validate outgoing deliveries (`deliveries.operate`).
  - Move stock across locations within assigned warehouse (`transfers.operate`).
  - Conduct physical inventory counts and save adjustment **Drafts** (`adjustments.create`).
  - Restricted actions (`+ New Receipt`, `+ New Delivery`, Settings) are suppressed from UI rendering and enforced via HTTP 403 on the backend.

### 3. Inventory Operations & Core Ledger
- **Receipts**: Inbound purchase receipt workflows (Draft $\rightarrow$ Waiting $\rightarrow$ Ready $\rightarrow$ Done).
- **Delivery Orders**: Outbound sales dispatch with real-time on-hand stock validation.
- **Internal Transfers**: Intra-facility stock reallocation without impacting enterprise total balances.
- **Stock Adjustments**: Reconcile physical inventory counts against system records with automated difference calculation.
- **Move History**: Immutable double-entry audit ledger recording every inventory transaction, timestamp, operator, and location.

### 4. Secure Cryptographic Email OTP Password Reset
- Cryptographically secure 6-digit numeric verification codes.
- Stored as SHA-256 HMAC hashes using dedicated `OTP_HMAC_SECRET`.
- Time-based expiration (10 min), rate limiting (60s cooldown, max 3/15 min), single-use invalidation, constant-time timing-safe comparison, and enumeration defense.

---

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (via `@libsql/client`)
- **Icons**: Lucide React
- **Email Service**: Nodemailer (with test mailbox fallback)
- **Authentication**: Tab-isolated Bearer token authentication with SHA-256 SQLite hashing

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/snehitha-demo/StockSense.git
cd StockSense
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local` and configure your credentials:
```bash
cp .env.example .env.local
```

### 3. Initialize & Seed Database
```bash
npx tsx -e "import { seedDatabase } from './src/lib/seed'; seedDatabase(true).then(() => console.log('Seeded successfully'));"
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 👥 Default Demo Credentials

| Role | Email | Password | Assigned Warehouse |
|---|---|---|---|
| **Inventory Manager** | `manager@stocksense.com` | `password123` | Global (All Warehouses) |
| **Warehouse Staff** | `staff@stocksense.com` | `password123` | Main Warehouse (`WH`) |

---

## 🧪 Testing & Verification

Run the automated test suites:

```bash
# Tab-isolated sessions, RBAC UI visibility, and Staff adjustment drafts
npx tsx tests/verify-multitab-rbac-adjustments.ts

# RBAC permissions, warehouse scoping, and Email OTP lifecycle
npx tsx tests/verify-rbac-scoping-otp.ts

# Production Next.js build
npm run build
```

---

## 📄 License
MIT
