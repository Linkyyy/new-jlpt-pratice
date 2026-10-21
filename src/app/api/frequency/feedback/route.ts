import { submitFrequencyFeedback } from '@/lib/frequency-feedback.server';
import { checkFrequencyAccess } from '@/lib/frequency-access.server';

export function POST(request: Request) {
  return checkFrequencyAccess(request) ?? submitFrequencyFeedback(request);
}
