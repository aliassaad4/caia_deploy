const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkVisit() {
  try {
    const visit = await prisma.appointment.findUnique({
      where: { id: '3d6217e8-dac2-42a9-a288-d20f0cbf755e' },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        visitSummary: true
      }
    });

    console.log('\n=== VISIT DETAILS ===');
    console.log('Patient:', visit.patient.firstName, visit.patient.lastName);
    console.log('Email:', visit.patient.email);
    console.log('Patient ID:', visit.patient.id);
    console.log('\n=== VISIT SUMMARY ===');
    console.log('Has visit summary:', !!visit.visitSummary);

    if (visit.visitSummary) {
      console.log('\nSummary ID:', visit.visitSummary.id);
      console.log('Created:', visit.visitSummary.createdAt);
      console.log('\nChief Complaint:', visit.visitSummary.chiefComplaint);
      console.log('\nHPI:', visit.visitSummary.hpi);
      console.log('\nAssessment:', visit.visitSummary.assessment);
      console.log('\nPlan:', visit.visitSummary.plan);

      if (visit.visitSummary.patientSummary) {
        console.log('\n=== PATIENT-FRIENDLY SUMMARY ===');
        console.log(visit.visitSummary.patientSummary);
      }
    } else {
      console.log('No visit summary found yet');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkVisit();
