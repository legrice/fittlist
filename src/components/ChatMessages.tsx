// Presentational chat log. `mineIsCoach` flips which side is "mine": the coach
// inbox shows the coach's messages as mine; the visitor's page shows theirs.
import { ReportContentButton } from "@/components/ReportContentButton";

type Msg = { id: string; fromCoach: boolean; body: string; createdAt: Date | string };

export function ChatMessages({ messages, mineIsCoach, allowReports = false, allowBlocking = false, reportToken }: { messages: Msg[]; mineIsCoach: boolean; allowReports?: boolean; allowBlocking?: boolean; reportToken?: string }) {
  return (
    <div className="chat">
      {messages.map((m) => {
        const mine = mineIsCoach ? m.fromCoach : !m.fromCoach;
        return (
          <div key={m.id} className={`chatmsg ${mine ? "mine" : "theirs"}`}>
            <div className="chatbubble">{m.body}</div>
            {allowReports && !mine && m.body !== "[Removed by moderation]" && <ReportContentButton contentType="inquiry_message" contentId={m.id} label="Report message" canBlock={allowBlocking || !!reportToken} blockLabel="Also stop this conversation" token={reportToken} className="content-report-button chat-report-button" />}
          </div>
        );
      })}
    </div>
  );
}
