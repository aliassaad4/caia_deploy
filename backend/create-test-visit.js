const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTestVisit() {
  try {
    console.log('🔍 Checking for existing data...');

    // Get or create a patient
    let patient = await prisma.patient.findFirst();

    if (!patient) {
      console.log('📝 Creating test patient...');
      patient = await prisma.patient.create({
        data: {
          email: 'test.patient@clinic.com',
          passwordHash: 'test123', // In production, this should be hashed
          firstName: 'Test',
          lastName: 'Patient',
          phone: '+1234567890',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'Other',
        },
      });
      console.log('✅ Patient created:', patient.firstName, patient.lastName);
    } else {
      console.log('✅ Using existing patient:', patient.firstName, patient.lastName);
    }

    // Get or create a doctor
    let doctor = await prisma.provider.findFirst();

    if (!doctor) {
      console.log('📝 Creating test doctor...');
      doctor = await prisma.provider.create({
        data: {
          email: 'doctor@clinic.com',
          passwordHash: 'test123', // In production, this should be hashed
          firstName: 'John',
          lastName: 'Smith',
          specialty: 'General Practice',
        },
      });
      console.log('✅ Doctor created:', doctor.firstName, doctor.lastName);
    } else {
      console.log('✅ Using existing doctor:', doctor.firstName, doctor.lastName);
    }

    // Create today's appointment
    const today = new Date();
    today.setHours(12, 0, 0, 0); // Set to 12:00 PM today

    console.log('📅 Creating appointment for today...');
    const visit = await prisma.visit.create({
      data: {
        patientId: patient.id,
        providerId: doctor.id,
        scheduledAt: today,
        status: 'SCHEDULED',
        visitType: 'follow_up',
        reasonForVisit: 'Headache and fever - test visit',
        durationMinutes: 30,
        priorityScore: 7,
      },
    });

    console.log('✅ Appointment created successfully!');
    console.log('📋 Visit Details:');
    console.log('   - Patient:', patient.firstName, patient.lastName);
    console.log('   - Doctor:', doctor.firstName, doctor.lastName);
    console.log('   - Time:', visit.scheduledAt.toLocaleString());
    console.log('   - Reason:', visit.reasonForVisit);
    console.log('   - Visit ID:', visit.id);
    console.log('');
    console.log('🎯 Now refresh your Doctor Dashboard and go to "Today\'s Patients" tab!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestVisit();
