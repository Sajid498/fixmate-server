
# FixMate – Backend API

FixMate is a full-stack smart device and home appliance repair service platform. This repository contains the backend REST API responsible for authentication integration, user management, service management, repair bookings, technician workflows, administrator operations, image uploads, and payment processing.

## Live API

- Backend API: To be added after deployment.
- Health Check: `/api/health`

## Technology Stack

- Node.js
- Express.js
- TypeScript
- MongoDB Atlas
- Better Auth JWT integration
- JSON Web Tokens
- Stripe
- ImgBB
- Zod
- Helmet
- Express Rate Limit

## Main Features

### Authentication and Authorization
- JWT-based API authentication.
- Role-based authorization.
- Customer, technician, and administrator access control.
- Protected API endpoints.

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
- Search, filter, sorting, and pagination.

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
- Development-only payment simulation.
- Duplicate payment prevention.
- Atomic MongoDB payment recording.
- Customer payment history.
- Administrator payment reporting grouped by currency.

### Image Upload
- ImgBB image upload integration.
- Authenticated image upload endpoint.

## API Routes

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend and database health |
| GET | `/api/users/me` | Retrieve profile |
| PATCH | `/api/users/me` | Update profile |
| GET | `/api/services` | Browse approved services |
| GET | `/api/services/:id` | Service details |
| POST | `/api/services` | Create service |
| GET | `/api/services/mine` | Technician services |
| PUT | `/api/services/:id` | Update service |
| DELETE | `/api/services/:id` | Delete service |
| PATCH | `/api/services/:id/availability` | Update availability |
| POST | `/api/bookings` | Create repair booking |
| GET | `/api/bookings/mine` | Customer bookings |
| PATCH | `/api/bookings/:id/cancel` | Cancel booking |
| GET | `/api/technician/bookings` | Technician bookings |
| PATCH | `/api/technician/bookings/:id/status` | Update booking status |
| POST | `/api/payments/create-checkout-session` | Create checkout |
| GET | `/api/payments/verify` | Verify Stripe payment |
| POST | `/api/payments/development/confirm` | Confirm simulated payment |
| GET | `/api/payments/mine` | Customer payment history |
| POST | `/api/uploads/image` | Upload an image |

Administrator routes are available under `/api/admin`.

## Database Structure

The application uses MongoDB with four main business collections:

- `users`
- `services`
- `bookings`
- `payments`

Better Auth may also use its supporting authentication collections.

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

## Installation

### 1. Clone the repository

```bash
git clone YOUR_BACKEND_REPOSITORY_URL
cd fixmate-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
BETTER_AUTH_URL=http://localhost:3000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
IMGBB_API_KEY=
PAYMENT_MODE=development
PAYMENT_DEV_SIMULATOR=true
PAYMENT_CURRENCY=bdt
```

Use a strong authentication secret consistent with the frontend configuration wherever required by the authentication setup.

Never commit `.env` files or expose API keys.

### 4. Start development server

```bash
npm run dev
```

The backend runs at:

http://localhost:5000

### 5. Build for production

```bash
npm run build
```

### 6. Start production server

```bash
npm start
```

## Database Seeding

The project includes an idempotent demo seed script.

Before running it, create:

- Two technician accounts.
- One customer account.

Then run:

```bash
npx tsx scripts/seed.ts
```

The script creates 12 approved demo services and five sample bookings with different statuses. It uses existing registered accounts and preserves existing records.

## Booking Status Workflow

```text
requested
    |
    +----> rejected
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

Customers can cancel bookings only while they are requested.

## Payment Configuration

The backend supports Stripe Checkout and a development-only payment simulator.

- Stripe mode requires valid Stripe credentials.
- Development simulation is restricted to non-production environments.
- Payment amounts are determined by the booking stored in MongoDB.
- Duplicate payments are prevented.
- Payment records and booking payment status are updated atomically.

Never enable the development simulator in production.

## Deployment

The backend can be deployed to a Node.js hosting platform such as Render.

Deployment requirements:

1. Configure the production MongoDB connection.
2. Configure authentication URLs and secrets.
3. Configure the frontend origin in `CLIENT_URL`.
4. Configure Stripe credentials if Stripe payments are enabled.
5. Configure ImgBB credentials.
6. Disable the development simulator in production.
7. Verify the `/api/health` endpoint.

## Related Repository

Frontend repository: To be added.

## Project Status

Development and implementation are in progress. Final end-to-end testing, production configuration, and deployment will be completed before submission.