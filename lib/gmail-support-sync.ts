import { listUnreadInboxMessageIds, getSupportEmail, createDraftReply } from "@/lib/gmail";
import { embedQuery, matchKnowledge, composeAnswer, buildSupportReplySystemPrompt } from "@/lib/rag";

export interface GmailSyncResult {
  checked: number;
  drafted: number;
  skippedAlreadyProcessed: number;
  errors: string[];
}

/**
 * Fires on Vercel's cron schedule (see app/api/cron/gmail-draft-replies).
 * For each unread inbox message not already in support.tickets: reads it,
 * looks up relevant knowledge, drafts a reply with Alina, saves the
 * ticket, and creates a real Gmail draft on that thread for a human to
 * review and send. Never calls Gmail's send endpoint.
 */
export async function syncGmailSupportDrafts(supabase: any): Promise<GmailSyncResult> {
  const result: GmailSyncResult = { checked: 0, drafted: 0, skippedAlreadyProcessed: 0, errors: [] };

  const messages = await listUnreadInboxMessageIds();
  result.checked = messages.length;
  if (messages.length === 0) return result;

  const { data: existing, error: existingError } = await supabase
    .schema("support")
    .from("tickets")
    .select("gmail_message_id")
    .in("gmail_message_id", messages.map((m) => m.id));
  if (existingError) {
    result.errors.push(`couldn't check existing tickets — ${existingError.message}`);
    return result;
  }
  const alreadyProcessed = new Set((existing ?? []).map((r: { gmail_message_id: string }) => r.gmail_message_id));

  for (const { id } of messages) {
    if (alreadyProcessed.has(id)) {
      result.skippedAlreadyProcessed++;
      continue;
    }

    try {
      const email = await getSupportEmail(id);
      if (!email.bodyText.trim()) {
        result.errors.push(`${id}: no readable body, skipped`);
        continue;
      }

      const embedding = await embedQuery(email.bodyText);
      const context = await matchKnowledge(supabase, "assistant", embedding, 6);
      const draftedReply = await composeAnswer({
        systemPrompt: buildSupportReplySystemPrompt(),
        context,
        history: [],
        question: email.bodyText,
      });

      const { error: insertError } = await supabase
        .schema("support")
        .from("tickets")
        .insert({
          question: email.bodyText,
          customer_email: email.fromEmail,
          customer_name: email.fromName,
          subject: email.subject,
          drafted_reply: draftedReply,
          status: "open",
          gmail_message_id: email.messageId,
          gmail_thread_id: email.threadId,
          embedding,
        });
      if (insertError) throw new Error(`couldn't save ticket — ${insertError.message}`);

      await createDraftReply({
        threadId: email.threadId,
        inReplyToRfc822MessageId: email.rfc822MessageId,
        to: email.fromEmail,
        subject: email.subject,
        bodyText: draftedReply,
      });

      result.drafted++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${id}: ${message}`);
    }
  }

  return result;
}
