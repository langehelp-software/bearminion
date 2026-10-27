import { defineForm } from 'bearminion/forms'

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

export default defineForm(
  async (submission, { env }) => {
    // Both addresses live in the environment, so they are not in the repository. CONTACT_FROM has to be on a domain you
    // verified with Resend; CONTACT_TO is where the messages arrive.
    if (!env.CONTACT_FROM || !env.CONTACT_TO) throw new Error('Set CONTACT_FROM and CONTACT_TO in the environment.')
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: env.CONTACT_TO,
        reply_to: submission.email,
        subject: `New message from ${oneLine(submission.name ?? '')}`,
        text: `${submission.message}\n\nFrom: ${submission.name} <${submission.email}>\nTopic: ${submission.topic ?? '-'}\nPage: ${submission.page}`,
      }),
    })
    if (!response.ok) throw new Error(`Resend answered ${response.status}`)
  },
  { turnstile: true },
)
