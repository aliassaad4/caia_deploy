const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function fixPatientPassword() {
  try {
    console.log('🔍 Checking all patients in database...');
    const allPatients = await prisma.patient.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });

    console.log('\nFound patients:', allPatients.length);
    allPatients.forEach(p => {
      console.log(`  - ${p.firstName} ${p.lastName} (${p.email})`);
    });

    console.log('\n🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash('test123', 10);

    let patient = await prisma.patient.findUnique({
      where: { email: 'test.patient@clinic.com' }
    });

    if (!patient) {
      // Try to find the first patient
      patient = allPatients[0];

      if (patient) {
        console.log(`\n📝 Updating password for: ${patient.firstName} ${patient.lastName}`);
        await prisma.patient.update({
          where: { id: patient.id },
          data: { passwordHash: hashedPassword }
        });

        console.log('✅ Patient password updated successfully!');
        console.log('\n📋 Login Credentials:');
        console.log(`   Email: ${patient.email}`);
        console.log('   Password: test123');
      } else {
        console.log('\n❌ No patients found in database!');
        console.log('Run create-test-visit.js first to create a test patient.');
      }
    } else {
      console.log('\n📝 Updating patient password...');
      await prisma.patient.update({
        where: { id: patient.id },
        data: { passwordHash: hashedPassword }
      });

      console.log('✅ Patient password updated successfully!');
      console.log('\n📋 Login Credentials:');
      console.log('   Email: test.patient@clinic.com');
      console.log('   Password: test123');
    }

    console.log('\n🎯 You can now login as the patient!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixPatientPassword();
