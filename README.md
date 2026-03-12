<p align="center">
  <h1 align="center">🏆 Nomini API</h1>
  <p align="center">
    Backend service for <strong>Nomini</strong> — a social voting platform where users predict winners for award shows like The Game Awards.
    <br />
    Cast your votes, compete on the leaderboard, and see how your picks stack up!
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Prisma-7.x-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/JWT-Auth-FB015B?style=for-the-badge&logo=jsonwebtokens&logoColor=white" alt="JWT" />
  <img src="https://img.shields.io/badge/Node.js-ES_Modules-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
</p>

---

## ✨ Features

- **User Authentication** — Register, login, and manage accounts with JWT-based auth and bcrypt-hashed passwords.
- **Voting System** — Cast one vote per category, update your picks, or remove them before voting closes.
- **Category & Nominee Management** — Browse award categories and their nominees, versioned by year.
- **Live Leaderboard** — Scored ranking of users based on correct predictions, with weighted categories.
- **Admin Panel** — Admins can declare winners, manage event dates, and configure categories.
- **Event Countdown** — Configurable event date that powers the client-side countdown timer.

---

## 🛠️ Tech Stack

| Layer         | Technology                                                   |
| ------------- | ------------------------------------------------------------ |
| **Runtime**   | [Node.js](https://nodejs.org/) (ES Modules)                 |
| **Framework** | [Express 5](https://expressjs.com/)                          |
| **ORM**       | [Prisma 7](https://www.prisma.io/) with `@prisma/adapter-pg`|
| **Database**  | [PostgreSQL](https://www.postgresql.org/) via [Neon](https://neon.tech/) |
| **Auth**      | [JSON Web Tokens](https://jwt.io/) + [bcryptjs](https://github.com/nicolo-ribaudo/bcryptjs) |

---

## 📁 Project Structure

```
nomini-api/
├── prisma/
│   ├── schema.prisma        # Database schema (6 models)
│   ├── seed.js               # Seeds categories & nominees from data.json
│   └── migrations/           # Prisma migration history
├── src/
│   ├── index.js              # Express app entry point
│   ├── prismaClient.js       # Prisma client singleton
│   ├── data.json             # Source data for seeding (categories & nominees)
│   ├── middleware/
│   │   ├── authMiddleware.js  # JWT verification
│   │   └── adminMiddleware.js # Admin role guard
│   └── routes/
│       ├── authRoutes.js      # Registration, login, profile, password
│       ├── votesRoutes.js     # CRUD for votes + statistics
│       ├── categoriesRoutes.js# Categories, nominees, winners
│       ├── leaderboardRoutes.js # Scored user rankings
│       └── eventRoutes.js     # Event date configuration
├── package.json
└── .env                       # Environment variables (not committed)
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **v18+**
- A [PostgreSQL](https://www.postgresql.org/) database (or a free [Neon](https://neon.tech/) instance)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/nomini-api.git
cd nomini-api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root:

```env
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
JWT_SECRET="your-super-secret-jwt-key"
ADMIN_KEY="your-admin-secret-key"
PORT=5000
```

| Variable       | Description                                              |
| -------------- | -------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string                             |
| `JWT_SECRET`   | Secret key used to sign and verify JWTs                  |
| `ADMIN_KEY`    | Reserved for admin operations                            |
| `PORT`         | Port the server listens on (default: `5000`)             |

### 4. Set up the database

```bash
# Generate the Prisma client
npx prisma generate

# Apply migrations to your database
npx prisma migrate deploy

# (Optional) Seed the database with 2025 categories & nominees
node prisma/seed.js
```

### 5. Start the server

```bash
# Development (with hot-reload via nodemon)
npm run dev

# Production
npm start
```

The API will be live at `http://localhost:5000`.

---

## 📖 API Reference

> All authenticated endpoints require a JWT token in the `Authorization` header:
> ```
> Authorization: Bearer <token>
> ```

### Health Check

| Method | Endpoint | Auth | Description         |
| ------ | -------- | ---- | ------------------- |
| `GET`  | `/`      | ❌   | API status check    |

---

### 🔐 Auth — `/auth`

| Method | Endpoint               | Auth | Description                     |
| ------ | ---------------------- | ---- | ------------------------------- |
| `POST` | `/auth/register`       | ❌   | Register a new user             |
| `POST` | `/auth/login`          | ❌   | Login and receive a JWT         |
| `GET`  | `/auth/me`             | ✅   | Get current user's profile      |
| `PUT`  | `/auth/change-password`| ✅   | Update the current user's password |

<details>
<summary><strong>Request / Response examples</strong></summary>

**Register**
```json
POST /auth/register
{
  "username": "Gilgamesh",
  "email": "gilgamesh@gmail.com",
  "password": "123123123"
}

// → 200 { "token": "eyJhbGciOiJIUzI1NiIs..." }
```

**Login**
```json
POST /auth/login
{
  "username": "Gilgamesh",
  "password": "123123123"
}

// → 200 { "token": "eyJhbGciOiJIUzI1NiIs..." }
```

**Get Profile**
```
GET /auth/me
Authorization: Bearer <token>

// → 200 { "username": "Gilgamesh", "email": "gilgamesh@gmail.com", "admin": false }
```

**Change Password**
```json
PUT /auth/change-password
Authorization: Bearer <token>
{
  "currentPassword": "123123123",
  "newPassword": "newSecurePassword"
}

// → 200 { "message": "Password updated successfully" }
```

</details>

---

### 🗳️ Votes — `/votes`

> All vote endpoints require authentication. Voting is automatically closed once the event starts.

| Method   | Endpoint       | Auth | Description                      |
| -------- | -------------- | ---- | -------------------------------- |
| `GET`    | `/votes/user`  | ✅   | Get all votes for current user   |
| `GET`    | `/votes/stats` | ✅   | Aggregated vote counts per category |
| `POST`   | `/votes`       | ✅   | Cast a vote (one per category)   |
| `PUT`    | `/votes/:id`   | ✅   | Update an existing vote          |
| `DELETE` | `/votes/:id`   | ✅   | Delete a vote                    |

<details>
<summary><strong>Request / Response examples</strong></summary>

**Cast a Vote**
```json
POST /votes
Authorization: Bearer <token>
{
  "category": "Game of the Year",
  "nominee": "Clair Obscur: Expedition 33"
}

// → 201 { "message": "Vote cast successfully", "vote": { ... } }
```

**Update a Vote**
```json
PUT /votes/1
Authorization: Bearer <token>
{
  "nominee": "Hades II"
}

// → 200 { "message": "Vote updated successfully" }
```

</details>

---

### 📂 Categories — `/categories`

| Method | Endpoint                    | Auth   | Description                          |
| ------ | --------------------------- | ------ | ------------------------------------ |
| `GET`  | `/categories`               | ❌     | List categories (latest year or `?year=`) |
| `GET`  | `/categories/years`         | ❌     | List all available years             |
| `GET`  | `/categories/:id/nominees`  | ❌     | Get nominees for a category          |
| `POST` | `/categories/winner`        | ✅🛡️  | Set the winner for a category (admin) |

<details>
<summary><strong>Request / Response examples</strong></summary>

**Get Categories**
```
GET /categories?year=2025

// → 200 [{ "id": 1, "title": "Game of the Year", "description": "...", "weight": 3, "year": 2025 }, ...]
```

**Set Winner (admin)**
```json
POST /categories/winner
Authorization: Bearer <admin-token>
{
  "category": "Game of the Year",
  "nominee": "Clair Obscur: Expedition 33"
}

// → 200 { "message": "Winner set for Game of the Year: Clair Obscur: Expedition 33" }
```

</details>

---

### 🏅 Leaderboard — `/leaderboard`

| Method | Endpoint        | Auth | Description                              |
| ------ | --------------- | ---- | ---------------------------------------- |
| `GET`  | `/leaderboard`  | ✅   | Global leaderboard (or `?year=` filter)  |

<details>
<summary><strong>Response example</strong></summary>

```json
GET /leaderboard?year=2025

// → 200
[
  { "id": 1, "username": "Gilgamesh", "points": 12 },
  { "id": 3, "username": "Enkidu", "points": 9 },
  { "id": 2, "username": "Ishtar", "points": 5 }
]
```

Points are calculated by matching each user's votes against declared winners, weighted by category importance.

</details>

---

### 📅 Event — `/event`

| Method | Endpoint | Auth   | Description                         |
| ------ | -------- | ------ | ----------------------------------- |
| `GET`  | `/event` | ❌     | Get the current event date          |
| `POST` | `/event` | ✅🛡️  | Set or clear the event date (admin) |

<details>
<summary><strong>Request / Response examples</strong></summary>

**Set Event Date (admin)**
```json
POST /event
Authorization: Bearer <admin-token>
{
  "eventDate": "2025-12-11T21:30:00-03:00"
}

// → 200 { "message": "Event date set to 2025-12-11T00:30:00.000Z", "eventDate": "..." }
```

**Clear Event Date (TBA)**
```json
POST /event
Authorization: Bearer <admin-token>
{
  "eventDate": null
}

// → 200 { "message": "Event date set to TBA", "eventDate": null }
```

</details>

---

## 🗄️ Database Schema

```mermaid
erDiagram
    User ||--o{ Vote : "has many"
    Category ||--o{ Nominee : "has many"

    User {
        int id PK
        string username UK
        string email
        string password
        boolean admin
    }

    Vote {
        int id PK
        string category
        string nominee
        int userId FK
    }

    Category {
        int id PK
        string title
        string description
        int weight
        int year
    }

    Nominee {
        int id PK
        string name
        string publisher
        string genre
        string description
        string image
        int categoryId FK
    }

    Winner {
        int id PK
        string category UK
        string nominee
    }

    EventConfig {
        int id PK
        datetime eventDate
    }
```

---

## 🔒 Authentication & Authorization

| Layer            | Mechanism                                          |
| ---------------- | -------------------------------------------------- |
| **Password**     | Hashed with `bcryptjs` (salt rounds: 8)            |
| **Token**        | JWT signed with `JWT_SECRET`, expires in 1 hour    |
| **Auth Guard**   | `authMiddleware` — verifies JWT, attaches `userId`  |
| **Admin Guard**  | `adminMiddleware` — checks `user.admin === true`    |
| **Vote Locking** | Voting is automatically closed once the event date is reached |

---

## 📜 License

This project is licensed under the [ISC License](https://opensource.org/licenses/ISC).
