// Jest setup file

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.JWT_SIGNING_KEY = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32bytes!!';

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
});

// Global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        mockPatient: () => any;
        mockDoctor: () => any;
      };
    }
  }
}

// Export test utilities
export const testUtils = {
  mockPatient: () => ({
    id: 'test-patient-id',
    email: 'patient@test.com',
    firstName: 'Test',
    lastName: 'Patient',
    dateOfBirth: new Date('1990-01-01'),
    phone: '555-123-4567',
  }),
  mockDoctor: () => ({
    id: 'test-doctor-id',
    email: 'doctor@test.com',
    firstName: 'Dr. Test',
    lastName: 'Doctor',
    specialty: 'General Practice',
  }),
};
