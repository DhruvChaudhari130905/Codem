// Point every test at the isolated test database and Redis db 1 before any module reads env.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://codem:codem@127.0.0.1:5432/codem_test'
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1'
process.env.GOOGLE_CLIENT_ID = ''
process.env.SOCKET_IO_KEY = 'codem-test-io'
