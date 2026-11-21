# FixMate – Backend REST API

This repository contains the backend REST API for FixMate, a smart device and home appliance repair platform.

The backend handles service management, repair bookings, user and role management, technician workflows, image uploads, and payment processing.

## Live API

- **Backend API:** https://fixmate-server-fqv6.onrender.com
- **Health Check:** https://fixmate-server-fqv6.onrender.com/api/health

## Repository Links

- **Backend:** https://github.com/Sajid498/fixmate-server
- **Frontend:** https://github.com/Sajid498/fixmate-client
- **Live Frontend:** https://fixmate-client-mu.vercel.app

## Technology Stack

| Category | Technologies |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Language | TypeScript |
| Database | MongoDB Atlas |
| Authentication | Better Auth JWT integration |
| Authorization | Role-based middleware |
| Payments | Stripe |
| Image Hosting | ImgBB |
| Validation | Zod |
| Security | Helmet, Express Rate Limit |

## Main Features

### Authentication and Authorization
- JWT-based API authentication.
- Role-based authorization.
- Customer, technician, and administrator access control.
- Protected API endpoints.
- Ownership verification for protected resources.

### User Management
- Retrieve authenticated user profiles.
- Update profile information.
- Administrator role management.

### Service Management
- Create repair services.
- Retrieve approved and available services.
- Retrieve technician-owned services.
- Update and delete owned services.
- Manage service availability.
- Administrator service approval and rejection.
- Search, filtering, sorting, and pagination support.

### Booking Management
- Customer repair requests.
- Technician booking management.
- Booking ownership verification.
- Duplicate active booking prevention.
- Customer cancellation restrictions.
- Technician booking status transitions.
- Final repair amount management.

### Payment Management
- Stripe Checkout session creation.
- Stripe payment verification.
- Stripe webhook handling.
- Development-only payment simulation.
- Duplicate payment prevention.
- Atomic MongoDB payment recording.
- Customer payment history.
- Administrator payment reporting grouped by currency.

### Image Upload
- ImgBB image hosting integration.
- Authenticated image upload endpoint.

## API Endpoints

The following table summarizes the main API endpoints.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend and database health |
| GET | `/api/users/me` | Retrieve authenticated profile |
| PATCH | `/api/users/me` | Update profile |
| GET | `/api/services` | Browse approved services |
| GET | `/api/services/:id` | Retrieve service details |
| POST | `/api/services` | Create a service |
| GET | `/api/services/mine` | Retrieve technician's services |
| PUT | `/api/services/:id` | Update owned service |
| DELETE | `/api/services/:id` | Delete owned service |
| PATCH | `/api/services/:id/availability` | Update service availability |
| POST | `/api/bookings` | Create a repair booking |
| GET | `/api/bookings/mine` | Retrieve customer bookings |
| PATCH | `/api/bookings/:id/cancel` | Cancel an eligible booking |
| GET | `/api/technician/bookings` | Retrieve technician bookings |
| PATCH | `/api/technician/bookings/:id/status` | Update booking status |
| POST | `/api/payments/create-checkout-session` | Create Stripe Checkout session |
| GET | `/api/payments/verify` | Verify payment |
| POST | `/api/payments/webhook` | Process Stripe webhook events |
| POST | `/api/payments/development/confirm` | Confirm simulated payment |
| GET | `/api/payments/mine` | Retrieve customer payment history |
| POST | `/api/uploads/image` | Upload an image |

Administrator endpoints are grouped under `/api/admin`.

Protected endpoints require valid authentication and the appropriate role or resource ownership.

## Database Structure

FixMate uses MongoDB with four main business collections:

| Collection | Purpose |
|---|---|
| `users` | Customer, technician, and administrator information |
| `services` | Repair service information and approval status |
| `bookings` | Customer repair requests and booking progress |
| `payments` | Payment records and transaction information |

Better Auth may also use supporting authentication collections.

## Project Structure

```text
fixmate-server/
├── scripts/
│   └── seed.ts
├── src/
│   ├── config/
│   │   └── database.ts
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   └── authorize.ts
│   ├── routes/
│   │   ├── admin.routes.ts
│   │   ├── booking.routes.ts
│   │   ├── payment.routes.ts
│   │   ├── service.routes.ts
│   │   ├── technician-booking.routes.ts
│   │   ├── upload.routes.ts
│   │   └── user.routes.ts
│   └── server.ts
├── .env.example
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js and npm.
- MongoDB Atlas account or a compatible MongoDB instance.
- Stripe test account for payment testing.
- ImgBB API key for image uploads.

### 1. Clone the repository

```bash
git clone https://github.com/Sajid498/fixmate-server.git
cd fixmate-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

Use the repository's `.env.example` as the source of truth for the complete list of required variables.

The following illustrates the main configuration values:

```env
NODE_ENV=development
PORT=5000

CLIENT_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000

MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING

STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=YOUR_STRIPE_WEBHOOK_SECRET

IMGBB_API_KEY=YOUR_IMGBB_API_KEY

PAYMENT_MODE=development
PAYMENT_DEV_SIMULATOR=true
PAYMENT_CURRENCY=bdt
```

**Security notes:**
- Use strong secrets and valid service credentials.
- Never commit `.env` files.
- Do not expose Stripe secret keys, webhook secrets, or MongoDB credentials.
- Use Stripe test credentials during development.
- Disable the development payment simulator in production.
- Configure the frontend origin correctly for CORS.

### 4. Start the development server

```bash
npm run dev
```

The local API is available at:

`http://localhost:5000`

### 5. Build for production

```bash
npm run build
```

### 6. Start the production server

```bash
npm start
```

## Database Seeding

The repository includes a demo seed script at:

`scripts/seed.ts`

Prepare the required registered accounts before running the seed script:

- At least two technician accounts.
- At least one customer account.

Run:

```bash
npx tsx scripts/seed.ts
```

According to the seed script's intended setup, it creates:

- 12 approved demonstration services.
- Five sample bookings with different statuses.

Review the seed script before running it against an existing production database. Confirm its account matching and duplicate-handling behavior, and use dedicated demonstration accounts.

## Booking Status Workflow

```text
requested
    |
    +------> rejected
    |
    v
 accepted
    |
    v
in-progress
    |
    v
 completed
    |
    v
  payment
```

Booking transitions are validated by the backend.

- Customers can cancel only bookings that are still `requested`.
- Technicians manage the status of their own bookings.
- A final repair amount is required for completion.
- Payment is available only for eligible completed bookings.

## Payment Configuration

FixMate supports Stripe Checkout and a development-only payment simulator.

### Stripe Payment Mode

Configure the Stripe secret key and webhook signing secret in the backend environment.

The deployed webhook endpoint is:

`https://fixmate-server-fqv6.onrender.com/api/payments/webhook`

The Stripe destination should be configured to send the required Checkout completion event to this endpoint.

### Payment Safety

- Payment amounts are determined by server-side booking data.
- Payment verification is performed by the backend.
- Duplicate payments are prevented.
- Payment and booking updates use atomic database operations.
- The development simulator must not be enabled in production.

## Deployment

The backend is deployed on Render.

- **Production API:** https://fixmate-server-fqv6.onrender.com
- **Health Check:** https://fixmate-server-fqv6.onrender.com/api/health

### Deployment Checklist

1. Configure the production MongoDB connection.
2. Set the correct production environment variables.
3. Configure authentication URLs and secrets.
4. Allow the deployed frontend origin.
5. Configure Stripe credentials and webhook signing secret.
6. Configure ImgBB credentials.
7. Disable the development payment simulator.
8. Verify the health endpoint.
9. Test authentication, service management, bookings, and payments.

## Demo Accounts

Use dedicated demonstration accounts for evaluation.

| Role | Email | Password |
|---|---|---|
| Admin | Add verified demo email | Share securely |
| Technician | Add verified demo email | Share securely |
| Customer | Add verified demo email | Share securely |

Provide working demonstration credentials to the evaluator through the required submission channel. Do not publish private production credentials in this repository.

## Project Status

The FixMate backend is deployed and connected to the production frontend.

- API: https://fixmate-server-fqv6.onrender.com
- Frontend: https://fixmate-client-mu.vercel.app
- Source code: https://github.com/Sajid498/fixmate-server

