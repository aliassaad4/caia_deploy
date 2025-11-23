import { Resend } from 'resend';

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@caiaclinic.com';
const FROM_NAME = process.env.FROM_NAME || 'CAIA Clinic';

interface WelcomeEmailParams {
  to: string;
  firstName: string;
  lastName: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send welcome email to newly registered patient
 */
export const sendWelcomeEmail = async ({
  to,
  firstName,
  lastName,
}: WelcomeEmailParams): Promise<EmailResult> => {
  try {
    const html = generateWelcomeEmailHTML(firstName, lastName);

    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject: `Welcome to CAIA Clinic, ${firstName}!`,
      html: html,
    });

    if (error) {
      console.error('❌ Failed to send welcome email:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log(`✅ Welcome email sent to ${to}, ID: ${data?.id}`);
    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error: any) {
    console.error('❌ Error sending welcome email:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
};

/**
 * Generate HTML content for welcome email
 */
const generateWelcomeEmailHTML = (firstName: string, lastName: string): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to CAIA Clinic</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                Welcome to CAIA Clinic
              </h1>
              <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">
                Your AI-Powered Healthcare Assistant
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #333333; font-size: 22px;">
                Hello ${firstName} ${lastName}! 👋
              </h2>

              <p style="margin: 0 0 20px; color: #555555; font-size: 16px; line-height: 1.6;">
                Thank you for registering with CAIA Clinic. We're excited to have you join our community of patients who benefit from AI-assisted healthcare management.
              </p>

              <p style="margin: 0 0 20px; color: #555555; font-size: 16px; line-height: 1.6;">
                With your new account, you can:
              </p>

              <!-- Features List -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
                    <span style="color: #667eea; font-size: 18px; margin-right: 10px;">💬</span>
                    <span style="color: #333333; font-size: 15px;">Chat with our AI assistant for health guidance</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
                    <span style="color: #667eea; font-size: 18px; margin-right: 10px;">📅</span>
                    <span style="color: #333333; font-size: 15px;">Schedule appointments with your doctor</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #eee;">
                    <span style="color: #667eea; font-size: 18px; margin-right: 10px;">📁</span>
                    <span style="color: #333333; font-size: 15px;">Upload and manage your medical files</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0;">
                    <span style="color: #667eea; font-size: 18px; margin-right: 10px;">🔔</span>
                    <span style="color: #333333; font-size: 15px;">Receive appointment reminders and updates</span>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}"
                       style="display: inline-block; padding: 14px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Go to Your Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Getting Started -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-top: 20px;">
                <h3 style="margin: 0 0 10px; color: #333333; font-size: 16px;">
                  🚀 Getting Started
                </h3>
                <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.5;">
                  Start by chatting with our AI assistant to ask health questions, or schedule your first appointment with Dr. John Smith. If you need any help, our support team is always here for you.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0 0 10px; color: #888888; font-size: 14px;">
                Need help? Contact us at support@caiaclinic.com
              </p>
              <p style="margin: 0; color: #aaaaaa; font-size: 12px;">
                © ${new Date().getFullYear()} CAIA Clinic. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

export default {
  sendWelcomeEmail,
};
