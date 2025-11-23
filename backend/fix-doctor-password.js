const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function fixDoctorPassword() {
  try {
    console.log('🔍 Checking all doctors in database...');
    const allDoctors = await prisma.provider.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        specialty: true
      }
    });

    console.log('\nFound doctors:', allDoctors.length);
    allDoctors.forEach(d => {
      console.log(`  - Dr. ${d.firstName} ${d.lastName} (${d.email}) - ${d.specialty}`);
    });

    console.log('\n🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash('test123', 10);

    let doctor = await prisma.provider.findUnique({
      where: { email: 'doctor@clinic.com' }
    });

    if (!doctor) {
      // Try to find the first doctor
      doctor = allDoctors[0];

      if (doctor) {
        console.log(`\n📝 Updating password for: Dr. ${doctor.firstName} ${doctor.lastName}`);
        await prisma.provider.update({
          where: { id: doctor.id },
          data: { passwordHash: hashedPassword }
        });

        console.log('✅ Doctor password updated successfully!');
        console.log('\n📋 Login Credentials:');
        console.log(`   Email: ${doctor.email}`);
        console.log('   Password: test123');
      } else {
        console.log('\n❌ No doctors found in database!');
        console.log('Run create-test-visit.js first to create a test doctor.');
      }
    } else {
      console.log('\n📝 Updating doctor password...');
      await prisma.provider.update({
        where: { id: doctor.id },
        data: { passwordHash: hashedPassword }
      });

      console.log('✅ Doctor password updated successfully!');
      console.log('\n📋 Login Credentials:');
      console.log('   Email: doctor@clinic.com');
      console.log('   Password: test123');
    }

    console.log('\n🎯 You can now login as the doctor!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixDoctorPassword();
