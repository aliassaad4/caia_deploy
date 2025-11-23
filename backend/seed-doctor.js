const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Creating pre-registered doctor account...');

  // Check if doctor already exists
  const existingDoctor = await prisma.provider.findUnique({
    where: { email: 'doctor@caia.clinic' },
  });

  if (existingDoctor) {
    console.log('Doctor already exists!');
    console.log('Email: doctor@caia.clinic');
    console.log('Password: doctor123');
    return;
  }

  // Create doctor with pre-hashed password (doctor123)
  const doctor = await prisma.provider.create({
    data: {
      email: 'doctor@caia.clinic',
      passwordHash: '$2b$10$JuiSDaWTJfXnj.kHj4iI1.dwLjl9im9CAeOybeCvvia7WWoWjCZK6',
      firstName: 'John',
      lastName: 'Smith',
      specialty: 'Internal Medicine',
      licenseNumber: 'MD12345',
    },
  });

  console.log('✅ Doctor account created successfully!');
  console.log('');
  console.log('Doctor Credentials:');
  console.log('===================');
  console.log('Email: doctor@caia.clinic');
  console.log('Password: doctor123');
  console.log('Name: Dr. John Smith');
  console.log('Specialty: Internal Medicine');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
