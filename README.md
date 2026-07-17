# User Payout Management System - SDE Intern Assignment

A comprehensive backend solution built in **JavaScript (Node.js, Express, and MongoDB/Mongoose)** for managing user payouts for affiliate sales. This repository fulfills the requirements of the SDE Intern Assignment, covering Low-Level Design (LLD), database schemas, class relationships, API development, business rules enforcement, edge cases, and failed payout recovery.

---

## Features

- **Advance Payout Job**: Automates a 10% advance payout of earnings for eligible `pending` sales. Ensures that each sale is only processed **once** for advance payout, even if the job runs multiple times.
- **Admin Reconciliation**: Reconciles pending sales to `approved` or `rejected` status and updates the user's withdrawable balance atomically.
  - **Approved**: Remaining payout (`earning - advancePaid`) is credited to the user's withdrawable balance.
  - **Rejected**: The advance payout received by the user (`-advancePaid`) is adjusted (debited) from the user's withdrawable balance.
- **Withdrawal Restrictions**: Limits users to a **maximum of one withdrawal request every 24 hours**.
- **Failed Payout Recovery (Question 2)**: Reclaims failed, cancelled, or rejected payout transactions.
  - Credits the failed amount back into the user's withdrawable balance.
  - Resets the 24-hour limit constraint, allowing the user to request a withdrawal again.
- **Robust Concurrency Control**: Uses MongoDB/Mongoose atomic operations (`findOneAndUpdate`) and database transactions (`session.startTransaction()`) to guarantee state consistency and prevent double-withdrawal or double-reconciliation race conditions.

---

## Tech Stack

- **Core**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (Object modeling using Mongoose)
- **Testing**: Jest & Supertest

---

## Getting Started

### 1. Installation

Clone this repository to your local system and install the dependencies:

```bash
npm install
```

### 2. Configuration (`.env`)

Create a `.env` file in the root directory (one is already prepared for you) with the following environment variables:

```env
PORT=3000
MONGODB_URI="Add your MongoDB_URL"
```

*(The MONGODB_URI points to the user-supplied MongoDB Atlas cluster and automatically creates the target databases `payout_db` for development and `payout_db_test` for automated tests).*

### 3. Run Development Server

Start the local server with hot-reloading:

```bash
npm run dev
```

The server will listen at `http://localhost:3000`.

### 4. Run Automated Tests

To execute the test suite (covering Question 1, Question 2, withdrawal restrictions, and recovery):

```bash
npm run test
```

---

## Low-Level Design (LLD)

The complete low-level design document, including architectural design, ER diagrams, sequence diagrams, and class mappings using Mermaid, is located in [lld.md](file:///d:/Samagra%20Jaiswal/Postfaym/lld.md).

---

## API Documentation

### 1. Sales Endpoints

#### Create a Sale
- **POST** `/api/sales`
- **Request Body**:
  ```json
  {
    "userId": "john_doe",
    "brand": "brand_1",
    "earning": 40
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "_id": "64b1f41d9ef19e4a3b8e8f81",
    "userId": "john_doe",
    "brand": "brand_1",
    "earning": 40,
    "status": "pending",
    "advancePaid": 0,
    "advanceStatus": "none",
    "reconciled": false,
    "createdAt": "2026-07-17T16:04:40.000Z",
    "updatedAt": "2026-07-17T16:04:40.000Z"
  }
  ```

#### List All Sales
- **GET** `/api/sales`
- **Response** (`200 OK`): Array of sales documents.

#### Run Advance Payout Job
- **POST** `/api/sales/advance-job`
- **Request Body** (optional): `{ "forceSuccess": true }` (set `false` to simulate payout transfer failures).
- **Description**: Runs the job to calculate and transfer 10% advance payout for all `pending` sales that have `advanceStatus` as `'none'`.
- **Response** (`200 OK`):
  ```json
  {
    "message": "Advance payout job execution completed",
    "result": {
      "totalEligible": 3,
      "successCount": 3,
      "failedCount": 0,
      "payouts": [...]
    }
  }
  ```

#### Reconcile a Sale (Admin Only)
- **POST** `/api/sales/reconcile/:saleId`
- **Request Body**:
  ```json
  {
    "status": "approved" 
  }
  ```
  *(Status must be either `"approved"` or `"rejected"`)*
- **Response** (`200 OK`):
  ```json
  {
    "message": "Sale 64b1f41d9ef19e4a3b8e8f81 reconciled to approved status successfully",
    "sale": {
      "_id": "64b1f41d9ef19e4a3b8e8f81",
      "userId": "john_doe",
      "brand": "brand_1",
      "status": "approved",
      "advancePaid": 4,
      "reconciled": true
    },
    "adjustment": 36,
    "newBalance": 36
  }
  ```

#### Seed Test Data (Helper Route)
- **POST** `/api/sales/seed`
- **Description**: Resets database collections and inserts the 3 pending sales for user `john_doe` matching the example in the PDF.
- **Response** (`201 Created`)

---

### 2. User & Wallet Endpoints

#### Get User Balance
- **GET** `/api/users/:userId/balance`
- **Response** (`200 OK`):
  ```json
  {
    "userId": "john_doe",
    "withdrawableBalance": 68,
    "lastWithdrawalAt": "2026-07-17T16:05:00.000Z"
  }
  ```

#### Request Withdrawal
- **POST** `/api/users/:userId/withdraw`
- **Request Body**:
  ```json
  {
    "amount": 50
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "message": "Withdrawal initiated successfully",
    "payout": {
      "_id": "64b1f41d9ef19e4a3b8e8f85",
      "userId": "john_doe",
      "amount": 50,
      "type": "withdrawal",
      "status": "pending",
      "createdAt": "2026-07-17T16:05:00.000Z"
    }
  }
  ```

---

### 3. Payout & Recovery Endpoints

#### List Payouts
- **GET** `/api/payouts`
- **Query Parameters** (optional): `userId=john_doe`, `type=withdrawal` or `type=advance`
- **Response** (`200 OK`): Array of payouts.

#### Update Payout Status (Simulate Payment Gateway Webhook)
- **POST** `/api/payouts/:payoutId/status`
- **Request Body**:
  ```json
  {
    "status": "failed" 
  }
  ```
  *(Can be `"completed"`, `"failed"`, `"cancelled"`, or `"rejected"`)*
- **Description**: Simulates feedback from payment processors. Updating a pending withdrawal payout status to `'failed'`, `'cancelled'`, or `'rejected'` triggers the recovery logic, refunding the amount back to the user's wallet balance and clearing the 24h block.
- **Response** (`200 OK`):
  ```json
  {
    "message": "Payout status updated to failed successfully",
    "payout": {
      "_id": "64b1f41d9ef19e4a3b8e8f85",
      "status": "failed"
    }
  }
  ```

---

## Edge Cases Handled

1. **Floating-point Inaccuracy**: Double arithmetic in JS (e.g. `40 * 0.1`) can lead to floats like `4.000000000000004`. All monetary math is rounded to 2 decimal places using `Math.round(val * 100) / 100` before db writes.
2. **Double Payout Prevention**: Sale `advanceStatus` uses an atomic `findOneAndUpdate` lock transition: `none` -> `pending` -> `paid`/`failed`. Two worker instances running the advance payout job concurrently cannot double-pay any sale.
3. **Double Reconciliation**: If an administrator attempts to reconcile a sale that has already been reconciled, the request is rejected with a `400 Bad Request` and `already reconciled` error.
4. **Transaction Rollbacks**: If balance deduction succeeds but writing the payout record fails (or vice versa), the database transaction aborts and rolls back all operations, ensuring zero mismatch between ledger entries and wallet balance.
5. **Withdrawal Unlock on Failure**: The 24-hour limit check queries only `pending` or `completed` withdrawals. When a withdrawal status changes to `failed`, `cancelled`, or `rejected`, the withdrawal amount is credited back to the user's balance and they can withdraw again immediately.
