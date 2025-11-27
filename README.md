# Game Awards Sweepstake - Backend 🚀

This is the backend API for the Game Awards Sweepstake application. It handles user authentication, vote storage, and serving category data.

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (JSON Web Tokens)

## Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd goty-api
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Variables**:
    Create a `.env` file in the root directory and add the following:
    ```env
    DATABASE_URL="postgresql://user:password@localhost:5432/goty_db"
    JWT_SECRET="your_secret_key"
    PORT=5000
    ```

4.  **Database Setup**:
    Run migrations to set up the database schema:
    ```bash
    npx prisma migrate dev --name init
    ```

5.  **Run the server**:
    ```bash
    npm run dev
    ```
    The server will start on `http://localhost:5000`.

## API Endpoints

### Authentication
- `POST /auth/register`: Register a new user.
- `POST /auth/login`: Login and receive a JWT token.

### Categories & Nominees
- `GET /categories`: Get a list of all categories.
- `GET /categories/:id/nominees`: Get nominees for a specific category.

### Votes
- `GET /votes/user`: Get all votes for the authenticated user.
- `POST /votes`: Cast a vote for a category.
    - Body: `{ "category": "Category Name", "nominee": "Nominee Name" }`
- `PUT /votes/:id`: Update an existing vote.
- `DELETE /votes/:id`: Remove a vote.

### Leaderboard
- `GET /leaderboard`: Get the current leaderboard standings.

## Data Source
The category and nominee data is stored in `src/data.json` and served via the `/categories` endpoints.

## License
This project is licensed under the MIT License.
