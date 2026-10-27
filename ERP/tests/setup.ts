// Runs in each test file's worker BEFORE the file imports the server, so
// server.ts reads these values when it loads. The database copy itself is
// made lazily in helpers.startApp() — pure unit tests never need one.
process.env.NODE_ENV = "test";
// Embedded Postgres by default. Set TEST_DATABASE_URL (a superuser connection to a real
// PostgreSQL server, e.g. postgres://uib:uib_dev_password@localhost:5432/postgres) to run
// the whole suite against a real server instead — helpers.startApp() then gives every test
// file its own database cloned from a migrated template.
if (!process.env.TEST_DATABASE_URL) process.env.PGLITE_DEV = "true";
else process.env.PGLITE_DEV = "false"; // explicit, so dotenv cannot fill it in from .env
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
process.env.INTERNAL_API_KEY = "test-api-key-test-api-key-test-1234";
process.env.ALLOWED_ORIGIN = "http://localhost:3000";
