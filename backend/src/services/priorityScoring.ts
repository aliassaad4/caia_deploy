// Priority Scoring Algorithm for Appointment Triage
// Based on symptom keywords and urgency indicators

const emergencyKeywords = [
  'chest pain',
  'shortness of breath',
  'severe bleeding',
  'unconscious',
  'stroke',
  'heart attack',
  'suicide',
  'severe head injury',
  'seizure',
  'severe burn',
];

const urgentKeywords = [
  'high fever',
  'severe pain',
  'difficulty breathing',
  'bleeding',
  'vomiting blood',
  'broken bone',
  'allergic reaction',
  'severe rash',
  'spreading infection',
];

const highPriorityKeywords = [
  'fever',
  'infection',
  'rash',
  'pain',
  'swelling',
  'flu symptoms',
  'acute',
  'sudden onset',
];

const mediumPriorityKeywords = [
  'follow-up',
  'chronic',
  'refill',
  'check-up',
  'monitoring',
  'medication adjustment',
];

export function calculatePriorityScore(text: string): number {
  const lowerText = text.toLowerCase();

  // Check for emergency keywords (9-10)
  for (const keyword of emergencyKeywords) {
    if (lowerText.includes(keyword)) {
      return 10;
    }
  }

  // Check for urgent keywords (7-8)
  for (const keyword of urgentKeywords) {
    if (lowerText.includes(keyword)) {
      return Math.max(7, Math.min(8, 7 + countSeverityModifiers(lowerText)));
    }
  }

  // Check for high priority keywords (5-6)
  for (const keyword of highPriorityKeywords) {
    if (lowerText.includes(keyword)) {
      return Math.max(5, Math.min(6, 5 + countSeverityModifiers(lowerText)));
    }
  }

  // Check for medium priority keywords (3-4)
  for (const keyword of mediumPriorityKeywords) {
    if (lowerText.includes(keyword)) {
      return 4;
    }
  }

  // Default low priority (1-3)
  return 3;
}

function countSeverityModifiers(text: string): number {
  const severityModifiers = ['severe', 'intense', 'extreme', 'unbearable', 'worst'];
  let count = 0;

  for (const modifier of severityModifiers) {
    if (text.includes(modifier)) {
      count++;
    }
  }

  return Math.min(count, 2); // Max +2 to priority
}

export function getPriorityLabel(score: number): string {
  if (score >= 9) return 'Emergency';
  if (score >= 7) return 'Urgent';
  if (score >= 5) return 'High';
  if (score >= 3) return 'Medium';
  return 'Low';
}

export function getRecommendedTimeframe(score: number): string {
  if (score >= 9) return 'Seek emergency care immediately';
  if (score >= 7) return 'Within 24-48 hours';
  if (score >= 5) return 'Within 3-7 days';
  if (score >= 3) return 'Within 7-14 days';
  return 'Within 2-4 weeks';
}
