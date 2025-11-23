const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Creating patient account...');

  // Check if patient already exists
  const existingPatient = await prisma.patient.findUnique({
    where: { email: 'a.a@a' },
  });

  if (existingPatient) {
    console.log('Patient already exists!');
    console.log('Email: a.a@a');
    console.log('Password: 1');
    return;
  }

  // Hash the password
  const passwordHash = await bcrypt.hash('1', 10);

  // Create patient
  const patient = await prisma.patient.create({
    data: {
      email: 'a.a@a',
      passwordHash: passwordHash,
      firstName: 'Test',
      lastName: 'Patient',
    },
  });

  console.log('✅ Patient account created successfully!');
  console.log('');
  console.log('Patient Credentials:');
  console.log('===================');
  console.log('Email: a.a@a');
  console.log('Password: 1');
  console.log('Name: Test Patient');
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
