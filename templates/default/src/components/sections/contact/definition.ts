import { z } from "zod";
import {
  defineSection,
  richTextSchema,
  textSchema,
  withEmphasis,
} from "bearminion";
import { accent, eyebrow, heading } from "../shared";
import { contactWireframe } from "./wireframe";

export const contactVariants = ["split", "card", "minimal"] as const;

export const contactDetailSchema = z
  .object({
    label: textSchema,
    value: textSchema,
    // The built page carries the value scrambled and a few lines of script show it, so a crawler that only reads the HTML finds none.
    hideFromCrawlers: z.boolean().optional(),
  })
  .strict();

export const contactSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  details: z.array(contactDetailSchema),
  topics: z.array(textSchema),
  note: richTextSchema.optional(),
  thanks: richTextSchema.optional(),
});

export type ContactDetail = z.infer<typeof contactDetailSchema>;
export type ContactProps = z.infer<typeof contactSchema>;

export const contact = defineSection({
  type: "contact",
  label: "Contact",
  description: "Contact details beside a form.",
  guide: `
    Use it so visitors can reach you and send a message. Keep the details to the three that matter, such as email, phone or hours, and the topics to the choices that help you route a message. Use the note to set an expectation ("We reply within two working days"), and thanks to say what happens next.

    Pick split when the details and the form should sit side by side. Pick card when the details live elsewhere, such as the footer, and the form is the point. Pick minimal for a calm page with a few fields.

    The form posts to /api/contact, so the site needs a handler in src/forms/contact.ts before it goes live: run npx bearminion check form. Turn on Hide from crawlers for an email address or phone number you do not want scraped; it is obfuscation, not encryption.
  `,
  schema: contactSchema,
  defaults: {
    eyebrow: "Contact",
    heading: "Get in touch.",
    marks: accent("Get in touch.", "in touch."),
    body: "Tell people what they can contact you about and when they will hear back.",
    details: [
      { label: "Email", value: "hello@example.com", hideFromCrawlers: false },
    ],
    topics: ["General"],
    note: "We only use your details to reply to you.",
    thanks: "Thanks, your message is on its way.",
  },
  variants: contactVariants,
  defaultVariant: "split",
  // The form posts to /api/contact: the handler is `src/forms/contact.ts`, written in code, never configured here.
  form: "contact",
  optional: {
    props: ["eyebrow", "heading", "body", "note", "thanks"],
    items: { details: ["hideFromCrawlers"] },
  },
  counts: { details: { recommended: 3 }, topics: { recommended: 3 } },
  wireframe: contactWireframe,
});
